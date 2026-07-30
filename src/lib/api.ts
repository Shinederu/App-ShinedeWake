import type {
  WakeAccessUser,
  WakeDeviceComponent,
  WakeDevicesResponse,
  WakeDevice,
  WakeStatus,
  WakeStatusResponse,
  WakeUserResponse,
  WakeUsersResponse,
} from "@/types/api";

const API_BASE = import.meta.env.VITE_SHINEDEWAKE_API_URL;

type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

type DevicePayload = {
  name: string;
  mac_address: string;
  target_ip: string;
  broadcast_address: string;
  port: number;
  description: string;
  corelink_machine_key: string;
  is_enabled: boolean;
  sort_order: number;
  components: WakeDeviceComponent[];
};

type UserPermissionPayload = {
  can_wake: boolean;
  can_manage: boolean;
};

const getErrorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }

    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return fallback;
};

const request = async <T>(method: string, action: string, payload?: Record<string, unknown>): Promise<ApiResult<T>> => {
  const url = new URL(API_BASE);
  url.searchParams.set("action", action);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: method === "GET" ? null : JSON.stringify(payload ?? {}),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Impossible de joindre l'API Wake.",
    };
  }

  let data: T | null = null;

  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
      error: getErrorMessage(data, response.statusText || "Request failed"),
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
    error: null,
  };
};

export const wakeApi = {
  async getStatus(): Promise<ApiResult<WakeStatus>> {
    const result = await request<WakeStatusResponse>("GET", "status");
    const status = result.data?.data?.status ?? null;

    return {
      ok: result.ok,
      status: result.status,
      data: status,
      error: result.error,
    };
  },

  async listDevices(): Promise<ApiResult<WakeDevice[]>> {
    const result = await request<WakeDevicesResponse>("GET", "listDevices");
    const devices = result.data?.data?.devices ?? [];

    return {
      ok: result.ok,
      status: result.status,
      data: devices,
      error: result.error,
    };
  },

  async listUsers(): Promise<ApiResult<WakeAccessUser[]>> {
    const result = await request<WakeUsersResponse>("GET", "listUsers");
    const users = result.data?.data?.users ?? [];

    return {
      ok: result.ok,
      status: result.status,
      data: users,
      error: result.error,
    };
  },

  async wakeDevice(deviceId: number): Promise<ApiResult<null>> {
    return request("POST", "wakeDevice", { deviceId });
  },

  async shutdownDevice(deviceId: number): Promise<ApiResult<null>> {
    return request("POST", "shutdownDevice", { deviceId });
  },

  async createDevice(payload: DevicePayload): Promise<ApiResult<null>> {
    return request("POST", "createDevice", payload);
  },

  async updateDevice(deviceId: number, payload: DevicePayload): Promise<ApiResult<null>> {
    return request("PUT", "updateDevice", { id: deviceId, ...payload });
  },

  async updateUserPermissions(userId: number, payload: UserPermissionPayload): Promise<ApiResult<WakeAccessUser>> {
    const result = await request<WakeUserResponse>("PUT", "updateUserPermissions", {
      userId,
      ...payload,
    });
    const user = result.data?.data?.user ?? null;

    return {
      ok: result.ok,
      status: result.status,
      data: user,
      error: result.error,
    };
  },

  async deleteDevice(deviceId: number): Promise<ApiResult<null>> {
    return request("DELETE", "deleteDevice", { id: deviceId });
  },
};
