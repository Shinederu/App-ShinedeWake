import type { CorelinkEnvelope, CorelinkJob, CorelinkJobType, CorelinkMachine, CorelinkStatus } from "@/types/corelink";

const API_BASE = import.meta.env.VITE_CORELINK_API_URL ?? "https://api.shinederu.ch/corelink/";

type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

type CreateJobPayload = {
  machine_key: string;
  job_type: CorelinkJobType;
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

  return fallback;
};

const request = async <T>(
  method: string,
  action: string,
  payload?: Record<string, unknown>,
  query?: Record<string, string | number | null | undefined>
): Promise<ApiResult<T>> => {
  const url = new URL(API_BASE);
  url.searchParams.set("action", action);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

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
    return { ok: false, status: 0, data: null, error: "Impossible de joindre l'API Corelink." };
  }

  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }

  if (!response.ok) {
    return { ok: false, status: response.status, data, error: getErrorMessage(data, response.statusText || "Request failed") };
  }

  return { ok: true, status: response.status, data, error: null };
};

export const corelinkApi = {
  async getStatus(): Promise<ApiResult<CorelinkStatus>> {
    const result = await request<CorelinkEnvelope<{ status: CorelinkStatus }>>("GET", "status");
    return {
      ok: result.ok,
      status: result.status,
      data: result.data?.data?.status ?? null,
      error: result.error,
    };
  },

  async getMachine(machineKey: string): Promise<ApiResult<CorelinkMachine>> {
    const result = await request<CorelinkEnvelope<{ machine: CorelinkMachine }>>("GET", "getMachine", undefined, {
      machine_key: machineKey,
    });
    return {
      ok: result.ok,
      status: result.status,
      data: result.data?.data?.machine ?? null,
      error: result.error,
    };
  },

  async listActiveJobs(machineKey: string): Promise<ApiResult<CorelinkJob[]>> {
    const result = await request<CorelinkEnvelope<{ jobs: CorelinkJob[] }>>("GET", "listJobs", undefined, {
      machine_key: machineKey,
      status: "active",
      limit: 5,
    });
    return {
      ok: result.ok,
      status: result.status,
      data: result.data?.data?.jobs ?? [],
      error: result.error,
    };
  },

  async createJob(payload: CreateJobPayload): Promise<ApiResult<CorelinkJob>> {
    const result = await request<CorelinkEnvelope<{ job: CorelinkJob }>>("POST", "createJob", payload);
    return {
      ok: result.ok,
      status: result.status,
      data: result.data?.data?.job ?? null,
      error: result.error,
    };
  },
};
