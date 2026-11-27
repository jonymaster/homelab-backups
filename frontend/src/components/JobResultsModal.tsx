"use client";

import { BackupResult } from "@/types";
import { statusMeta } from "@/utils/status";
import Modal from "./Modal";

interface JobResultsModalProps {
  onClose: () => void;
  jobName: string;
  results: BackupResult[];
}

export default function JobResultsModal({
  onClose,
  jobName,
  results,
}: JobResultsModalProps) {
  const sorted = [...results].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <Modal title={`${jobName} - Results`} onClose={onClose}>
      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No runs yet. Results appear here after the first backup.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((result) => {
            const meta = statusMeta(result.status);
            return (
              <li key={result.id} className="rounded-md bg-gray-700 p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${meta.className}`}
                  >
                    {meta.label}
                  </span>
                  <time className="text-sm text-gray-300">
                    {new Date(result.timestamp).toLocaleString()}
                  </time>
                </div>
                {result.details && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-300">
                    {result.details}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
