import { BackupJob, BackupResult } from "../types";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

type JobInput = Pick<BackupJob, "name" | "source" | "destination" | "schedule">;

// FastAPI returns `detail` as a string, or a list of {msg} objects for 422s.
async function errorFrom(response: Response, fallback: string) {
  let message = fallback;
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
      message = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    }
  } catch {
    // Non-JSON error body: keep the fallback.
  }
  return new ApiError(message, response.status);
}

async function request(url: string, init: RequestInit, fallback: string) {
  const response = await fetch(url, init);
  if (!response.ok) throw await errorFrom(response, fallback);
  return response;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const fetchData = async (): Promise<[BackupJob[], BackupResult[]]> => {
  const [jobsResponse, resultsResponse] = await Promise.all([
    request("/api/jobs/", {}, "Failed to load backups"),
    request("/api/results/", {}, "Failed to load results"),
  ]);
  return [await jobsResponse.json(), await resultsResponse.json()];
};

export const createJob = async (job: JobInput): Promise<void> => {
  await request("/api/jobs/", jsonInit("POST", job), "Failed to create backup");
};

export const updateJob = async (
  jobId: number,
  job: JobInput
): Promise<void> => {
  await request(
    `/api/jobs/${jobId}`,
    jsonInit("PUT", job),
    "Failed to update backup"
  );
};

export const deleteJob = async (jobId: number): Promise<void> => {
  await request(
    `/api/jobs/${jobId}`,
    { method: "DELETE" },
    "Failed to delete backup"
  );
};

export const executeBackup = async (jobId: number): Promise<void> => {
  await request(
    `/api/jobs/${jobId}/execute`,
    { method: "POST" },
    "Failed to start backup"
  );
};

export const listDirectory = async (path: string): Promise<string[]> => {
  const response = await request(
    `/api/list-directory?path=${encodeURIComponent(path)}`,
    {},
    "Failed to list folder"
  );
  const data = await response.json();
  return data.directories ?? [];
};

export const getResultsForJob = async (
  jobId: number
): Promise<BackupResult[]> => {
  const response = await request(
    `/api/jobs/${jobId}/results/`,
    {},
    "Failed to load results"
  );
  return (await response.json()) ?? [];
};
