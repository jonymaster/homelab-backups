import type { Clock } from "./format";

export type RunStatus = "success" | "failed" | "running";
export type JobHealth =
  | "healthy"
  | "failing"
  | "stale"
  | "running"
  | "paused"
  | "new";

export interface LastRun {
  id: number;
  status: RunStatus;
  started_at: string | null;
  duration_seconds: number | null;
  size_change_bytes: number | null;
}

export type NotifyMode = "default" | "always" | "never";

/** Per-job options; omitted on create, the backend applies settings defaults. */
export interface JobOptions {
  /** null keeps every increment. */
  retention_days: number | null;
  exclude_presets: string[];
  exclude_patterns: string[];
  notify: NotifyMode;
  ping_url: string | null;
}

export interface Job extends JobOptions {
  id: number;
  name: string;
  source: string;
  destination: string;
  schedule: string;
  status: string;
  paused: boolean;
  created_at: string | null;
  next_run: string | null;
  last_run: LastRun | null;
  last_success_at: string | null;
  health: JobHealth;
  /** Last 14 finished runs, oldest first. */
  history: ("success" | "failed")[];
  /** 0..1 */
  success_rate_30d: number | null;
  avg_duration_30d: number | null;
}

export type JobInput = Pick<Job, "name" | "source" | "destination" | "schedule"> &
  Partial<JobOptions>;

export interface JobStats {
  total_runs: number;
  success_runs: number;
  failed_runs: number;
  backup_size_bytes: number | null;
  snapshot_count: number;
  oldest_snapshot: string | null;
  chart: {
    started_at: string | null;
    size_change_bytes: number | null;
    duration_seconds: number | null;
  }[];
}

export interface Run {
  id: number;
  job_id: number;
  job_name: string | null;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  source_files: number | null;
  source_size_bytes: number | null;
  new_files: number | null;
  changed_files: number | null;
  deleted_files: number | null;
  size_change_bytes: number | null;
  increment_size_bytes: number | null;
  errors: number | null;
}

export interface RunDetail extends Run {
  log: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface RunQuery {
  job_id?: number;
  status?: RunStatus;
  limit?: number;
  offset?: number;
}

export interface Snapshot {
  at: string;
}

export interface Disk {
  path: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
}

export interface Dashboard {
  jobs: {
    total: number;
    healthy: number;
    failing: number;
    stale: number;
    running: number;
    paused: number;
  };
  runs_30d: { total: number; success: number; failed: number };
  upcoming: { job_id: number; job_name: string; at: string }[];
  disks: Disk[];
  calendar: {
    job_id: number;
    job_name: string;
    days: { date: string; status: "success" | "failed" | "none" }[];
  }[];
}

export interface ServerInfo {
  time: string;
  timezone: string;
  version: string;
}

export type ThemeChoice = "dark" | "light" | "system";

export type NotificationEvent =
  | "run_failed"
  | "run_recovered"
  | "job_stale"
  | "disk_low"
  | "run_succeeded"
  | "weekly_summary";

export interface Settings {
  general: {
    clock: Clock;
    default_theme: ThemeChoice;
    base_url: string | null;
  };
  notifications: {
    events: Record<NotificationEvent, boolean>;
    /** 0 = Monday … 6 = Sunday */
    weekly_summary_day: number;
    /** "HH:MM" */
    weekly_summary_time: string;
  };
  monitoring: {
    /** 50..99 */
    disk_warning_percent: number;
    metrics_enabled: boolean;
  };
  defaults: {
    retention_days: number | null;
    exclude_presets: string[];
    exclude_patterns: string[];
    /** "HH:MM" */
    schedule_time: string;
  };
  maintenance: {
    update_check: boolean;
  };
}

export type SettingsSection = keyof Settings;

/** `PUT /settings` deep-merges each section. */
export type SettingsPatch = { [K in SettingsSection]?: Partial<Settings[K]> };

export interface ChannelField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  default?: string | number | null;
  placeholder?: string;
  type?: "text" | "number" | "select";
  options?: string[];
}

export interface ChannelType {
  type: string;
  label: string;
  fields: ChannelField[];
}

export type ChannelConfig = Record<string, string | number>;

