export type WakeDevice = {
  id: number;
  name: string;
  mac_address: string;
  target_ip: string;
  broadcast_address: string;
  port: number;
  description: string;
  corelink_machine_key: string;
  is_enabled: boolean;
  sort_order: number;
  last_wake_at: string | null;
  components: WakeDeviceComponent[];
  power_state: "online" | "offline" | "unknown";
  power_state_label?: string;
  power_state_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type WakeComponentType =
  | "processor"
  | "motherboard"
  | "memory"
  | "graphics_card"
  | "storage"
  | "network_card"
  | "sound_card"
  | "capture_card"
  | "extension_card"
  | "power_supply"
  | "cooling"
  | "case"
  | "other";

export type WakeDeviceComponent = {
  id?: number;
  device_id?: number;
  component_type: WakeComponentType;
  label: string;
  details: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type WakePermissionLevel = "none" | "wake" | "manage";

export type WakePermissionSource = "none" | "dedicated" | "global_admin";

export type WakeAccessUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  is_global_admin: boolean;
  has_dedicated_entry: boolean;
  can_wake: boolean;
  can_manage: boolean;
  effective_can_wake: boolean;
  effective_can_manage: boolean;
  permission_level: WakePermissionLevel;
  permission_source: WakePermissionSource;
  granted_by_user_id: number | null;
  permission_created_at: string | null;
  permission_updated_at: string | null;
  created_at: string;
};

export type WakeUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  is_admin: boolean;
};

export type WakeStatus = {
  authenticated: boolean;
  can_wake: boolean;
  can_manage: boolean;
  is_global_admin: boolean;
  user: WakeUser | null;
};

export type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
};

export type WakeStatusResponse = ApiEnvelope<{
  status: WakeStatus;
}>;

export type WakeDevicesResponse = ApiEnvelope<{
  devices: WakeDevice[];
}>;

export type WakeUsersResponse = ApiEnvelope<{
  users: WakeAccessUser[];
}>;

export type WakeUserResponse = ApiEnvelope<{
  user: WakeAccessUser;
}>;
