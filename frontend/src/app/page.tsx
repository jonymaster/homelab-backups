"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BackupJob, BackupResult } from "../types";
import { EllipsisVerticalIcon, PlusIcon } from "@heroicons/react/24/outline";
import JobForm, { JobInput } from "../components/JobForm";
import JobResultsModal from "../components/JobResultsModal";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  ApiError,
  fetchData,
  executeBackup,
  updateJob,
  createJob,
  deleteJob,
  getResultsForJob,
} from "./api";
import { describeCron } from "@/utils/schedule";
import { statusMeta } from "@/utils/status";

const POLL_INTERVAL_MS = 3000;
// Covers the gap before the backend reports a freshly started job as running.
const POST_RUN_POLL_MS = 15000;

type FormState = { mode: "create" } | { mode: "edit"; job: BackupJob } | null;

const messageOf = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

export default function Home() {
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [results, setResults] = useState<BackupResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [jobToDelete, setJobToDelete] = useState<BackupJob | null>(null);
  const [resultsView, setResultsView] = useState<{
    name: string;
    results: BackupResult[];
  } | null>(null);
  const [pollUntil, setPollUntil] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [nextJobs, nextResults] = await fetchData();
    setJobs(nextJobs);
    setResults(nextResults);
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) => setError(messageOf(e, "Failed to load backups")))
      .finally(() => setIsLoading(false));
  }, [refresh]);

  const hasRunning = jobs.some((job) => statusMeta(job.status).running);
  const shouldPoll = hasRunning || pollUntil > 0;

  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(async () => {
      try {
        await refresh();
      } catch (e) {
        setError(messageOf(e, "Failed to refresh backups"));
      }
      setPollUntil((until) => (until > 0 && Date.now() > until ? 0 : until));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [shouldPoll, refresh]);

  useEffect(() => {
    if (activeDropdown === null) return;
    const onMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveDropdown(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeDropdown]);

  const handleRun = async (jobId: number) => {
    setError(null);
    try {
      await executeBackup(jobId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("This backup is already running.");
      } else {
        setError(messageOf(e, "Failed to start backup"));
        return;
      }
    }
    setPollUntil(Date.now() + POST_RUN_POLL_MS);
    try {
      await refresh();
    } catch (e) {
      setError(messageOf(e, "Failed to refresh backups"));
    }
  };

  // Form and dialog handlers throw so the open dialog can show the error.
  const handleSubmitJob = async (data: JobInput) => {
    if (form?.mode === "edit") {
      await updateJob(form.job.id, data);
    } else {
      await createJob(data);
    }
    setForm(null);
    await refresh().catch((e) =>
      setError(messageOf(e, "Failed to refresh backups"))
    );
  };

  const handleConfirmDelete = async () => {
    if (!jobToDelete) return;
    await deleteJob(jobToDelete.id);
    setJobToDelete(null);
    await refresh().catch((e) =>
      setError(messageOf(e, "Failed to refresh backups"))
    );
  };

  const handleShowResults = async (job: BackupJob) => {
    setError(null);
    try {
      setResultsView({ name: job.name, results: await getResultsForJob(job.id) });
    } catch (e) {
      setError(messageOf(e, "Failed to load results"));
    }
  };

  const handleMenuAction = (job: BackupJob, action: "edit" | "run" | "delete") => {
    setActiveDropdown(null);
    if (action === "run") handleRun(job.id);
    else if (action === "edit") setForm({ mode: "edit", job });
    else setJobToDelete(job);
  };

  const getLatestResultForJob = (jobId: number) =>
    results
      .filter((result) => result.job_id === jobId)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];

  const formatTimestamp = (timestamp: string) =>
    new Date(timestamp).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  if (isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div
          role="status"
          aria-label="Loading"
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"
        />
      </div>
    );

  return (
    <main className="min-h-screen bg-gray-900 p-4 text-gray-100 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold sm:text-3xl">Homelab Backups</h1>
          <button
            onClick={() => setForm({ mode: "create" })}
            className="flex items-center gap-2 rounded-full bg-blue-600 py-2 pl-3 pr-4 hover:bg-blue-700"
          >
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
            New backup
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-200"
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="text-red-300 hover:text-red-100"
            >
              &times;
            </button>
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-10 text-center shadow-xl">
            <h2 className="text-xl font-semibold">No backups yet</h2>
            <p className="mx-auto mt-2 max-w-md text-gray-400">
              Pick a folder, choose when to run, and you are done. Backups are
              incremental, so past versions stay available.
            </p>
            <button
              onClick={() => setForm({ mode: "create" })}
              className="mt-6 rounded-md bg-blue-600 px-5 py-2 hover:bg-blue-700"
            >
              Create your first backup
            </button>
          </div>
        ) : (
          <ul className="rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
            {jobs.map((job) => {
              const latestResult = getLatestResultForJob(job.id);
              const meta = job.status ? statusMeta(job.status) : null;

              return (
                <li
                  key={job.id}
                  className="flex items-start justify-between gap-2 border-b border-gray-700 p-4 last:border-b-0 hover:bg-gray-700/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <h2 className="text-lg font-semibold">
                        <button
                          onClick={() => handleShowResults(job)}
                          className="text-left hover:underline"
                          title="View results"
                        >
                          {job.name}
                        </button>
                      </h2>
                      {meta && (
                        <span
                          className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-sm ${meta.className}`}
                        >
                          {meta.running && (
                            <span
                              className="h-2 w-2 animate-pulse rounded-full bg-orange-400"
                              aria-hidden="true"
                            />
                          )}
                          {meta.label}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm text-gray-400 sm:grid-cols-2">
                      <div className="min-w-0">
                        <p title={job.schedule}>{describeCron(job.schedule)}</p>
                        <p className="truncate" title={job.source}>
                          From {job.source}
                        </p>
                      </div>
                      {latestResult && (
                        <div className="min-w-0">
                          <p>
                            Last run: {formatTimestamp(latestResult.timestamp)}
                          </p>
                          {latestResult.result && (
                            <p
                              className="truncate"
                              title={latestResult.result}
                            >
                              {latestResult.result.split("\n")[0]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className="relative"
                    ref={activeDropdown === job.id ? menuRef : undefined}
                  >
                    <button
                      onClick={() =>
                        setActiveDropdown(
                          activeDropdown === job.id ? null : job.id
                        )
                      }
                      aria-label={`Actions for ${job.name}`}
                      aria-haspopup="menu"
                      aria-expanded={activeDropdown === job.id}
                      className="rounded-full p-2 hover:bg-gray-600"
                    >
                      <EllipsisVerticalIcon className="h-5 w-5 text-gray-400" />
                    </button>

                    {activeDropdown === job.id && (
                      <div
                        role="menu"
                        className="absolute right-0 z-10 mt-2 w-48 rounded-md border border-gray-700 bg-gray-800 py-1 shadow-lg"
                      >
                        <button
                          role="menuitem"
                          onClick={() => handleMenuAction(job, "run")}
                          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700"
                        >
                          Run Now
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => handleMenuAction(job, "edit")}
                          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700"
                        >
                          Edit
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => handleMenuAction(job, "delete")}
                          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && (
        <JobForm
          job={form.mode === "edit" ? form.job : undefined}
          onSubmit={handleSubmitJob}
          onClose={() => setForm(null)}
        />
      )}

      {jobToDelete && (
        <ConfirmDialog
          title="Delete backup?"
          message={`"${jobToDelete.name}" will stop running on schedule. Files already backed up are not deleted.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onClose={() => setJobToDelete(null)}
        />
      )}

      {resultsView && (
        <JobResultsModal
          jobName={resultsView.name}
          results={resultsView.results}
          onClose={() => setResultsView(null)}
        />
      )}
    </main>
  );
}
