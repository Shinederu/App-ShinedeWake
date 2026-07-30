import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@shinederu/auth-react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AudioLines,
  Box,
  Cable,
  CircuitBoard,
  Cpu,
  Fan,
  HardDrive,
  Layers,
  LogOut,
  MemoryStick,
  Monitor,
  Network,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { LoginPanel } from "@/components/LoginPanel";
import { UserAccessPanel } from "@/components/UserAccessPanel";
import { wakeApi } from "@/lib/api";
import type {
  WakeAccessUser,
  WakeAgentMetrics,
  WakeAgentShutdownJob,
  WakeComponentType,
  WakeDevice,
  WakeDeviceComponent,
  WakePermissionLevel,
  WakeStatus,
  WakeSystemAgent,
} from "@/types/api";

type DeviceComponentFormState = {
  local_id: string;
  component_type: WakeComponentType;
  label: string;
  details: string;
};

type DeviceFormState = {
  name: string;
  mac_address: string;
  target_ip: string;
  broadcast_address: string;
  port: string;
  description: string;
  corelink_machine_key: string;
  is_enabled: boolean;
  sort_order: string;
  components: DeviceComponentFormState[];
};

type NoticeState = {
  kind: "success" | "error" | "info";
  text: string;
} | null;

type ComponentOption = {
  type: WakeComponentType;
  label: string;
  placeholder: string;
  detailsPlaceholder: string;
  icon: LucideIcon;
};

const COMPONENT_OPTIONS: ComponentOption[] = [
  {
    type: "processor",
    label: "Processeur",
    placeholder: "AMD Ryzen 7 7800X3D",
    detailsPlaceholder: "8 coeurs, AM5, refroidissement AIO",
    icon: Cpu,
  },
  {
    type: "motherboard",
    label: "Carte mere",
    placeholder: "ASUS ROG STRIX B650E-F",
    detailsPlaceholder: "BIOS, chipset, format",
    icon: CircuitBoard,
  },
  {
    type: "memory",
    label: "Memoire RAM",
    placeholder: "32 Go DDR5 6000",
    detailsPlaceholder: "2 x 16 Go, EXPO active",
    icon: MemoryStick,
  },
  {
    type: "graphics_card",
    label: "Carte graphique",
    placeholder: "NVIDIA RTX 4080 Super",
    detailsPlaceholder: "VRAM, sortie ecran, usage",
    icon: Monitor,
  },
  {
    type: "storage",
    label: "Stockage",
    placeholder: "Samsung 990 Pro 2 To",
    detailsPlaceholder: "NVMe systeme, SSD jeu, HDD backup",
    icon: HardDrive,
  },
  {
    type: "network_card",
    label: "Carte reseau",
    placeholder: "Intel X550-T2 10GbE",
    detailsPlaceholder: "Wake-on-LAN active, VLAN, port switch",
    icon: Network,
  },
  {
    type: "sound_card",
    label: "Carte son",
    placeholder: "Creative Sound Blaster AE-5",
    detailsPlaceholder: "Sorties, driver, usage",
    icon: AudioLines,
  },
  {
    type: "capture_card",
    label: "Carte capture",
    placeholder: "Elgato 4K60 Pro",
    detailsPlaceholder: "HDMI, slot PCIe, source",
    icon: Cable,
  },
  {
    type: "extension_card",
    label: "Carte d'extension",
    placeholder: "USB-C PCIe, HBA, Thunderbolt",
    detailsPlaceholder: "Slot, usage, ports",
    icon: Layers,
  },
  {
    type: "power_supply",
    label: "Alimentation",
    placeholder: "Corsair RM850x",
    detailsPlaceholder: "850W, 80+ Gold, connectique",
    icon: Cable,
  },
  {
    type: "cooling",
    label: "Refroidissement",
    placeholder: "Arctic Liquid Freezer III 360",
    detailsPlaceholder: "Ventilos, courbes, pate thermique",
    icon: Fan,
  },
  {
    type: "case",
    label: "Boitier",
    placeholder: "Fractal Design North",
    detailsPlaceholder: "Format, airflow, emplacement",
    icon: Box,
  },
  {
    type: "other",
    label: "Autre composant",
    placeholder: "Composant specifique",
    detailsPlaceholder: "Reference, emplacement, remarque",
    icon: Layers,
  },
];

