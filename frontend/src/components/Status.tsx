import { cn } from "@/lib/utils";
import type { JobHealth, RunStatus } from "@/lib/api";

type Tone = "success" | "failed" | "running" | "stale" | "paused" | "muted";

const TONE: Record<Tone, { text: string; bg: string; dot: string }> = {
  success: { text: "text-success", bg: "bg-success/12", dot: "bg-success" },
  failed: { text: "text-failed", bg: "bg-failed/12", dot: "bg-failed" },
  running: { text: "text-running", bg: "bg-running/14", dot: "bg-running" },
  stale: { text: "text-stale", bg: "bg-stale/14", dot: "bg-stale" },
  paused: { text: "text-paused", bg: "bg-paused/12", dot: "bg-paused" },
  muted: { text: "text-muted-foreground", bg: "bg-muted", dot: "bg-border" },
};

export const HEALTH: Record<JobHealth, { label: string; tone: Tone }> = {
  healthy: { label: "Healthy", tone: "success" },
  failing: { label: "Failing", tone: "failed" },
  stale: { label: "Stale", tone: "stale" },
  running: { label: "Running", tone: "running" },
  paused: { label: "Paused", tone: "paused" },
  new: { label: "New", tone: "muted" },
};

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone }> = {
  success: { label: "Success", tone: "success" },
  failed: { label: "Failed", tone: "failed" },
  running: { label: "Running", tone: "running" },
};

function Pill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        t.text,
        t.bg,
        className
      )}
    >
      {tone === "running" && (
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-running opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-running" />
        </span>
      )}
      {children}
    </span>
  );
}

export function HealthBadge({
  health,
  className,
}: {
  health: JobHealth;
  className?: string;
}) {
  const h = HEALTH[health] ?? HEALTH.new;
  return (
    <Pill tone={h.tone} className={className}>
      {h.label}
    </Pill>
  );
}

export function RunStatusBadge({
  status,
  className,
}: {
  status: RunStatus;
  className?: string;
}) {
  const s = RUN_STATUS[status] ?? RUN_STATUS.failed;
  return (
    <Pill tone={s.tone} className={className}>
      {s.label}
    </Pill>
  );
}

export function StatusDot({
  tone,
  className,
}: {
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", TONE[tone].dot, className)}
    />
  );
}

const HISTORY_SLOTS = 14;

/** Last runs as bars: failures stand taller so they catch the eye. */
export function HistoryBars({
  history,
  running = false,
}: {
  history: ("success" | "failed")[];
  running?: boolean;
}) {
  const recent: ("success" | "failed" | "running")[] = [...history];
  if (running) recent.push("running");
  const shown = recent.slice(-HISTORY_SLOTS);
  const slots = [
    ...Array<"none">(HISTORY_SLOTS - shown.length).fill("none"),
    ...shown,
  ];
  const failed = history.filter((h) => h === "failed").length;
  const label =
    history.length === 0
      ? "No runs yet"
      : `Last ${history.length} runs: ${failed} failed`;

  return (
    <div role="img" aria-label={label} className="flex h-6 items-end gap-[3px]">
      {slots.map((s, i) => (
        <span
          key={i}
          className={cn(
            "block w-1.5 rounded-[2px]",
            s === "success" && "h-4 bg-success",
            s === "failed" && "h-6 bg-failed",
            s === "running" && "h-4 animate-pulse bg-running",
            s === "none" && "h-1.5 bg-border"
          )}
        />
      ))}
    </div>
  );
}
