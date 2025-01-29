import { BackupJob, BackupResult } from "../types";

export const fetchData = async (): Promise<[BackupJob[], BackupResult[]]> => {
  const [jobsResponse, resultsResponse] = await Promise.all([
    fetch(`http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/jobs/`),
    fetch(`http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/results/`),
  ]);

  if (!jobsResponse.ok || !resultsResponse.ok) {
    throw new Error("Failed to fetch data");
  }

  const jobs = await jobsResponse.json();
  const results = await resultsResponse.json();

  return [jobs, results];
};

export const createJob = async (jobData: Partial<BackupJob>): Promise<void> => {
  if (!jobData.name || !jobData.schedule || !jobData.source) {
    throw new Error("Missing required job data");
  }

  const response = await fetch(
    `http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/jobs/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jobData),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to create job");
  }
};

export const executeBackup = async (jobId: number): Promise<void> => {
  const response = await fetch(
    `http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/jobs/${jobId}/execute`,
    { method: "POST" }
  );

  if (!response.ok) {
    throw new Error("Failed to execute backup");
  }
};

export const updateJob = async (jobId: number, jobData: Partial<BackupJob>): Promise<void> => {
  const response = await fetch(
    `http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/jobs/${jobId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jobData),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to update job");
  }
};

export const listDirectory = async (path: string): Promise<string[]> => {
  const response = await fetch(`http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/list-directory?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    throw new Error("Failed to list directory");
  }
  const data = await response.json();
  return data.directories;
};