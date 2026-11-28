"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage, type Job, type RunQuery } from "./api";
import { validTimeZone } from "./format";

const FAST = 3_000;
const SLOW = 30_000;

export const keys = {
  jobs: ["jobs"] as const,
  job: (id: number) => ["jobs", id] as const,
  jobStats: (id: number) => ["jobs", id, "stats"] as const,
  snapshots: (id: number) => ["jobs", id, "snapshots"] as const,
  runs: (q: RunQuery) => ["runs", q] as const,
  run: (id: number) => ["runs", "detail", id] as const,
  dashboard: ["dashboard"] as const,
  server: ["server"] as const,
};

const isRunning = (job: Job) => job.status === "running" || job.health === "running";

export function useJobs() {
  return useQuery({
    queryKey: keys.jobs,
    queryFn: api.jobs,
    refetchInterval: (query) =>
      query.state.data?.some(isRunning) ? FAST : SLOW,
  });
}

/** Every view polls fast while any job is running, slowly otherwise. */
export function usePollInterval() {
  const { data } = useJobs();
  return data?.some(isRunning) ? FAST : SLOW;
}

export function useJob(id: number) {
  const interval = usePollInterval();
  return useQuery({
    queryKey: keys.job(id),
    queryFn: () => api.job(id),
    refetchInterval: interval,
    enabled: Number.isFinite(id),
  });
}

export function useJobStats(id: number) {
  const interval = usePollInterval();
  return useQuery({
    queryKey: keys.jobStats(id),
    queryFn: () => api.jobStats(id),
    refetchInterval: interval,
  });
}

export function useSnapshots(id: number) {
  const interval = usePollInterval();
  return useQuery({
    queryKey: keys.snapshots(id),
    queryFn: () => api.snapshots(id),
    refetchInterval: interval,
  });
}

export function useRuns(q: RunQuery) {
  const interval = usePollInterval();
  return useQuery({
    queryKey: keys.runs(q),
    queryFn: () => api.runs(q),
    refetchInterval: interval,
    placeholderData: keepPreviousData,
  });
}

export function useRun(id: number | null) {
  const interval = usePollInterval();
  return useQuery({
    queryKey: keys.run(id ?? -1),
    queryFn: () => api.run(id!),
    enabled: id !== null,
    // Keeps the panel filled while it animates closed.
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? FAST : interval,
  });
}

export function useDashboard() {
  const interval = usePollInterval();
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: api.dashboard,
    refetchInterval: interval,
  });
}

export function useServer() {
  return useQuery({
    queryKey: keys.server,
    queryFn: api.server,
    refetchInterval: 60_000,
  });
}

/** Absolute times render in the server zone, which is what schedules use. */
export function useServerTimeZone(): string | undefined {
  const { data } = useServer();
  return validTimeZone(data?.timezone);
}

export function useJobActions() {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.jobs }),
      client.invalidateQueries({ queryKey: ["runs"] }),
      client.invalidateQueries({ queryKey: keys.dashboard }),
    ]);
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const run = useMutation({
    mutationFn: (job: Job) => api.runJob(job.id),
    onSuccess: (_, job) => toast.success(`Started ${job.name}`),
    onError,
    onSettled: refresh,
  });
  const pause = useMutation({
    mutationFn: (job: Job) => api.pauseJob(job.id),
    onSuccess: (_, job) =>
      toast.success(`Paused ${job.name}`, {
        description: "Scheduled runs are skipped until you resume it.",
      }),
    onError,
    onSettled: refresh,
  });
  const resume = useMutation({
    mutationFn: (job: Job) => api.resumeJob(job.id),
    onSuccess: (_, job) => toast.success(`Resumed ${job.name}`),
    onError,
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (job: Job) => api.deleteJob(job.id),
    onSuccess: (_, job) => {
      client.removeQueries({ queryKey: keys.job(job.id) });
      toast.success(`Deleted ${job.name}`);
    },
    onError,
    onSettled: refresh,
  });

  return { run, pause, resume, remove, refresh };
}