export interface Channel {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  /** Secrets come back as SECRET_PLACEHOLDER when set, "" when not. */
  config: ChannelConfig;
  created_at: string | null;
}

export interface ChannelInput {
  name: string;
  type: string;
  enabled?: boolean;
  config: ChannelConfig;
}

export type ChannelPatch = Partial<Pick<Channel, "name" | "enabled" | "config">>;

export interface TestResult {
  ok: boolean;
  error: string | null;
}

export interface NotificationLogEntry {
  id: number;
  at: string;
  event: NotificationEvent | "test";
  job_id: number | null;
  job_name: string | null;
  title: string;
  ok: boolean;
  error: string | null;
}

export interface ExcludePreset {
  id: string;
  label: string;
  patterns: string[];
}

export interface ImportResult {
  jobs_created: number;
  jobs_skipped: string[];
  channels_created: number;
  settings_applied: boolean;
  errors: string[];
}

export interface UpdateInfo {
  current: string;
  latest: string | null;
  update_available: boolean;
  release_url: string | null;
  checked_at: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// FastAPI returns `detail` as a string, or a list of {msg} objects for 422s.
async function errorFrom(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
      message = body.detail
        .map((d: { msg: string }) => d.msg.replace(/^Value error, /, ""))
        .join("; ");
    }
  } catch {
    // Non-JSON error body: keep the generic message.
  }
  return new ApiError(message, response.status);
}

// Paths have no trailing slash: Next.js answers `/api/x/` with a 308.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  jobs: () => request<Job[]>("/jobs"),
  job: (id: number) => request<Job>(`/jobs/${id}`),
  createJob: (input: JobInput) => send<Job>("POST", "/jobs", input),
  updateJob: (id: number, input: JobInput) =>
    send<Job>("PUT", `/jobs/${id}`, input),
  deleteJob: (id: number) => send<void>("DELETE", `/jobs/${id}`),
  runJob: (id: number) => send<void>("POST", `/jobs/${id}/execute`),
  pauseJob: (id: number) => send<Job>("POST", `/jobs/${id}/pause`),
  resumeJob: (id: number) => send<Job>("POST", `/jobs/${id}/resume`),
  jobStats: (id: number) => request<JobStats>(`/jobs/${id}/stats`),
  snapshots: (id: number) => request<Snapshot[]>(`/jobs/${id}/snapshots`),
  runs: (q: RunQuery) =>
    request<Page<Run>>(`/runs${query({ ...q })}`),
  run: (id: number) => request<RunDetail>(`/runs/${id}`),
  dashboard: () => request<Dashboard>("/dashboard"),
  server: () => request<ServerInfo>("/server"),
  settings: () => request<Settings>("/settings"),
  updateSettings: (patch: SettingsPatch) =>
    send<Settings>("PUT", "/settings", patch),
  channelTypes: () => request<ChannelType[]>("/notifications/channel-types"),
  channels: () => request<Channel[]>("/notifications/channels"),
  createChannel: (input: ChannelInput) =>
    send<Channel>("POST", "/notifications/channels", input),
  updateChannel: (id: number, patch: ChannelPatch) =>
    send<Channel>("PUT", `/notifications/channels/${id}`, patch),
  deleteChannel: (id: number) =>
    send<void>("DELETE", `/notifications/channels/${id}`),
  testChannel: (id: number) =>
    send<TestResult>("POST", `/notifications/channels/${id}/test`),
  testUnsavedChannel: (type: string, config: ChannelConfig) =>
    send<TestResult>("POST", "/notifications/test", { type, config }),
  notificationLog: (limit = 50) =>
    request<NotificationLogEntry[]>(`/notifications/log${query({ limit })}`),
  excludePresets: () => request<ExcludePreset[]>("/exclude-presets"),
  importConfig: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<ImportResult>("/import", { method: "POST", body });
  },
  updates: () => request<UpdateInfo>("/updates"),
  listDirectory: async (path: string) =>
    (
      await request<{ directories?: string[] }>(
        `/list-directory${query({ path })}`
      )
    ).directories ?? [],
};

/** Plain links so the browser handles the download and its file name. */
export const downloads = {
  export: "/api/export",
  databaseBackup: "/api/backup/db",
  metrics: "/api/metrics",
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";
