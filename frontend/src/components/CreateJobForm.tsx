import { useState } from "react";
import { BackupJob } from "@/types";
import DirectorySuggestions from "./DirectorySuggestions";

interface JobFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: Partial<BackupJob>) => Promise<void>;
}

export default function JobForm({ isOpen, onClose, onSubmit }: JobFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    source: "/app/source",
    destination: "/app/destination",
    schedule: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
    onClose();
    setFormData({
      name: "",
      source: "/app/source",
      destination: "/app/destination",
      schedule: "",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl">
        <h2 className="text-xl font-bold mb-4 text-gray-100">
          Create New Backup Job
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-gray-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Source Path
            </label>
            <input
              type="text"
              value={formData.source}
              onChange={(e) =>
                setFormData({ ...formData, source: e.target.value })
              }
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-gray-100"
              required
            />
            <DirectorySuggestions
              path={formData.source}
              onSelect={(path) => setFormData({ ...formData, source: path })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Destination Path
            </label>
            <input
              type="text"
              value={formData.destination}
              onChange={(e) =>
                setFormData({ ...formData, destination: e.target.value })
              }
              className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-gray-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">
              Schedule (cron format)
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={formData.schedule}
                onChange={(e) =>
                  setFormData({ ...formData, schedule: e.target.value })
                }
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-gray-100"
                required
              />
              <span className="ml-2 text-gray-400 cursor-pointer relative group">
                ?
                <div className="absolute left-0 mt-2 w-72 p-3 bg-gray-700 text-gray-100 rounded-md shadow-lg text-sm hidden group-hover:block">
                  <p className="font-bold">Cron Format Examples:</p>
                  <ul className="list-disc list-inside">
                    <li>
                      Every day at 1:30 PM: <code>30 13 * * *</code>
                    </li>
                    <li>
                      Every week at 1:00 AM: <code>0 1 * * 0</code>
                    </li>
                  </ul>
                </div>
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
