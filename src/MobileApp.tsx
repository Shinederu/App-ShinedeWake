import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@shinederu/auth-react";
import { LoaderCircle, LogOut, Power } from "lucide-react";
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
const PENDING_STORAGE_KEY = "shinedewake.mobile.pending-actions.v1";

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
          ? [
              [
                numericDeviceId,
                {
                  kind: action.kind as PendingActionKind,
                  startedAt: action.startedAt as number,
                },
              ],
            ]
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

  if (!device.corelink_machine_key.trim() || !device.agent) {
    return "Aucun agent lié";
  }

  if (!device.agent.is_online) {
    return "Agent hors ligne";
  }

  return null;
};

function MobileApp() {
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
  const activeLoadIdRef = useRef<number | null>(null);
  const loadSequenceRef = useRef(0);
  const requestEpochRef = useRef(0);
  const pendingActionsRef = useRef(pendingActions);
  const authorizedDeviceIdsRef = useRef(new Set<number>());
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

  const invalidateInFlightRequests = useCallback(() => {
    requestEpochRef.current += 1;
    activeLoadIdRef.current = null;
  }, []);

  const showAnonymousState = useCallback(
    (message: string | null = null) => {
      setConfirmDevice(null);
      setStatus(ANONYMOUS_STATUS);
      setDevices([]);
      authorizedDeviceIdsRef.current.clear();
      storePendingActions({});
      setIsWakeConnected(true);
      setLoginError(message);
    },
    [storePendingActions]
  );

  const pruneExpiredPendingActions = useCallback(() => {
    const now = Date.now();
    const nextActions = Object.fromEntries(
      Object.entries(pendingActionsRef.current).filter(
        ([, action]) => now - action.startedAt < TRANSITION_TIMEOUT_MS
      )
    ) as PendingActions;

    if (Object.keys(nextActions).length === Object.keys(pendingActionsRef.current).length) {
      return;
    }

    storePendingActions(nextActions);
    setNotice({
      kind: "error",
      text: "La machine ne répond pas encore. Son état a été réinitialisé.",
    });
  }, [storePendingActions]);

  const reconcilePendingActions = useCallback(
    (nextDevices: WakeDevice[]) => {
      const devicesById = new Map(nextDevices.map((device) => [device.id, device]));
      const nextActions: PendingActions = {};

      Object.entries(pendingActionsRef.current).forEach(([deviceId, action]) => {
        const device = devicesById.get(Number(deviceId));
        if (!device) {
          return;
        }

        const targetStateReached =
          (action.kind === "wake" && device.power_state === "online") ||
          (action.kind === "shutdown" && device.power_state === "offline");

        if (!targetStateReached) {
          nextActions[device.id] = action;
        }
      });

      storePendingActions(nextActions);
    },
    [storePendingActions]
  );

  const loadData = useCallback(
    async (showErrors = true, reportLoginErrors = false): Promise<boolean> => {
      if (activeLoadIdRef.current !== null) {
        if (reportLoginErrors) {
          setLoginError("Wake termine déjà une vérification. Réessaie dans un instant.");
        }
        return false;
      }

      const loadId = ++loadSequenceRef.current;
      const requestEpoch = requestEpochRef.current;
      const isCurrentLoad = () =>
        requestEpochRef.current === requestEpoch && activeLoadIdRef.current === loadId;

      activeLoadIdRef.current = loadId;
      pruneExpiredPendingActions();

      try {
        const statusResponse = await wakeApi.getStatus();
        if (!isCurrentLoad()) {
          return false;
        }

        if (!statusResponse.ok || !statusResponse.data) {
          if (statusResponse.status === 401) {
            showAnonymousState(
              reportLoginErrors ? "Connexion réussie, mais Wake n’a pas reconnu la session." : null
            );
            return !reportLoginErrors;
          }

          if (statusResponse.status === 403) {
            setDevices([]);
            authorizedDeviceIdsRef.current.clear();
            storePendingActions({});
            setConfirmDevice(null);
          }
          setIsWakeConnected(false);
          if (showErrors) {
            setNotice({
              kind: "error",
              text: statusResponse.error ?? "Impossible de joindre Wake.",
            });
          }
          if (reportLoginErrors) {
            setLoginError("Connexion réussie, mais Wake est momentanément inaccessible.");
          }
          return false;
        }

        setStatus(statusResponse.data);

        if (!statusResponse.data.authenticated) {
          setDevices([]);
          authorizedDeviceIdsRef.current.clear();
          storePendingActions({});
          setIsWakeConnected(true);
          if (reportLoginErrors) {
            setLoginError("Connexion réussie, mais Wake n’a pas reconnu la session.");
          }
          return !reportLoginErrors;
        }

        if (!statusResponse.data.can_wake) {
          setDevices([]);
          authorizedDeviceIdsRef.current.clear();
          storePendingActions({});
          setIsWakeConnected(true);
          return true;
        }

        const devicesResponse = await wakeApi.listDevices();
        if (!isCurrentLoad()) {
          return false;
        }

        if (!devicesResponse.ok || !devicesResponse.data) {
          if (devicesResponse.status === 401) {
            showAnonymousState("Ta session a expiré. Reconnecte-toi.");
            return false;
          }

          if (devicesResponse.status === 403 || devicesResponse.status === 404) {
            setDevices([]);
            authorizedDeviceIdsRef.current.clear();
            storePendingActions({});
            setConfirmDevice(null);
          }
          setIsWakeConnected(false);
          if (showErrors) {
            setNotice({
              kind: "error",
              text: devicesResponse.error ?? "Impossible de charger les machines.",
            });
          }
          if (reportLoginErrors) {
            setLoginError("Connexion réussie, mais les machines sont momentanément inaccessibles.");
          }
          return false;
        }

        authorizedDeviceIdsRef.current = new Set(devicesResponse.data.map((device) => device.id));
        setDevices(devicesResponse.data);
        reconcilePendingActions(devicesResponse.data);
        setIsWakeConnected(true);
        return true;
      } finally {
        if (activeLoadIdRef.current === loadId) {
          activeLoadIdRef.current = null;
          setIsBooting(false);
        }
      }
    },
    [pruneExpiredPendingActions, reconcilePendingActions, showAnonymousState, storePendingActions]
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
        setConfirmDevice(null);
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
    invalidateInFlightRequests();
    const loginEpoch = requestEpochRef.current;

    try {
      const response = await auth.login({ username, password });
      if (requestEpochRef.current !== loginEpoch) {
        return;
      }

      if (!response.ok) {
        setLoginError(response.error ?? "Connexion refusée.");
        return;
      }

      await loadData(false, true);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    invalidateInFlightRequests();
    setIsAuthenticating(true);
    showAnonymousState(null);
    try {
      await auth.logout();
    } finally {
      showAnonymousState(null);
      setIsAuthenticating(false);
    }
  };

  const handleWake = async (device: WakeDevice) => {
    const actionEpoch = requestEpochRef.current;
    storePendingActions({
      ...pendingActionsRef.current,
      [device.id]: { kind: "wake", startedAt: Date.now() },
    });

    const response = await wakeApi.wakeDevice(device.id);
    if (requestEpochRef.current !== actionEpoch || !authorizedDeviceIdsRef.current.has(device.id)) {
      return;
    }

    if (!response.ok) {
      const actionsAfterFailure = { ...pendingActionsRef.current };
      delete actionsAfterFailure[device.id];
      storePendingActions(actionsAfterFailure);
      if (response.status === 401) {
        invalidateInFlightRequests();
        showAnonymousState("Ta session a expiré. Reconnecte-toi.");
        return;
      }
      if (response.status === 403 || response.status === 404) {
        invalidateInFlightRequests();
        authorizedDeviceIdsRef.current.clear();
        setDevices([]);
        storePendingActions({});
        setConfirmDevice(null);
      }
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

    if (pendingActionsRef.current[device.id] || hasActiveShutdown(device)) {
      return;
    }

    if (device.power_state === "offline") {
      void handleWake(device);
      return;
    }

    if (
      device.power_state !== "online" ||
      getShutdownUnavailableLabel(device, canShutdown)
    ) {
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

    const actionEpoch = requestEpochRef.current;
    storePendingActions({
      ...pendingActionsRef.current,
      [device.id]: { kind: "shutdown", startedAt: Date.now() },
    });
    setConfirmDevice(null);

    const response = await wakeApi.shutdownDevice(device.id);
    if (requestEpochRef.current !== actionEpoch || !authorizedDeviceIdsRef.current.has(device.id)) {
      return;
    }

    if (!response.ok) {
      const actionsAfterFailure = { ...pendingActionsRef.current };
      delete actionsAfterFailure[device.id];
      storePendingActions(actionsAfterFailure);
      if (response.status === 401) {
        invalidateInFlightRequests();
        showAnonymousState("Ta session a expiré. Reconnecte-toi.");
        return;
      }
      if (response.status === 403 || response.status === 404) {
        invalidateInFlightRequests();
        authorizedDeviceIdsRef.current.clear();
        setDevices([]);
        storePendingActions({});
        setConfirmDevice(null);
      }
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
      <main className="mobile-wake-screen mobile-centered-screen" aria-label="Chargement de Wake">
        <LoaderCircle className="mobile-loading-spinner" aria-hidden="true" />
        <span className="mobile-sr-only">Chargement…</span>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="mobile-wake-screen mobile-centered-screen">
        <section className="mobile-message-panel">
          <h1>Wake est inaccessible</h1>
          <p>Vérifie ta connexion puis réessaie.</p>
          <button type="button" className="mobile-secondary-button" onClick={() => void loadData()}>
            Réessayer
          </button>
        </section>
        {notice ? <MobileNotice notice={notice} /> : null}
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="mobile-wake-screen mobile-centered-screen">
        <MobileLoginPanel
          isBusy={isAuthenticating}
          error={loginError}
          onSubmit={handleLogin}
        />
        {notice ? <MobileNotice notice={notice} /> : null}
      </main>
    );
  }

  if (!canWake) {
    return (
      <main className="mobile-wake-screen mobile-centered-screen">
        <section className="mobile-message-panel">
          <h1>Accès refusé</h1>
          <p>Aucun ordinateur n’est autorisé pour ce compte. Contacte un admin global pour obtenir un accès.</p>
          <button
            type="button"
            className="mobile-secondary-button"
            onClick={() => void handleLogout()}
          >
            Se déconnecter
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mobile-wake-screen mobile-machine-screen">
      <h1 className="mobile-sr-only">ShinedeWake Mobile</h1>

      <div className="mobile-wake-content" ref={appContentRef}>
        <button
          ref={logoutButtonRef}
          type="button"
          className="mobile-logout-button"
          onClick={() => void handleLogout()}
          aria-label="Se déconnecter"
          title="Se déconnecter"
        >
          <LogOut aria-hidden="true" />
        </button>

        {!isWakeConnected ? (
          <p className="mobile-connection-banner" role="status">
            Connexion à Wake perdue — commandes désactivées.
          </p>
        ) : null}

        {visibleDevices.length > 0 ? (
          <section className="mobile-machine-grid" aria-label="Machines">
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
                  className={`mobile-machine-button mobile-machine-${visualState}`}
                  disabled={isDisabled}
                  onClick={(event) => handleMachineClick(device, event.currentTarget)}
                  aria-label={`${device.name} — ${accessibleStateLabel}`}
                >
                  {visualState === "pending" ? (
                    <LoaderCircle
                      className="mobile-machine-icon mobile-loading-spinner"
                      aria-hidden="true"
                    />
                  ) : (
                    <Power className="mobile-machine-icon" aria-hidden="true" />
                  )}
                  <strong>{device.name}</strong>
                  <span aria-live="polite">{stateLabel}</span>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="mobile-message-panel mobile-empty-panel">
            <h2>Aucune machine</h2>
            <p>Aucun ordinateur autorisé et actif n’est disponible.</p>
          </section>
        )}

        {notice ? <MobileNotice notice={notice} /> : null}
      </div>

      {confirmDevice ? (
        <div
          className="mobile-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmDevice(null);
            }
          }}
        >
          <section
            className="mobile-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mobile-shutdown-title"
            aria-describedby="mobile-shutdown-description"
          >
            <Power className="mobile-modal-icon" aria-hidden="true" />
            <h2 id="mobile-shutdown-title">Éteindre {confirmDevice.name} ?</h2>
            <p id="mobile-shutdown-description">
              Êtes-vous sûr de vouloir éteindre cet ordinateur ?
            </p>
            <div className="mobile-modal-actions">
              <button
                ref={cancelButtonRef}
                type="button"
                className="mobile-secondary-button"
                onClick={() => setConfirmDevice(null)}
              >
                Non
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className="mobile-danger-button"
                onClick={() => void handleShutdownConfirmed()}
              >
                Oui, éteindre
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

type MobileLoginPanelProps = {
  isBusy: boolean;
  error: string | null;
  onSubmit: (username: string, password: string) => Promise<void>;
};

const MobileLoginPanel = ({ isBusy, error, onSubmit }: MobileLoginPanelProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(username.trim(), password);
  };

  return (
    <section className="mobile-login-panel">
      <div className="mobile-login-eyebrow">Connexion</div>
      <h1>ShinedeWake</h1>
      <p className="mobile-login-lede">Compte Shinederu requis.</p>

      <form className="mobile-login-form" onSubmit={handleSubmit}>
        <label>
          <span>Identifiant</span>
          <input
            type="text"
            autoComplete="username"
            placeholder="Pseudo ou email"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isBusy}
          />
        </label>

        <label>
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isBusy}
          />
        </label>

        <button
          type="submit"
          className="mobile-primary-button mobile-wide-button"
          disabled={isBusy}
        >
          {isBusy ? "Connexion…" : "Se connecter"}
        </button>
      </form>

      {error ? (
        <p className="mobile-login-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
};

const MobileNotice = ({ notice }: { notice: Exclude<NoticeState, null> }) => (
  <div
    className={`mobile-toast mobile-toast-${notice.kind}`}
    role={notice.kind === "error" ? "alert" : "status"}
  >
    {notice.text}
  </div>
);

export default MobileApp;
