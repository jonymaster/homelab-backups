import { useEffect, useRef } from "react";
import { BackupResult } from "@/types";

interface JobResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobName: string;
  results: BackupResult[];
}

export default function JobResultsModal({
  isOpen,
  onClose,
  jobName,
  results,
}: JobResultsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  if (!isOpen) return null;

  // Sort results chronologically
  const sortedResults = [...results].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[75vh] overflow-y-auto"
      >
        <h2 className="text-xl font-bold mb-4 text-gray-100">
          {jobName} - Results
        </h2>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
        >
          &times;
        </button>
        <div className="space-y-4">
          {sortedResults.map((result) => (
            <div key={result.id} className="p-4 bg-gray-700 rounded-md">
              <p className="text-sm text-gray-300">Status: {result.status}</p>
              <p className="text-sm text-gray-300">
                Timestamp: {new Date(result.timestamp).toLocaleString()}
              </p>
              <p className="text-sm text-gray-300">Details: {result.details}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
