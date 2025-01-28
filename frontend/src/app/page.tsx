"use client";

import { useState, useEffect } from "react";
import { BackupJob, BackupResult } from "../types";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";

export default function Home() {
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [results, setResults] = useState<BackupResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const [jobsResponse, resultsResponse] = await Promise.all([
        fetch(`http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/jobs/`),
        fetch(`http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/results/`),
      ]);

      if (!jobsResponse.ok || !resultsResponse.ok) {
        throw new Error("Failed to fetch data");
      }

      const jobsData = await jobsResponse.json();
      const resultsData = await resultsResponse.json();

      setJobs(jobsData);
      setResults(resultsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const executeBackup = async (jobId: number) => {
    setError(null);
    try {
      const response = await fetch(
        `http://${process.env.NEXT_PUBLIC_SERVER_IP}:8686/jobs/${jobId}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) throw new Error("Failed to execute backup");
      await fetchData(); // Refresh data after execution
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const handleActionClick = (
    jobId: number,
    action: "edit" | "run" | "delete"
  ) => {
    setActiveDropdown(null);
    switch (action) {
      case "run":
        executeBackup(jobId);
        break;
      case "delete":
        // TODO: Implement delete
        break;
      case "edit":
        // TODO: Implement edit
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

  if (isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );

  return (
    <div className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Backup Jobs</h1>

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
                    <h2 className="text-lg font-semibold text-gray-100">
                      {job.name}
                    </h2>
                    {latestResult && (
                      <span
                        className={`text-sm px-2 py-1 rounded-full ${
                          latestResult.status === "success"
                            ? "bg-green-900/50 text-green-400"
                            : "bg-red-900/50 text-red-400"
                        }`}
                      >
                        {latestResult.status}
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
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg border border-gray-700 z-10">
                      <div className="py-1">
                        <button
                          onClick={() => handleActionClick(job.id, "run")}
                          className="w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 text-left"
                        >
                          Run Now
                        </button>
                        <button
                          onClick={() => handleActionClick(job.id, "edit")}
                          className="w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 text-left"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleActionClick(job.id, "delete")}
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
    </div>
  );
}
