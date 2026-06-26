export type CorelinkStatus = {
  authenticated: boolean;
  can_view: boolean;
  can_execute_jobs: boolean;
};

export type CorelinkDisk = {
  name?: string;
  total_bytes?: number;
  used_bytes?: number;
  free_bytes?: number;
  used_percent?: number;
};

export type CorelinkMetric = {
  captured_at: string;
  cpu_usage_percent: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  disks: CorelinkDisk[];
  payload: Record<string, unknown>;
};

export type CorelinkMachine = {
  id: number;
  machine_key: string;
  display_name: string;
  hostname: string;
  status: string;
  is_online: boolean;
  last_seen_at: string | null;
  latest_metric: CorelinkMetric | null;
};

export type CorelinkJobType = "shutdown";

export type CorelinkJob = {
  id: number;
  machine_id: number;
  machine_key: string;
  machine_name: string;
  job_type: CorelinkJobType | string;
  status: string;
  not_before_at: string | null;
  created_at: string;
};

export type CorelinkEnvelope<T> = {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
};
