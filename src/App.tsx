import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@shinederu/auth-react";
import { LoaderCircle, LogOut, Power } from "lucide-react";
import { LoginPanel } from "@/components/LoginPanel";
import { wakeApi } from "@/lib/api";
import type { WakeDevice, WakeStatus } from "@/types/api";

type NoticeState = {
  kind: "error" | "info" | "success";
  text: string;
} | null;

type PendingActionKind = "shutdown" | "wake";

type PendingAction = {
  kind: PendingActionKind;
  startedAt: number;
};

type PendingActions = Record<number, PendingAction>;

const AUTO_REFRESH_INTERVAL_MS = 15_000;
const TRANSITION_REFRESH_INTERVAL_MS = 3_000;
const TRANSITION_TIMEOUT_MS = 120_000;
const PENDING_STORAGE_KEY = "shinedewake.pending-actions.v1";

const ANONYMOUS_STATUS: WakeStatus = {
  authenticated: false,
  can_wake: false,
  can_shutdown: false,
  can_manage: false,
  can_manage_devices: false,
  can_manage_users: false,
  is_global_admin: false,
  user: null,
};

const readPendingActions = (): PendingActions => {
  try {
    const storedValue = window.localStorage.getItem(PENDING_STORAGE_KEY);
    if (!storedValue) {
      return {};
    }

    const parsedValue = JSON.parse(storedValue) as Record<string, Partial<PendingAction>>;
    const now = Date.now();

    return Object.fromEntries(
      Object.entries(parsedValue).flatMap(([deviceId, action]) => {
        const numericDeviceId = Number(deviceId);
        const isValidKind = action.kind === "wake" || action.kind === "shutdown";
        const age = typeof action.startedAt === "number" ? now - action.startedAt : -1;
        const isRecent = age >= 0 && age < TRANSITION_TIMEOUT_MS;

        return Number.isInteger(numericDeviceId) && isValidKind && isRecent
          ? [[numericDeviceId, { kind: action.kind as PendingActionKind, startedAt: action.startedAt as number }]]
          : [];
      })
    );
  } catch {
    return {};
  }
};

const getPendingLabel = (kind: PendingActionKind): string => {
  return kind === "wake" ? "Démarrage…" : "Extinction…";
};

const hasActiveShutdown = (device: WakeDevice): boolean => {
  return device.power_state !== "offline" && (device.agent?.active_shutdown_jobs.length ?? 0) > 0;
};

const getShutdownUnavailableLabel = (
  device: WakeDevice,
  canShutdown: boolean
): string | null => {
  if (!canShutdown) {
    return "Extinction non autorisée";
  }

  if (!device.corelink_machine_key || !device.agent) {
    return "Aucun agent lié";
  }

  if (!device.agent.is_online) {
    return "Agent hors ligne";
  }

  return null;
};

