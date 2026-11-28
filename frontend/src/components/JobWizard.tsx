"use client";

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckIcon, FolderSearchIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  api,
  errorMessage,
  type Job,
  type JobInput,
  type NotifyMode,
  type Settings,
} from "@/lib/api";
import { formatBytes } from "@/lib/format";
import {
  NOTIFY_MODES,
  dailyCronAt,
  isHttpUrl,
  notifySummary,
  parsePatterns,
  retentionSummary,
} from "@/lib/job-options";
import {
  keys,
  useClock,
  useDashboard,
  useServerTimeZone,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  DESTINATION_ROOT,
  SOURCE_ROOT,
  defaultDestination,
  isInside,
  trimSlash,
} from "@/utils/paths";
import { describeCron, isCronShaped } from "@/utils/schedule";
import FolderBrowser from "./FolderBrowser";
import { ExclusionFields, RetentionSelect } from "./JobOptionFields";
import ScheduleField from "./ScheduleField";

type StepKey = "what" | "where" | "when" | "options";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "what", label: "What" },
  { key: "where", label: "Where" },
  { key: "when", label: "When" },
  { key: "options", label: "Options" },
];

const LAST_WORKING_STEP = 2;

/** Used when settings could not be loaded; mirrors the backend defaults. */
const FALLBACK_DEFAULTS: Settings["defaults"] = {
  retention_days: 180,
  exclude_presets: ["caches", "temp", "trash"],
  exclude_patterns: [],
  schedule_time: "02:00",
};

interface Draft {
  name: string;
  source: string;
  destination: string;
  schedule: string;
  retention_days: number | null;
  exclude_presets: string[];
  /** Raw textarea content; parsed on save. */
  patterns: string;
  notify: NotifyMode;
  ping_url: string;
}

function initialDraft(job: Job | undefined, defaults: Settings["defaults"]): Draft {
  if (job) {
    return {
      name: job.name,
      source: job.source,
      destination: job.destination,
      schedule: job.schedule,
      retention_days: job.retention_days ?? null,
      exclude_presets: job.exclude_presets ?? [],
      patterns: (job.exclude_patterns ?? []).join("\n"),
      notify: job.notify ?? "default",
      ping_url: job.ping_url ?? "",
    };
  }
  return {
    name: "",
    source: SOURCE_ROOT,
    destination: DESTINATION_ROOT,
    schedule: dailyCronAt(defaults.schedule_time) ?? "0 2 * * *",
    retention_days: defaults.retention_days,
    exclude_presets: defaults.exclude_presets,
    patterns: defaults.exclude_patterns.join("\n"),
    notify: "default",
    ping_url: "",
  };
}

function validate(step: StepKey, d: Draft): string | null {
  switch (step) {
    case "what":
      if (!d.name.trim()) return "Give the backup a name.";
      if (!isInside(d.source, SOURCE_ROOT)) {
        return `Pick a source folder inside ${SOURCE_ROOT}.`;
      }
      return null;
    case "where":
      if (
        !isInside(d.destination, DESTINATION_ROOT) ||
        trimSlash(d.destination) === DESTINATION_ROOT
      ) {
        return `Pick a folder inside ${DESTINATION_ROOT}, not the root itself.`;
      }
      return null;
    case "when":
      if (!d.schedule) return "Choose when the backup should run.";
      if (!isCronShaped(d.schedule)) {
        return "A cron expression has 5 fields separated by spaces.";
      }
      return null;
    case "options":
      if (d.ping_url.trim() && !isHttpUrl(d.ping_url.trim())) {
        return "The ping URL must start with http:// or https://.";
      }
      return null;
  }
}

function StepHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-[13px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function DiskSpace({ destination }: { destination: string }) {
  const { data } = useDashboard();
  const disks = data?.disks ?? [];
  const disk =
    [...disks]
      .sort((a, b) => b.path.length - a.path.length)
      .find((d) => isInside(destination, trimSlash(d.path))) ?? disks[0];
  if (!disk) return null;
  const used = disk.total_bytes > 0 ? disk.used_bytes / disk.total_bytes : 0;
  const low = disk.total_bytes > 0 && disk.free_bytes / disk.total_bytes < 0.1;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-raised p-3.5">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>Backup disk</span>
        <span className="text-muted-foreground">
          {formatBytes(disk.free_bytes)} free of {formatBytes(disk.total_bytes)}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${Math.round(used * 100)}% used`}
        className="h-2 overflow-hidden rounded bg-border"
      >
        <div
          className={cn("h-full", low ? "bg-stale" : "bg-primary")}
          style={{ width: `${Math.min(100, used * 100)}%` }}
        />
      </div>
      {low && (
        <span className="text-[13px] text-stale">
          Less than 10% free. Backups may fail when the disk fills up.
        </span>
      )}
    </div>
  );
}

export default function JobWizard({
  job,
  defaults = FALLBACK_DEFAULTS,
  onSaved,
}: {
  /** Present when editing. */
  job?: Job;
  /** Starting values for a new job, from settings. */
  defaults?: Settings["defaults"];
  onSaved: (job: Job) => void;
}) {
  const ids = useId();
  const isEdit = job !== undefined;
  const client = useQueryClient();
  const timeZone = useServerTimeZone();
  const clock = useClock();

  const [draft, setDraft] = useState<Draft>(() => initialDraft(job, defaults));
  // Until the user edits the destination, it follows the job name.
  const [destinationTouched, setDestinationTouched] = useState(isEdit);
  const [browsingDestination, setBrowsingDestination] = useState(false);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(isEdit ? STEPS.length - 1 : 0);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: JobInput) =>
      isEdit ? api.updateJob(job.id, input) : api.createJob(input),
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: keys.jobs });
      await client.invalidateQueries({ queryKey: keys.dashboard });
      toast.success(isEdit ? "Changes saved" : `Created ${saved.name}`);
      onSaved(saved);
    },
    onError: (e) => {
      setError(errorMessage(e));
      toast.error(errorMessage(e));
    },
  });

  const patch = (changes: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...changes }));
  };

  const changeName = (name: string) =>
    patch(destinationTouched ? { name } : { name, destination: defaultDestination(name) });

  const changeDestination = (destination: string) => {
    setDestinationTouched(true);
    patch({ destination });
  };

  const goTo = (target: number) => {
    setError(null);
    setStep(target);
    setReached((r) => Math.max(r, target));
  };

  const next = () => {
    const problem = validate(STEPS[step].key, draft);
    if (problem) {
      setError(problem);
      return;
    }
    goTo(step + 1);
  };

  const submit = () => {
    for (let i = 0; i < STEPS.length; i++) {
      const problem = validate(STEPS[i].key, draft);
      if (problem) {
        setStep(i);
        setError(problem);
        return;
      }
    }
    save.mutate({
      name: draft.name.trim(),
      source: trimSlash(draft.source),
      destination: trimSlash(draft.destination),
      schedule: draft.schedule,
      retention_days: draft.retention_days,
      exclude_presets: draft.exclude_presets,
      exclude_patterns: parsePatterns(draft.patterns),
      notify: draft.notify,
      ping_url: draft.ping_url.trim() || null,
    });
  };

  const subtitles: Record<StepKey, string> = {
    what: draft.name.trim() || "Name and source",
    where: trimSlash(draft.destination),
    when: draft.schedule ? describeCron(draft.schedule, clock) : "Pick a schedule",
    options: `${retentionSummary(draft.retention_days)} · ${notifySummary(draft.notify)}`,
  };

  const current = STEPS[step].key;
  const canSubmit = step >= LAST_WORKING_STEP;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <nav aria-label="Steps" className="flex w-full flex-col gap-1 md:w-60">
        <ol className="flex flex-col gap-1">
          {STEPS.map((s, i) => {
            const active = i === step;
            const done = i < step || (isEdit && !active);
            const locked = i > reached;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  disabled={locked}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-h-13 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                    active && "bg-raised text-foreground",
                    !active && !locked && "hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-[26px] shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : done
                          ? "border-primary text-link"
                          : "border-muted-foreground/40"
                    )}
                  >
                    {done && !active ? (
                      <CheckIcon className="size-3.5" aria-hidden />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>{s.label}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {subtitles[s.key]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) submit();
          else next();
        }}
        className="flex min-w-0 flex-[999_1_480px] flex-col gap-6 rounded-[14px] border bg-card p-5 sm:p-7"
      >
        <p className="text-[13px] text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>

        {current === "what" && (
          <div className="flex flex-col gap-5">
            <StepHeading
              title="What do you want to back up?"
              hint="Name the backup and pick a folder from your server."
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-name`} className="text-[13px] text-foreground/80">
                Name
              </Label>
              <Input
                id={`${ids}-name`}
                value={draft.name}
                onChange={(e) => changeName(e.target.value)}
                placeholder="Photos"
                autoComplete="off"
                autoFocus={!isEdit}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-foreground/80">
                Source folder
              </span>
              <FolderBrowser
                label="Source folders"
                path={draft.source}
                root={SOURCE_ROOT}
                onNavigate={(source) => patch({ source })}
              />
              <span className="font-mono text-xs break-all text-muted-foreground">
                Selected: {trimSlash(draft.source)}
              </span>
            </div>
          </div>
        )}

        {current === "where" && (
          <div className="flex flex-col gap-5">
            <StepHeading
              title="Where should it go?"
              hint="Each backup gets its own folder, so jobs never overwrite each other."
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-dest`} className="text-[13px] text-foreground/80">
                Destination folder
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`${ids}-dest`}
                  value={draft.destination}
                  onChange={(e) => changeDestination(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono"
                  aria-describedby={`${ids}-dest-hint`}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setBrowsingDestination((b) => !b)}
                  aria-expanded={browsingDestination}
                >
                  <FolderSearchIcon />
                  {browsingDestination ? "Hide" : "Browse"}
                </Button>
              </div>
              <p id={`${ids}-dest-hint`} className="text-[13px] text-muted-foreground">
                {destinationTouched
                  ? "The folder is created on the first run if it doesn't exist."
                  : "Follows the job name. Edit it only if you need a specific folder."}
              </p>
            </div>
            {browsingDestination && (
              <FolderBrowser
                label="Destination folders"
                path={draft.destination}
                root={DESTINATION_ROOT}
                onNavigate={changeDestination}
              />
            )}
            <DiskSpace destination={draft.destination} />
          </div>
        )}

        {current === "when" && (
          <div className="flex flex-col gap-5">
            <StepHeading
              title="When should it run?"
              hint={`Pick how often. Times use the server time zone${timeZone ? ` (${timeZone})` : ""}.`}
            />
            <ScheduleField
              initialCron={draft.schedule}
              onChange={(schedule) => patch({ schedule })}
              timeZone={timeZone}
            />
          </div>
        )}

        {current === "options" && (
          <div className="flex flex-col gap-5">
            <StepHeading
              title="Options"
              hint={
                isEdit
                  ? "How long snapshots are kept, what to skip, and who hears about it."
                  : "Prefilled from your job defaults in Settings. Change them for this job only."
              }
            />
            <RetentionSelect
              value={draft.retention_days}
              onChange={(retention_days) => patch({ retention_days })}
            />
            <ExclusionFields
              presets={draft.exclude_presets}
              onPresetsChange={(exclude_presets) => patch({ exclude_presets })}
              patternsText={draft.patterns}
              onPatternsTextChange={(patterns) => patch({ patterns })}
            />
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-[13px] font-medium text-foreground/80">
                Notifications
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {NOTIFY_MODES.map((mode) => {
                  const on = draft.notify === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => patch({ notify: mode.value })}
                      className={cn(
                        "flex min-h-11 flex-col gap-1 rounded-lg border p-3.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        on
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-muted-foreground/50"
                      )}
                    >
                      <span className={cn("text-sm font-semibold", on && "text-link")}>
                        {mode.label}
                      </span>
                      <span className="text-[13px] leading-snug text-muted-foreground">
                        {mode.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-ping`} className="text-[13px] text-foreground/80">
                Ping URL <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`${ids}-ping`}
                type="url"
                inputMode="url"
                value={draft.ping_url}
                onChange={(e) => patch({ ping_url: e.target.value })}
                placeholder="https://hc-ping.com/your-check-uuid"
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
                aria-describedby={`${ids}-ping-hint`}
              />
              <p id={`${ids}-ping-hint`} className="text-[13px] text-muted-foreground">
                For healthchecks.io or an Uptime Kuma push monitor. Called after
                each successful run, with <span className="font-mono">/fail</span>{" "}
                appended when a run fails.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-failed/40 bg-failed/8 px-3.5 py-3 text-sm text-failed"
          >
            {error}
          </div>
        )}

        <footer className="flex flex-wrap justify-between gap-3 border-t pt-5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => goTo(step - 1)}
            disabled={step === 0}
          >
            Back
          </Button>
          <div className="flex flex-wrap gap-2">
            {canSubmit && step < STEPS.length - 1 && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => goTo(step + 1)}
              >
                Options
              </Button>
            )}
            {!canSubmit && isEdit && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={submit}
                disabled={save.isPending}
              >
                Save changes
              </Button>
            )}
            <Button type="submit" size="lg" disabled={save.isPending}>
              {save.isPending && <LoaderCircleIcon className="animate-spin" />}
              {canSubmit
                ? isEdit
                  ? "Save changes"
                  : "Create backup"
                : "Continue"}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}
