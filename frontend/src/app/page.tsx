"use client";

import { useState, useEffect, useRef } from "react";
import { BackupJob, BackupResult } from "../types";
import { EllipsisVerticalIcon, PlusIcon } from "@heroicons/react/24/outline";
import CreateJobForm from "../components/CreateJobForm";
import EditJobForm from "../components/EditJobForm";
import JobResultsModal from "@/components/JobResultsModal";
import {
  fetchData,
  executeBackup,
  updateJob,
  createJob,
  deleteJob,
  getResultsForJob,
} from "./api";

export default function Home() {
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [results, setResults] = useState<BackupResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [isJobFormOpen, setIsJobFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<BackupJob | null>(null);
  const [isJobResultsModalOpen, setIsJobResultsModalOpen] = useState(false);
  const [selectedJobResults, setSelectedJobResults] = useState<BackupResult[]>(
    []
  );
  const [selectedJobName, setSelectedJobName] = useState<string>("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [jobs, results] = await fetchData();
        setJobs(jobs);
        setResults(results);
        setIsLoading(false);
      } catch (error: unknown) {
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError("An unknown error occurred");
        }
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (jobs.some((job) => job.status === "running")) {
        try {
          const [jobs, results] = await fetchData();
          setJobs(jobs);
          setResults(results);
        } catch (error: unknown) {
          if (error instanceof Error) {
            setError(error.message);
          } else {
            setError("An unknown error occurred");
          }
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs]);

  const handleClickOutside = (event: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
      setActiveDropdown(null);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleExecuteBackup = async (jobId: number) => {
    setError(null);
    try {
      await executeBackup(jobId);
      const [jobs, results] = await fetchData();
      setJobs(jobs);
      setResults(results);
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : "Failed to execute backup"
      );
    }
  };

  const handleDeleteBackup = async (jobId: number) => {
    setError(null);
    try {
      await deleteJob(jobId);
      const [jobs, results] = await fetchData();
      setJobs(jobs);
      setResults(results);
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : "Failed to delete backup"
      );
    }
  };

  const handleUpdateJob = async (
    jobId: number,
    jobData: Partial<BackupJob>
  ) => {
    setError(null);
    try {
      await updateJob(jobId, jobData);
      const [jobs, results] = await fetchData();
      setJobs(jobs);
      setResults(results);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to update job");
    }
  };

  const handleCreateJob = async (jobData: Partial<BackupJob>) => {
    setError(null);
    try {
      await createJob(jobData);
      const [jobs, results] = await fetchData();
      setJobs(jobs);
      setResults(results);
      setIsJobFormOpen(false);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to create job");
    }
  };

  const handleActionClick = (
    jobId: number,
    action: "edit" | "run" | "delete"
  ) => {
    setActiveDropdown(null);
    switch (action) {
      case "run":
        handleExecuteBackup(jobId);
        break;
      case "delete":
        handleDeleteBackup(jobId);
        break;
      case "edit":
        const jobToEdit = jobs.find((job) => job.id === jobId);
        if (jobToEdit) {
          setSelectedJob(jobToEdit);
          setIsEditFormOpen(true);
        }
        break;
    }
  };

  const getLatestResultForJob = (jobId: number) => {
    const jobResults = results
      .filter((result) => result.job_id === jobId)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    return jobResults[0];
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const handleJobTitleClick = async (jobName: string, jobId: number) => {
    try {
      const results = await getResultsForJob(jobId); // Await the promise
      setSelectedJobResults(results); // Set the state with the resolved value
      setSelectedJobName(jobName);
      setIsJobResultsModalOpen(true);
    } catch (error) {
      console.error("Failed to fetch results for job:", error);
    }
  };

  if (isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );

  return (
    <div className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Backup Jobs</h1>
          <button
            onClick={() => setIsJobFormOpen(true)}
            className="p-2 bg-blue-600 rounded-full hover:bg-blue-700"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-900/50 text-red-200 rounded-lg border border-red-700">
            {error}
          </div>
        )}

        <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700">
          {jobs.map((job) => {
            const latestResult = getLatestResultForJob(job.id);

            return (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <h2
                      className="text-lg font-semibold text-gray-100 cursor-pointer"
                      onClick={() => handleJobTitleClick(job.name, job.id)}
                    >
                      {job.name}
                    </h2>
                    {job.status && (
                      <span
                        className={`text-sm px-2 py-1 rounded-full ${
                          job.status === "completed"
                            ? "bg-green-900/50 text-green-400"
                            : job.status === "running"
                            ? "bg-orange-900/50 text-orange-400"
                            : job.status === "pending"
                            ? "bg-blue-900/50 text-blue-400"
                            : "bg-red-900/50 text-red-400"
                        }`}
                      >
                        {job.status}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
                    <div>
                      <p>Schedule: {job.schedule}</p>
                      <p>Source: {job.source}</p>
                    </div>
                    {latestResult && (
                      <div>
                        <p>
                          Last run: {formatTimestamp(latestResult.timestamp)}
                        </p>
                        {latestResult.result && (
                          <p
                            className="truncate max-w-md"
                            title={latestResult.result}
                          >
                            {latestResult.result.split("\n")[0]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={() =>
                      setActiveDropdown(
                        activeDropdown === job.id ? null : job.id
                      )
                    }
                    className="p-2 hover:bg-gray-600 rounded-full"
                  >
                    <EllipsisVerticalIcon className="h-5 w-5 text-gray-400" />
                  </button>

                  {activeDropdown === job.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg border border-gray-700 z-10"
                    >
                      <div className="py-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActionClick(job.id, "run");
                          }}
                          className="w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 text-left"
                        >
                          Run Now
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActionClick(job.id, "edit");
                          }}
                          className="w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 text-left"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActionClick(job.id, "delete");
                          }}
                          className="w-full px-4 py-2 text-sm text-red-400 hover:bg-gray-700 text-left"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CreateJobForm
        isOpen={isJobFormOpen}
        onClose={() => setIsJobFormOpen(false)}
        onSubmit={handleCreateJob}
      />

      {selectedJob && (
        <EditJobForm
          job={selectedJob}
          isOpen={isEditFormOpen}
          onClose={() => {
            setIsEditFormOpen(false);
            setSelectedJob(null);
          }}
          onSubmit={handleUpdateJob}
        />
      )}

      <JobResultsModal
        isOpen={isJobResultsModalOpen}
        onClose={() => setIsJobResultsModalOpen(false)}
        jobName={selectedJobName}
        results={selectedJobResults}
      />
    </div>
  );
}