function App() {
  const auth = useAuth();
  const [status, setStatus] = useState<WakeStatus | null>(null);
  const [devices, setDevices] = useState<WakeDevice[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [confirmDevice, setConfirmDevice] = useState<WakeDevice | null>(null);
  const [pendingActions, setPendingActions] = useState<PendingActions>(readPendingActions);
  const [isWakeConnected, setIsWakeConnected] = useState(false);
  const isLoadingDataRef = useRef(false);
  const pendingActionsRef = useRef(pendingActions);
  const appContentRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const logoutButtonRef = useRef<HTMLButtonElement>(null);
  const modalTriggerRef = useRef<HTMLButtonElement | null>(null);

  const isAuthenticated = status?.authenticated ?? false;
  const canWake = status?.can_wake ?? false;
  const canShutdown = status?.can_shutdown ?? false;
  const confirmDeviceId = confirmDevice?.id ?? null;

  const visibleDevices = useMemo(
    () =>
      devices
        .filter((device) => device.is_enabled)
        .sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }

          return left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
        }),
    [devices]
  );

  const storePendingActions = useCallback((nextActions: PendingActions) => {
    pendingActionsRef.current = nextActions;
    setPendingActions(nextActions);
  }, []);

  const reconcilePendingActions = useCallback(
    (nextDevices: WakeDevice[]) => {
      const now = Date.now();
      const devicesById = new Map(nextDevices.map((device) => [device.id, device]));
      const nextActions: PendingActions = {};
      let hasTimedOut = false;

      Object.entries(pendingActionsRef.current).forEach(([deviceId, action]) => {
        const device = devicesById.get(Number(deviceId));
        if (!device) {
          return;
        }

        const targetStateReached =
          (action.kind === "wake" && device.power_state === "online") ||
          (action.kind === "shutdown" && device.power_state === "offline");

        if (targetStateReached) {
          return;
        }

        if (now - action.startedAt >= TRANSITION_TIMEOUT_MS) {
          hasTimedOut = true;
          return;
        }

        nextActions[device.id] = action;
      });

      storePendingActions(nextActions);

      if (hasTimedOut) {
        setNotice({
          kind: "error",
          text: "La machine ne répond pas encore. Son état a été réinitialisé.",
        });
      }
    },
    [storePendingActions]
  );

  const loadData = useCallback(
    async (showErrors = true): Promise<boolean> => {
      if (isLoadingDataRef.current) {
        return false;
      }

      isLoadingDataRef.current = true;

      try {
        const statusResponse = await wakeApi.getStatus();

        if (!statusResponse.ok || !statusResponse.data) {
          setIsWakeConnected(false);
          if (showErrors) {
            setNotice({
              kind: "error",
              text: statusResponse.error ?? "Impossible de joindre Wake.",
            });
          }
          return false;
        }

        setStatus(statusResponse.data);

        if (!statusResponse.data.authenticated || !statusResponse.data.can_wake) {
          setDevices([]);
          storePendingActions({});
          setIsWakeConnected(true);
          return true;
        }

        const devicesResponse = await wakeApi.listDevices();

        if (!devicesResponse.ok || !devicesResponse.data) {
          setIsWakeConnected(false);
          if (showErrors) {
            setNotice({
              kind: "error",
              text: devicesResponse.error ?? "Impossible de charger les machines.",
            });
          }
          return false;
        }

        setDevices(devicesResponse.data);
        reconcilePendingActions(devicesResponse.data);
        setIsWakeConnected(true);
        return true;
      } finally {
        isLoadingDataRef.current = false;
        setIsBooting(false);
      }
    },
    [reconcilePendingActions, storePendingActions]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    try {
      if (Object.keys(pendingActions).length === 0) {
        window.localStorage.removeItem(PENDING_STORAGE_KEY);
      } else {
        window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pendingActions));
      }
    } catch {
      // Local persistence is optional; the API remains the source of truth.
    }
  }, [pendingActions]);

  useEffect(() => {
    if (!isAuthenticated || !canWake) {
      return;
    }

    const hasServerTransition = devices.some(hasActiveShutdown);
    const refreshInterval =
      Object.keys(pendingActions).length > 0 || hasServerTransition
        ? TRANSITION_REFRESH_INTERVAL_MS
        : AUTO_REFRESH_INTERVAL_MS;

    const refreshSilently = () => {
      if (document.visibilityState === "visible") {
        void loadData(false);
      }
    };

    const intervalId = window.setInterval(refreshSilently, refreshInterval);
    document.addEventListener("visibilitychange", refreshSilently);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshSilently);
    };
  }, [canWake, devices, isAuthenticated, loadData, pendingActions]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (!confirmDevice) {
      return;
    }

    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingActionsRef.current[confirmDevice.id]) {
          setConfirmDevice(null);
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      if (event.shiftKey && document.activeElement === cancelButtonRef.current) {
        event.preventDefault();
        confirmButtonRef.current?.focus();
      } else if (!event.shiftKey && document.activeElement === confirmButtonRef.current) {
        event.preventDefault();
        cancelButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => {
        const trigger = modalTriggerRef.current;
        if (trigger?.isConnected && !trigger.disabled) {
          trigger.focus();
        } else {
          logoutButtonRef.current?.focus();
        }
        modalTriggerRef.current = null;
      });
    };
  }, [confirmDeviceId]);

  useEffect(() => {
    const appContent = appContentRef.current;
    if (!appContent) {
      return;
    }

    if (confirmDevice) {
      appContent.setAttribute("inert", "");
    } else {
      appContent.removeAttribute("inert");
    }

    return () => appContent.removeAttribute("inert");
  }, [confirmDeviceId]);

  useEffect(() => {
    if (!confirmDevice) {
      return;
    }

    const currentDevice = devices.find((device) => device.id === confirmDevice.id);
    const confirmationIsObsolete =
      !isAuthenticated ||
      !canWake ||
      !isWakeConnected ||
      !currentDevice ||
      currentDevice.power_state !== "online" ||
      hasActiveShutdown(currentDevice) ||
      Boolean(getShutdownUnavailableLabel(currentDevice, canShutdown));

    if (confirmationIsObsolete) {
      setConfirmDevice(null);
    }
  }, [canShutdown, canWake, confirmDevice, devices, isAuthenticated, isWakeConnected]);

  const handleLogin = async (username: string, password: string) => {
    if (!username || !password) {
      setLoginError("Le pseudo/email et le mot de passe sont obligatoires.");
      return;
    }

    setIsAuthenticating(true);
    setLoginError(null);

    try {
      const response = await auth.login({ username, password });
      if (!response.ok) {
        setLoginError(response.error ?? "Connexion refusée.");
        return;
      }

      const didLoadWake = await loadData();
      if (!didLoadWake) {
        setLoginError("Connexion réussie, mais Wake est momentanément inaccessible.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    setConfirmDevice(null);
    try {
      await auth.logout();
    } finally {
      setStatus(ANONYMOUS_STATUS);
      setDevices([]);
      storePendingActions({});
    }
  };

  const handleWake = async (device: WakeDevice) => {
    const nextActions = {
      ...pendingActionsRef.current,
      [device.id]: { kind: "wake" as const, startedAt: Date.now() },
    };
    storePendingActions(nextActions);

    const response = await wakeApi.wakeDevice(device.id);

    if (!response.ok) {
      const actionsAfterFailure = { ...pendingActionsRef.current };
      delete actionsAfterFailure[device.id];
      storePendingActions(actionsAfterFailure);
      if (response.status === 0) {
        setIsWakeConnected(false);
      }
      setNotice({ kind: "error", text: response.error ?? "Le réveil a échoué." });
      await loadData(false);
      return;
    }

    setNotice({ kind: "success", text: `Démarrage de ${device.name} demandé.` });
    await loadData(false);
  };

  const handleMachineClick = (device: WakeDevice, trigger: HTMLButtonElement) => {
    if (!isWakeConnected) {
      return;
    }

    const serverShutdownPending = hasActiveShutdown(device);
    if (pendingActionsRef.current[device.id] || serverShutdownPending) {
      return;
    }

    if (device.power_state === "offline") {
      if (!canWake) {
        setNotice({ kind: "error", text: "Tu n'as pas le droit de réveiller cette machine." });
        return;
      }

      void handleWake(device);
      return;
    }

    if (device.power_state !== "online") {
      setNotice({ kind: "info", text: `L'état de ${device.name} est encore indéterminé.` });
      return;
    }

    if (getShutdownUnavailableLabel(device, canShutdown)) {
      return;
    }

    modalTriggerRef.current = trigger;
    setConfirmDevice(device);
  };

  const handleShutdownConfirmed = async () => {
    if (!confirmDevice) {
      return;
    }

    const device = devices.find((candidate) => candidate.id === confirmDevice.id);
    const shutdownIsStillAvailable =
      isAuthenticated &&
      canWake &&
      isWakeConnected &&
      device?.power_state === "online" &&
      !hasActiveShutdown(device) &&
      !getShutdownUnavailableLabel(device, canShutdown);

    if (!device || !shutdownIsStillAvailable) {
      setConfirmDevice(null);
      setNotice({
        kind: "info",
        text: "L'état de la machine a changé. L'extinction n'a pas été envoyée.",
      });
      return;
    }

    const nextActions = {
      ...pendingActionsRef.current,
      [device.id]: { kind: "shutdown" as const, startedAt: Date.now() },
    };
    storePendingActions(nextActions);
    setConfirmDevice(null);

    const response = await wakeApi.shutdownDevice(device.id);

    if (!response.ok) {
      const actionsAfterFailure = { ...pendingActionsRef.current };
      delete actionsAfterFailure[device.id];
      storePendingActions(actionsAfterFailure);
      if (response.status === 0) {
        setIsWakeConnected(false);
      }
      setNotice({ kind: "error", text: response.error ?? "L'extinction a échoué." });
      await loadData(false);
      return;
    }

    setNotice({ kind: "success", text: `Extinction de ${device.name} demandée.` });
    await loadData(false);
  };

  if (isBooting) {
    return (
      <main className="wake-screen centered-screen" aria-label="Chargement de Wake">
        <LoaderCircle className="loading-spinner" aria-hidden="true" />
        <span className="sr-only">Chargement…</span>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="wake-screen centered-screen">
        <section className="message-panel">
          <h1>Wake est inaccessible</h1>
          <p>Vérifie ta connexion puis réessaie.</p>
          <button type="button" className="secondary-button" onClick={() => void loadData()}>
            Réessayer
          </button>
        </section>
        {notice ? <Notice notice={notice} /> : null}
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="wake-screen centered-screen">
        <LoginPanel isBusy={isAuthenticating} error={loginError} onSubmit={handleLogin} />
        {notice ? <Notice notice={notice} /> : null}
      </main>
    );
  }

  if (!canWake) {
    return (
      <main className="wake-screen centered-screen">
        <section className="message-panel">
          <h1>Accès refusé</h1>
          <p>Ce compte n'a pas accès aux machines Wake.</p>
          <button type="button" className="secondary-button" onClick={() => void handleLogout()}>
            Se déconnecter
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="wake-screen machine-screen">
      <h1 className="sr-only">ShinedeWake</h1>

      <div className="wake-content" ref={appContentRef}>
        <button
          ref={logoutButtonRef}
          type="button"
          className="logout-button"
          onClick={() => void handleLogout()}
          aria-label="Se déconnecter"
          title="Se déconnecter"
        >
          <LogOut aria-hidden="true" />
        </button>

        {!isWakeConnected ? (
          <p className="connection-banner" role="status">
            Connexion à Wake perdue — commandes désactivées.
          </p>
        ) : null}

        {visibleDevices.length > 0 ? (
          <section className="machine-grid" aria-label="Machines">
            {visibleDevices.map((device) => {
              const storedAction = pendingActions[device.id];
              const serverShutdownPending = hasActiveShutdown(device);
              const pendingKind = storedAction?.kind ?? (serverShutdownPending ? "shutdown" : null);
              const visualState = pendingKind
                ? "pending"
                : device.power_state === "online"
                  ? "online"
                  : device.power_state === "offline"
                    ? "offline"
                    : "unknown";
              const shutdownUnavailableLabel =
                device.power_state === "online"
                  ? getShutdownUnavailableLabel(device, canShutdown)
                  : null;
              const stateLabel = pendingKind
                ? getPendingLabel(pendingKind)
                : device.power_state === "online"
                  ? `Allumé · ${shutdownUnavailableLabel ?? "Éteindre"}`
                  : device.power_state === "offline"
                    ? "Éteint · Allumer"
                    : "État inconnu";
              const isDisabled =
                !isWakeConnected ||
                visualState === "pending" ||
                visualState === "unknown" ||
                Boolean(shutdownUnavailableLabel);
              const accessibleStateLabel = !isWakeConnected
                ? `${stateLabel} · Connexion à Wake perdue`
                : stateLabel;

              return (
                <button
                  key={device.id}
                  type="button"
                  className={`machine-button machine-${visualState}`}
                  disabled={isDisabled}
                  onClick={(event) => handleMachineClick(device, event.currentTarget)}
                  aria-label={`${device.name} — ${accessibleStateLabel}`}
                >
                  {visualState === "pending" ? (
                    <LoaderCircle className="machine-icon loading-spinner" aria-hidden="true" />
                  ) : (
                    <Power className="machine-icon" aria-hidden="true" />
                  )}
                  <strong>{device.name}</strong>
                  <span>{stateLabel}</span>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="message-panel empty-panel">
            <h2>Aucune machine</h2>
            <p>Aucune machine active n'est disponible.</p>
          </section>
        )}

        {notice ? <Notice notice={notice} /> : null}
      </div>

      {confirmDevice ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pendingActions[confirmDevice.id]) {
              setConfirmDevice(null);
            }
          }}
        >
          <section
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="shutdown-title"
            aria-describedby="shutdown-description"
          >
            <Power className="modal-icon" aria-hidden="true" />
            <h2 id="shutdown-title">Éteindre {confirmDevice.name} ?</h2>
            <p id="shutdown-description">Êtes-vous sûr de vouloir éteindre cet ordinateur ?</p>
            <div className="modal-actions">
              <button
                ref={cancelButtonRef}
                type="button"
                className="secondary-button"
                disabled={Boolean(pendingActions[confirmDevice.id])}
                onClick={() => setConfirmDevice(null)}
              >
                Non
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className="danger-button"
                disabled={Boolean(pendingActions[confirmDevice.id])}
                onClick={() => void handleShutdownConfirmed()}
              >
                {pendingActions[confirmDevice.id] ? "Extinction…" : "Oui, éteindre"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

const Notice = ({ notice }: { notice: Exclude<NoticeState, null> }) => (
  <div className={`toast toast-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
    {notice.text}
  </div>
);

export default App;
