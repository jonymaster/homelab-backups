"use client";

import { useState } from "react";
import { BackupJob } from "@/types";
import {
  DESTINATION_ROOT,
  SOURCE_ROOT,
  defaultDestination,
  isInside,
  trimSlash,
} from "@/utils/paths";
import Modal from "./Modal";
import FolderField from "./FolderField";
import ScheduleField from "./ScheduleField";

export type JobInput = Pick<
  BackupJob,
  "name" | "source" | "destination" | "schedule"
>;

interface JobFormProps {
  /** Present when editing an existing job. */
  job?: BackupJob;
  onSubmit: (data: JobInput) => Promise<void>;
  onClose: () => void;
}

export default function JobForm({ job, onSubmit, onClose }: JobFormProps) {
  const isEdit = job !== undefined;
  const [name, setName] = useState(job?.name ?? "");
  const [source, setSource] = useState(job?.source ?? SOURCE_ROOT);
  const [destination, setDestination] = useState(
    job?.destination ?? DESTINATION_ROOT
  );
  // Until the user edits the destination, it tracks the job name.
  const [destinationTouched, setDestinationTouched] = useState(isEdit);
  const [schedule, setSchedule] = useState(job?.schedule ?? "0 2 * * *");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const changeName = (value: string) => {
    setName(value);
    if (!destinationTouched) setDestination(defaultDestination(value));
  };

  const changeDestination = (value: string) => {
    setDestinationTouched(true);
    setDestination(value);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!schedule) {
      setError("Choose when the backup should run.");
      return;
    }
    if (trimSlash(destination) === DESTINATION_ROOT) {
      setError(`Choose a folder inside ${DESTINATION_ROOT}.`);
      return;
    }
    if (!isInside(source, SOURCE_ROOT) || !isInside(destination, DESTINATION_ROOT)) {
      setError(
        `Source must be inside ${SOURCE_ROOT} and destination inside ${DESTINATION_ROOT}.`
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        source: trimSlash(source),
        destination: trimSlash(destination),
        schedule,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? "Edit backup" : "New backup"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label
            htmlFor="job-name"
            className="block text-sm font-medium text-gray-300"
          >
            Name
          </label>
          <input
            id="job-name"
            type="text"
            value={name}
            onChange={(e) => changeName(e.target.value)}
            placeholder="Photos"
            autoFocus
            required
            className="mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100"
          />
        </div>

        <FolderField
          label="Folder to back up"
          value={source}
          root={SOURCE_ROOT}
          onChange={setSource}
        />

        <FolderField
          label="Save backups to"
          value={destination}
          root={DESTINATION_ROOT}
          onChange={changeDestination}
          hint="The folder is created automatically if it does not exist."
        />

        <ScheduleField initialCron={job?.schedule} onChange={setSchedule} />

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-700 bg-red-900/50 p-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Saving..." : isEdit ? "Save changes" : "Create backup"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