const EMPTY_FORM: DeviceFormState = {
  name: "",
  mac_address: "",
  target_ip: "",
  broadcast_address: "",
  port: "9",
  description: "",
  corelink_machine_key: "",
  is_enabled: true,
  sort_order: "0",
  components: [],
};

const AUTO_REFRESH_INTERVAL_MS = 15000;

let componentIdCounter = 0;

const createComponentId = (): string => {
  componentIdCounter += 1;
  return `component-${Date.now()}-${componentIdCounter}`;
};

const getComponentOption = (type: WakeComponentType): ComponentOption => {
  return COMPONENT_OPTIONS.find((option) => option.type === type) ?? COMPONENT_OPTIONS[COMPONENT_OPTIONS.length - 1];
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "Jamais";
  }

  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const sanitizeMacInput = (value: string): string => {
  return value
    .replace(/[^0-9a-fA-F]/g, "")
    .toUpperCase()
    .slice(0, 12)
    .replace(/(.{2})(?=.)/g, "$1-");
};

const mapDeviceToForm = (device: WakeDevice): DeviceFormState => ({
  name: device.name,
  mac_address: device.mac_address,
  target_ip: device.target_ip,
  broadcast_address: device.broadcast_address,
  port: String(device.port),
  description: device.description,
  corelink_machine_key: device.corelink_machine_key,
  is_enabled: device.is_enabled,
  sort_order: String(device.sort_order),
  components: device.components.map((component) => ({
    local_id: createComponentId(),
    component_type: component.component_type,
    label: component.label,
    details: component.details,
  })),
});

const normalizeForm = (form: DeviceFormState) => ({
  name: form.name.trim(),
  mac_address: form.mac_address.trim(),
  target_ip: form.target_ip.trim(),
  broadcast_address: form.broadcast_address.trim(),
  port: Number(form.port || 9),
  description: form.description.trim(),
  corelink_machine_key: normalizeAgentKeyInput(form.corelink_machine_key),
  is_enabled: form.is_enabled,
  sort_order: Number(form.sort_order || 0),
  components: form.components
    .map<WakeDeviceComponent>((component, index) => ({
      component_type: component.component_type,
      label: component.label.trim(),
      details: component.details.trim(),
      sort_order: index,
    }))
    .filter((component) => component.label !== "" || component.details !== ""),
});

const formatPowerStateLabel = (state: WakeDevice["power_state"]): string => {
  switch (state) {
    case "online":
      return "Allume";
    case "offline":
      return "Eteint";
    default:
      return "Indetermine";
  }
};

const normalizeAgentKeyInput = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 96);
};

const formatAgentState = (agent: WakeSystemAgent | null | undefined): string => {
  if (!agent) {
    return "Introuvable";
  }

  if (agent.is_online) {
    return "Agent en ligne";
  }

  if (agent.status === "stopped") {
    return "Agent arrete";
  }

  return "Agent hors-ligne";
};

const formatMetricPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${Math.round(value)}%`;
};

const formatMemoryUsage = (metrics: WakeAgentMetrics | null | undefined): string => {
  if (!metrics?.memory_total_mb) {
    return "-";
  }

  const usedGb = ((metrics.memory_used_mb ?? 0) / 1024).toFixed(1);
  const totalGb = (metrics.memory_total_mb / 1024).toFixed(1);

  return `${usedGb}/${totalGb} Go`;
};

const formatStorageUsage = (metrics: WakeAgentMetrics | null | undefined): string => {
  const disks = metrics?.disks ?? [];
  const byteDisks = disks
    .map((disk) => {
      const total = disk.total_bytes ?? 0;
      if (!Number.isFinite(total) || total <= 0) {
        return null;
      }

      const used = disk.used_bytes ?? (disk.free_bytes !== undefined ? total - disk.free_bytes : null);
      if (used === null || !Number.isFinite(used)) {
        return null;
      }

      return {
        total,
        used: Math.max(0, Math.min(used, total)),
      };
    })
    .filter((disk): disk is { total: number; used: number } => disk !== null);

  if (byteDisks.length > 0) {
    const total = byteDisks.reduce((sum, disk) => sum + disk.total, 0);
    const used = byteDisks.reduce((sum, disk) => sum + disk.used, 0);
    return `${Math.round((used / total) * 100)}%`;
  }

  const percents = disks
    .map((disk) => disk.used_percent)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (percents.length === 0) {
    return "-";
  }

  const average = percents.reduce((sum, value) => sum + value, 0) / percents.length;
  return `${Math.round(Math.max(0, Math.min(average, 100)))}%`;
};

const formatGpuUsage = (metrics: WakeAgentMetrics | null | undefined): string => {
  const usageValues = (metrics?.gpus ?? [])
    .map((gpu) => gpu.usage_percent ?? gpu.utilization_percent ?? gpu.gpu_usage_percent)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (usageValues.length === 0) {
    return "-";
  }

  const average = usageValues.reduce((sum, value) => sum + value, 0) / usageValues.length;

  return `${Math.round(Math.max(0, Math.min(average, 100)))}%`;
};

const formatShutdownJob = (job: WakeAgentShutdownJob): string => {
  if (job.status === "succeeded") {
    return "Arret programme";
  }

  return job.status === "running" ? "Extinction en cours" : "Extinction en attente";
};

function App() {
  const auth = useAuth();
  const [status, setStatus] = useState<WakeStatus | null>(null);
  const [devices, setDevices] = useState<WakeDevice[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeWakeId, setActiveWakeId] = useState<number | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const [deletingDeviceId, setDeletingDeviceId] = useState<number | null>(null);
  const [users, setUsers] = useState<WakeAccessUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [activeShutdownId, setActiveShutdownId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [form, setForm] = useState<DeviceFormState>(EMPTY_FORM);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [componentToAddType, setComponentToAddType] = useState<WakeComponentType>("processor");
  const isLoadingDataRef = useRef(false);

  const canManageDevices = status?.can_manage_devices ?? false;
  const canManageUsers = status?.can_manage_users ?? false;
  const canManage = canManageDevices || canManageUsers;
  const canWake = status?.can_wake ?? false;
  const canShutdown = status?.can_shutdown ?? false;
  const isAuthenticated = status?.authenticated ?? false;

  const sortedDevices = useMemo(
    () =>
      [...devices].sort((left, right) => {
        if (left.sort_order !== right.sort_order) {
          return left.sort_order - right.sort_order;
        }

        return left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
      }),
    [devices]
  );

  const onlineDeviceCount = useMemo(
    () => devices.filter((device) => device.power_state === "online").length,
    [devices]
  );

  const accountLabel = status?.is_global_admin
    ? "Admin global"
    : canManage
      ? "Gestion"
      : "Controle";

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingDeviceId(null);
    setIsEditorOpen(false);
  };

  const scrollToEditor = () => {
    window.requestAnimationFrame(() => {
      document.getElementById("device-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const openCreateForm = () => {
    setEditingDeviceId(null);
    setForm(EMPTY_FORM);
    setIsEditorOpen(true);
    scrollToEditor();
  };

  const openEditForm = (device: WakeDevice) => {
    setEditingDeviceId(device.id);
    setForm(mapDeviceToForm(device));
    setIsEditorOpen(true);
    scrollToEditor();
  };

  const loadData = async (showRefreshState = false, showErrors = true, includeUsers = true) => {
    if (isLoadingDataRef.current) {
      return;
    }

    isLoadingDataRef.current = true;

    if (showRefreshState) {
      setIsRefreshing(true);
    }

    try {
      const statusResponse = await wakeApi.getStatus();

      if (!statusResponse.ok || !statusResponse.data) {
        setStatus({
          authenticated: false,
          can_wake: false,
          can_shutdown: false,
          can_manage: false,
          can_manage_devices: false,
          can_manage_users: false,
          is_global_admin: false,
          user: null,
        });
        setDevices([]);
        if (showErrors && statusResponse.error) {
          setNotice({ kind: "error", text: statusResponse.error });
        }
        return;
      }

      setStatus(statusResponse.data);

      if (!statusResponse.data.authenticated) {
        setDevices([]);
        setUsers([]);
        return;
      }

      const shouldLoadDevices = statusResponse.data.can_wake;
      const shouldLoadUsers = includeUsers && statusResponse.data.can_manage_users;
      const [devicesResponse, usersResponse] = await Promise.all([
        shouldLoadDevices ? wakeApi.listDevices() : Promise.resolve(null),
        shouldLoadUsers ? wakeApi.listUsers() : Promise.resolve(null),
      ]);

      if (shouldLoadDevices) {
        if (!devicesResponse?.ok || !devicesResponse.data) {
          setDevices([]);
          if (showErrors) {
            setNotice({
              kind: "error",
              text: devicesResponse?.error ?? "Impossible de charger les machines autorisees.",
            });
          }
          return;
        }

        setDevices(devicesResponse.data);
      } else {
        setDevices([]);
      }

      if (!statusResponse.data.can_manage_users) {
        setUsers([]);
        return;
      }

      if (!includeUsers) {
        return;
      }

      if (!usersResponse?.ok || !usersResponse.data) {
        setUsers([]);
        if (showErrors) {
          setNotice({
            kind: "error",
            text: usersResponse?.error ?? "Impossible de charger les utilisateurs autorises.",
          });
        }
        return;
      }

      setUsers(usersResponse.data);
    } finally {
      isLoadingDataRef.current = false;
      setIsBooting(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !canWake) {
      return;
    }

    const refreshSilently = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void loadData(false, false, false);
    };

    const intervalId = window.setInterval(refreshSilently, AUTO_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSilently();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, canWake]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [notice]);

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
        setLoginError(response.error ?? "Connexion refusee.");
        return;
      }

      await loadData();
      setNotice({ kind: "success", text: "Session ouverte." });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    setIsRefreshing(true);

    try {
      await auth.logout();
    } finally {
      resetForm();
      setDevices([]);
      setUsers([]);
      setStatus({
        authenticated: false,
        can_wake: false,
        can_shutdown: false,
        can_manage: false,
        can_manage_devices: false,
        can_manage_users: false,
        is_global_admin: false,
        user: null,
      });
      setIsRefreshing(false);
    }
  };

  const handleWake = async (deviceId: number) => {
    setActiveWakeId(deviceId);

    try {
      const response = await wakeApi.wakeDevice(deviceId);
      if (!response.ok) {
        setNotice({
          kind: "error",
          text: response.error ?? "Le paquet WOL n'a pas pu etre envoye.",
        });
        return;
      }

      setNotice({ kind: "success", text: "Magic packet envoye." });
      await loadData();
    } finally {
      setActiveWakeId(null);
    }
  };

  const handleShutdown = async (device: WakeDevice) => {
    if (!window.confirm(`Eteindre ${device.name} ?`)) {
      return;
    }

    setActiveShutdownId(device.id);

    try {
      const response = await wakeApi.shutdownDevice(device.id);

      if (!response.ok) {
        setNotice({ kind: "error", text: response.error ?? "Extinction impossible." });
        return;
      }

      setNotice({ kind: "success", text: "Extinction demandee." });
      await loadData(false, false, false);
    } finally {
      setActiveShutdownId(null);
    }
  };

  const handleSubmitDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const incompleteComponent = form.components.find(
      (component) => component.label.trim() === "" && component.details.trim() !== ""
    );

    if (incompleteComponent) {
      const option = getComponentOption(incompleteComponent.component_type);
      setNotice({ kind: "error", text: `Le composant "${option.label}" doit avoir un nom.` });
      return;
    }

    setIsSavingDevice(true);

    try {
      const payload = normalizeForm(form);
      const response =
        editingDeviceId === null
          ? await wakeApi.createDevice(payload)
          : await wakeApi.updateDevice(editingDeviceId, payload);

      if (!response.ok) {
        setNotice({ kind: "error", text: response.error ?? "Enregistrement impossible." });
        return;
      }

      setNotice({
        kind: "success",
        text: editingDeviceId === null ? "Machine ajoutee." : "Machine mise a jour.",
      });
      resetForm();
      await loadData();
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleDeleteDevice = async (deviceId: number) => {
    if (!window.confirm("Supprimer cette machine du panel ?")) {
      return;
    }

    setDeletingDeviceId(deviceId);

    try {
      const response = await wakeApi.deleteDevice(deviceId);
      if (!response.ok) {
        setNotice({ kind: "error", text: response.error ?? "Suppression impossible." });
        return;
      }

      if (editingDeviceId === deviceId) {
        resetForm();
      }

      setNotice({ kind: "success", text: "Machine supprimee." });
      await loadData();
    } finally {
      setDeletingDeviceId(null);
    }
  };

  const handleUpdateUserPermission = async (userId: number, level: WakePermissionLevel) => {
    setUpdatingUserId(userId);
    setIsLoadingUsers(true);

    try {
      const payload = {
        can_wake: level === "wake" || level === "manage",
        can_manage: level === "manage",
      };
      const response = await wakeApi.updateUserPermissions(userId, payload);

      if (!response.ok) {
        setNotice({
          kind: "error",
          text: response.error ?? "Mise a jour des permissions impossible.",
        });
        return;
      }

      setNotice({ kind: "success", text: "Permissions utilisateur mises a jour." });
      await loadData(true);
    } finally {
      setUpdatingUserId(null);
      setIsLoadingUsers(false);
    }
  };

  const handleAddComponent = () => {
    setForm((current) => ({
      ...current,
      components: [
        ...current.components,
        {
          local_id: createComponentId(),
          component_type: componentToAddType,
          label: "",
          details: "",
        },
      ],
    }));
  };

  const updateComponent = (
    localId: string,
    updates: Partial<Pick<DeviceComponentFormState, "component_type" | "label" | "details">>
  ) => {
    setForm((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.local_id === localId ? { ...component, ...updates } : component
      ),
    }));
  };

  const removeComponent = (localId: string) => {
    setForm((current) => ({
      ...current,
      components: current.components.filter((component) => component.local_id !== localId),
    }));
  };

  const renderShellHeader = () => (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Power size={24} />
        </div>
        <div>
          <p className="eyebrow">Gestion des machines</p>
          <h1>ShinedeWake</h1>
        </div>
      </div>

      {isAuthenticated ? (
        <div className="header-actions">
          <div className="session-card">
            <strong>{status?.user?.username ?? "Session"}</strong>
            <span>{accountLabel}</span>
          </div>
          {canWake ? (
            <div className="online-status-card" aria-label={`${onlineDeviceCount} machines en ligne sur ${devices.length}`}>
              <Activity size={18} />
              <span>En ligne</span>
              <strong>
                {onlineDeviceCount}/{devices.length}
              </strong>
            </div>
          ) : null}
          <button className="icon-button text-button" onClick={() => void loadData(true)} disabled={isRefreshing}>
            <RefreshCw size={18} />
            {isRefreshing ? "Actualisation" : "Actualiser"}
          </button>
          <button className="icon-button danger-button" onClick={handleLogout}>
            <LogOut size={18} />
            Quitter
          </button>
        </div>
      ) : null}
    </header>
  );

  if (isBooting) {
    return (
      <main className="app-frame loading-frame">
        <section className="surface auth-surface">
          <p className="eyebrow">Initialisation</p>
          <h1>ShinedeWake</h1>
          <p className="lede">Lecture de la session...</p>
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="app-frame auth-frame">
        {renderShellHeader()}
        <LoginPanel isBusy={isAuthenticating} error={loginError} onSubmit={handleLogin} />
      </main>
    );
  }

  if (!canWake && !canManageUsers) {
    return (
      <main className="app-frame auth-frame">
        {renderShellHeader()}
        <section className="surface auth-surface">
          <p className="eyebrow">Acces</p>
          <h2>Compte non autorise</h2>
          <p className="lede">Aucun role Wake n'est attache a ce compte.</p>
          <div className="session-card wide-session-card">
            <strong>{status?.user?.username ?? "Utilisateur inconnu"}</strong>
            <span>{status?.user?.email ?? ""}</span>
          </div>
          <button className="icon-button text-button" onClick={handleLogout}>
            <LogOut size={18} />
            Se deconnecter
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-frame">
      {renderShellHeader()}

      {notice ? <div className={`notice ${notice.kind}`}>{notice.text}</div> : null}

      <section className="workspace-layout">
        <section className="surface devices-surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">Machines</p>
              <h2>Parc machines</h2>
            </div>
            <div className="section-actions">
              <span className="count-pill">{devices.length} cibles</span>
              {canManageDevices ? (
                <button className="icon-button text-button" type="button" onClick={openCreateForm}>
                  <Plus size={18} />
                  Ajouter une machine
                </button>
              ) : null}
            </div>
          </div>

          {sortedDevices.length === 0 ? (
            <div className="empty-state">
              <h3>Aucune machine</h3>
              <p>Ajoute une premiere cible pour utiliser le panel.</p>
            </div>
          ) : (
            <div className="device-list">
              {sortedDevices.map((device) => {
                const agentKey = normalizeAgentKeyInput(device.corelink_machine_key);
                const agent = device.agent;
                const metrics = agent?.latest_metrics;
                const activeShutdownJobs = agent?.active_shutdown_jobs ?? [];
                const isMachineOnline = Boolean(agent?.is_online || device.power_state === "online");
                const shutdownInProgress = activeShutdownId === device.id || activeShutdownJobs.length > 0;
                const canShutdownWithAgent = Boolean(
                  canShutdown &&
                    agentKey &&
                    agent?.is_online &&
                    activeShutdownJobs.length === 0
                );
                const primaryActionDisabled =
                  !device.is_enabled ||
                  shutdownInProgress ||
                  activeWakeId === device.id ||
                  activeShutdownId !== null ||
                  (isMachineOnline ? !canShutdownWithAgent : false);
                const primaryActionLabel = shutdownInProgress
                  ? "Extinction en cours"
                  : isMachineOnline
                    ? "Eteindre"
                  : activeWakeId === device.id
                    ? "Envoi"
                    : "Reveiller";

                return (
                  <article key={device.id} className={`device-card ${device.is_enabled ? "" : "is-disabled"}`}>
                    <div className="device-status-rail" data-state={device.power_state} />
                    <div className="device-card-main">
                      <div className="device-title-row">
                        <div>
                          <h3>{device.name}</h3>
                          <p>{device.description || "Aucune note materiel."}</p>
                        </div>
                        <span className={`state-badge state-${device.power_state}`}>
                          {formatPowerStateLabel(device.power_state)}
                        </span>
                      </div>

                      <div className="device-facts">
                        <div>
                          <span>IP</span>
                          <strong>{device.target_ip || "-"}</strong>
                        </div>
                        <div>
                          <span>MAC</span>
                          <strong>{device.mac_address}</strong>
                        </div>
                        <div>
                          <span>Broadcast</span>
                          <strong>{device.broadcast_address || "-"}</strong>
                        </div>
                        <div>
                          <span>Dernier reveil</span>
                          <strong>{formatDateTime(device.last_wake_at)}</strong>
                        </div>
                      </div>

                      {device.components.length > 0 ? (
                        <div className="hardware-list">
                          {device.components.map((component) => {
                            const option = getComponentOption(component.component_type);
                            const Icon = option.icon;

                            return (
                              <div className="hardware-item" key={component.id ?? `${component.component_type}-${component.sort_order}`}>
                                <Icon size={18} />
                                <div>
                                  <span>{option.label}</span>
                                  <strong>{component.label}</strong>
                                  {component.details ? <p>{component.details}</p> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="hardware-empty">Aucun composant renseigne.</div>
                      )}

                      {device.power_state === "unknown" && device.power_state_reason ? (
                        <p className="helper-note">Statut indisponible: {device.power_state_reason}</p>
                      ) : null}

                      {agentKey ? (
                        <div className="agent-panel">
                          <div className="agent-panel-head">
                            <div>
                              <span>Agent systeme</span>
                              <strong>{agent?.display_name ?? agentKey}</strong>
                            </div>
                            <span className={`state-badge ${agent?.is_online ? "state-online" : "state-unknown"}`}>
                              {formatAgentState(agent)}
                            </span>
                          </div>

                          {agent ? (
                            <>
                              <div className="agent-facts">
                                <div>
                                  <span>CPU</span>
                                  <strong>{formatMetricPercent(metrics?.cpu_usage_percent)}</strong>
                                </div>
                                <div>
                                  <span>RAM</span>
                                  <strong>{formatMemoryUsage(metrics)}</strong>
                                </div>
                                <div>
                                  <span>GPU</span>
                                  <strong>{formatGpuUsage(metrics)}</strong>
                                </div>
                                <div>
                                  <span>Stockage</span>
                                  <strong>{formatStorageUsage(metrics)}</strong>
                                </div>
                                <div>
                                  <span>Vu</span>
                                  <strong>{formatDateTime(agent.last_seen_at)}</strong>
                                </div>
                                <div>
                                  <span>Arrets actifs</span>
                                  <strong>{activeShutdownJobs.length}</strong>
                                </div>
                              </div>

                              {activeShutdownJobs.length > 0 ? (
                                <div className="agent-job-strip">
                                  {activeShutdownJobs.map((job) => (
                                    <span key={job.id}>{formatShutdownJob(job)}</span>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="helper-note">Aucun agent ne correspond encore a cette cle de liaison.</p>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="device-actions">
                      <button
                        className={`icon-button ${isMachineOnline ? "danger-button" : "primary-button"}`}
                        disabled={primaryActionDisabled}
                        title={
                          isMachineOnline && !canShutdownWithAgent && !shutdownInProgress
                            ? canShutdown
                              ? "L'agent systeme doit etre en ligne pour eteindre cette machine."
                              : "Ce compte n'a pas le droit d'eteindre les machines."
                            : undefined
                        }
                        onClick={() => {
                          if (isMachineOnline) {
                            void handleShutdown(device);
                            return;
                          }

                          void handleWake(device.id);
                        }}
                      >
                        <Power size={18} />
                        {primaryActionLabel}
                      </button>

                      {canManageDevices ? (
                        <>
                          <button
                            className="icon-button text-button"
                            onClick={() => openEditForm(device)}
                          >
                            <Pencil size={18} />
                            Modifier
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {canManageDevices && isEditorOpen ? (
          <aside id="device-editor" className="surface editor-surface">
            <div className="section-head">
              <div>
                <p className="eyebrow">{editingDeviceId === null ? "Nouveau" : "Edition"}</p>
                <h2>{editingDeviceId === null ? "Machine" : form.name || "Machine"}</h2>
              </div>
              {editingDeviceId !== null ? (
                <button className="icon-only-button" type="button" onClick={resetForm} aria-label="Fermer l'edition">
                  <X size={18} />
                </button>
              ) : null}
            </div>

            <form className="device-form" onSubmit={handleSubmitDevice}>
              <fieldset>
                <legend>Identite</legend>
                <label>
                  <span>Nom</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>
              </fieldset>

              <fieldset>
                <legend>Agent systeme</legend>
                <label>
                  <span>Cle de liaison agent</span>
                  <input
                    type="text"
                    placeholder="bootao"
                    value={form.corelink_machine_key}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        corelink_machine_key: normalizeAgentKeyInput(event.target.value),
                      }))
                    }
                  />
                </label>
              </fieldset>

              <fieldset>
                <legend>Reseau</legend>
                <label>
                  <span>Adresse MAC</span>
                  <input
                    type="text"
                    placeholder="50-EB-F6-B3-5F-BB"
                    value={form.mac_address}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        mac_address: sanitizeMacInput(event.target.value),
                      }))
                    }
                    required
                  />
                </label>
                <div className="field-row">
                  <label>
                    <span>IP cible</span>
                    <input
                      type="text"
                      placeholder="192.168.10.30"
                      value={form.target_ip}
                      onChange={(event) => setForm((current) => ({ ...current, target_ip: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Broadcast</span>
                    <input
                      type="text"
                      placeholder="192.168.10.255"
                      value={form.broadcast_address}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, broadcast_address: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label>
                    <span>Port</span>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={form.port}
                      onChange={(event) => setForm((current) => ({ ...current, port: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Ordre</span>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.is_enabled}
                    onChange={(event) => setForm((current) => ({ ...current, is_enabled: event.target.checked }))}
                  />
                  <span>Machine active</span>
                </label>
              </fieldset>

              <fieldset>
                <legend>Materiel</legend>
                <div className="component-add-row">
                  <select
                    value={componentToAddType}
                    onChange={(event) => setComponentToAddType(event.target.value as WakeComponentType)}
                  >
                    {COMPONENT_OPTIONS.map((option) => (
                      <option key={option.type} value={option.type}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button className="icon-button text-button" type="button" onClick={handleAddComponent}>
                    <Plus size={18} />
                    Ajouter un composant
                  </button>
                </div>

                {form.components.length === 0 ? (
                  <div className="inline-empty">Aucun composant dans cette fiche.</div>
                ) : (
                  <div className="component-editor-list">
                    {form.components.map((component) => {
                      const option = getComponentOption(component.component_type);
                      const Icon = option.icon;

                      return (
                        <article className="component-editor" key={component.local_id}>
                          <div className="component-editor-head">
                            <div>
                              <Icon size={18} />
                              <strong>{option.label}</strong>
                            </div>
                            <button
                              className="icon-only-button danger-button"
                              type="button"
                              onClick={() => removeComponent(component.local_id)}
                              aria-label="Retirer ce composant"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <label>
                            <span>Type</span>
                            <select
                              value={component.component_type}
                              onChange={(event) =>
                                updateComponent(component.local_id, {
                                  component_type: event.target.value as WakeComponentType,
                                })
                              }
                            >
                              {COMPONENT_OPTIONS.map((availableOption) => (
                                <option key={availableOption.type} value={availableOption.type}>
                                  {availableOption.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Modele / reference</span>
                            <input
                              type="text"
                              placeholder={option.placeholder}
                              value={component.label}
                              onChange={(event) => updateComponent(component.local_id, { label: event.target.value })}
                            />
                          </label>
                          <label>
                            <span>Details</span>
                            <textarea
                              rows={2}
                              placeholder={option.detailsPlaceholder}
                              value={component.details}
                              onChange={(event) => updateComponent(component.local_id, { details: event.target.value })}
                            />
                          </label>
                        </article>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              <div className="form-actions">
                <button type="submit" className="icon-button primary-button" disabled={isSavingDevice}>
                  <Save size={18} />
                  {isSavingDevice ? "Enregistrement" : editingDeviceId === null ? "Ajouter" : "Sauvegarder"}
                </button>
                <button type="button" className="icon-button text-button" onClick={resetForm}>
                  <RotateCcw size={18} />
                  Reinitialiser
                </button>
              </div>

              {editingDeviceId !== null ? (
                <div className="danger-zone">
                  <div>
                    <strong>Zone sensible</strong>
                    <p>La suppression retire la machine et sa fiche materiel du panel.</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button danger-button"
                    disabled={deletingDeviceId === editingDeviceId}
                    onClick={() => void handleDeleteDevice(editingDeviceId)}
                  >
                    <Trash2 size={18} />
                    {deletingDeviceId === editingDeviceId ? "Suppression" : "Supprimer cette machine"}
                  </button>
                </div>
              ) : null}
            </form>
          </aside>
        ) : null}
      </section>

      {canManageUsers ? (
        <section className="surface users-surface">
          <UserAccessPanel
            users={users}
            isLoading={isLoadingUsers}
            search={userSearch}
            onSearchChange={setUserSearch}
            updatingUserId={updatingUserId}
            onLevelChange={handleUpdateUserPermission}
          />
        </section>
      ) : null}
    </main>
  );
}

export default App;
