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

export interface Job {
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

export type JobInput = Pick<Job, "name" | "source" | "destination" | "schedule">;

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
  listDirectory: async (path: string) =>
    (
      await request<{ directories?: string[] }>(
        `/list-directory${query({ path })}`
      )
    ).directories ?? [],
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";
