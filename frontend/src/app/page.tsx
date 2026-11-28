"use client";

import Link from "next/link";
import { DatabaseIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  PageHeader,
} from "@/components/PageStates";
import RelativeTime from "@/components/RelativeTime";
import { StatusDot } from "@/components/Status";
import type { Dashboard, Job, Run } from "@/lib/api";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatPercent,
  formatRelative,
  formatShortDate,
  formatSizeChange,
} from "@/lib/format";
import { useDashboard, useJobs, useRuns } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import { DESTINATION_ROOT, isInside } from "@/utils/paths";
import { describeCron } from "@/utils/schedule";

function headline(d: Dashboard, now: Date): string {
  const { jobs } = d;
  const next = d.upcoming[0];
  const nextText = next
    ? ` Next run ${formatRelative(new Date(next.at), now)}.`
    : "";
  if (jobs.total === 0) return "No backups yet. Create one to get started.";
  const attention = jobs.failing + jobs.stale;
  if (jobs.running > 0) {
    return `${jobs.running} ${jobs.running === 1 ? "backup" : "backups"} running now.${nextText}`;
  }
  if (attention > 0) {
    return `${attention} ${attention === 1 ? "job needs" : "jobs need"} attention.${nextText}`;
  }
  return `All backups healthy.${nextText}`;
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-[2px]", className)} aria-hidden />
      {label}
    </span>
  );
}

/** The disk holding the destinations; other entries (like the app data) come after. */
function backupDisk(disks: Dashboard["disks"]) {
  return disks.find((x) => isInside(DESTINATION_ROOT, x.path.replace(/\/+$/, "") || "/")) ?? disks[0];
}

function SummaryCards({ d }: { d: Dashboard }) {
  const { jobs, runs_30d: runs } = d;
  const next = d.upcoming[0];
  const disk = backupDisk(d.disks);
  const used = disk && disk.total_bytes > 0 ? disk.used_bytes / disk.total_bytes : 0;

  return (
    <section
      aria-label="Summary"
      className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4"
    >
      <Card className="flex flex-col gap-2.5">
        <Eyebrow>Jobs</Eyebrow>
        <div className="flex items-baseline gap-2">
          <span className="text-[32px] leading-none font-bold tabular-nums">
            {jobs.healthy}
          </span>
          <span className="text-sm text-muted-foreground">
            of {jobs.total} healthy
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <StatusDot tone="failed" />
            {jobs.failing} failing
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot tone="stale" />
            {jobs.stale} stale
          </span>
          {jobs.running > 0 && (
            <span className="flex items-center gap-1.5">
              <StatusDot tone="running" />
              {jobs.running} running
            </span>
          )}
          {jobs.paused > 0 && (
            <span className="flex items-center gap-1.5">
              <StatusDot tone="paused" />
              {jobs.paused} paused
            </span>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-2.5">
        <Eyebrow>Last 30 days</Eyebrow>
        <div className="flex items-baseline gap-2">
          <span className="text-[32px] leading-none font-bold tabular-nums">
            {runs.total > 0 ? formatPercent(runs.success / runs.total) : "—"}
          </span>
          <span className="text-sm text-muted-foreground">
            success · {formatCount(runs.total)} {runs.total === 1 ? "run" : "runs"}
          </span>
        </div>
        <span
          className={cn(
            "text-[13px]",
            runs.failed > 0 ? "text-failed" : "text-muted-foreground"
          )}
        >
          {runs.failed === 0
            ? "No failed runs"
            : `${runs.failed} failed ${runs.failed === 1 ? "run" : "runs"}`}
        </span>
      </Card>

      <Card className="flex flex-col gap-2.5">
        <Eyebrow>Next run</Eyebrow>
        {next ? (
          <>
            <Link
              href={`/jobs/view?id=${next.job_id}`}
              className="truncate text-xl font-semibold hover:text-link"
            >
              {next.job_name}
            </Link>
            <RelativeTime
              value={next.at}
              format="both"
              className="w-fit text-[13px] text-muted-foreground"
            />
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Nothing scheduled
          </span>
        )}
      </Card>

      <Card className="flex flex-col gap-2.5">
        <Eyebrow>Backup disk</Eyebrow>
        {disk ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] leading-none font-bold tabular-nums">
                {formatBytes(disk.used_bytes)}
              </span>
              <span className="text-sm text-muted-foreground">
                of {formatBytes(disk.total_bytes)}
              </span>
            </div>
            <div
              role="img"
              aria-label={`${Math.round(used * 100)}% used`}
              className="h-2 overflow-hidden rounded bg-border"
            >
              <div
                className={cn("h-full", used > 0.9 ? "bg-stale" : "bg-primary")}
                style={{ width: `${Math.min(100, used * 100)}%` }}
              />
            </div>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {disk.path} · {formatBytes(disk.free_bytes)} free
            </span>
            {d.disks.length > 1 && (
              <span className="text-xs text-muted-foreground">
                +{d.disks.length - 1} more{" "}
                {d.disks.length === 2 ? "disk" : "disks"}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">No disk info</span>
        )}
      </Card>
    </section>
  );
}

const DAY_CLASS = {
  success: "bg-success",
  failed: "bg-failed",
  none: "bg-border",
} as const;

function Calendar({ d }: { d: Dashboard }) {
  const rows = d.calendar;
  const days = rows[0]?.days ?? [];
  const firstDay = days[0]?.date;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="calendar-heading" className="font-semibold">
          Last 30 days
        </h2>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <Legend className="bg-success" label="Success" />
          <Legend className="bg-failed" label="Failed" />
          <Legend className="bg-border" label="No run" />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs to show yet.</p>
      ) : (
        <>
          <ul aria-labelledby="calendar-heading" className="flex flex-col gap-3">
            {rows.map((row) => {
              const failed = row.days.filter((x) => x.status === "failed").length;
              const ok = row.days.filter((x) => x.status === "success").length;
              return (
                <li
                  key={row.job_id}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                >
                  <Link
                    href={`/jobs/view?id=${row.job_id}`}
                    className="w-36 shrink-0 truncate text-sm font-medium hover:text-link"
                  >
                    {row.job_name}
                  </Link>
                  <div
                    role="img"
                    aria-label={`${row.job_name}: ${ok} days with a successful run, ${failed} with a failure`}
                    className="grid min-w-0 flex-1 gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${row.days.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {row.days.map((day) => (
                      <Tooltip key={day.date}>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "block h-[22px] rounded-[3px] transition-opacity hover:opacity-80",
                              DAY_CLASS[day.status] ?? DAY_CLASS.none
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatShortDate(new Date(`${day.date}T12:00:00`))} ·{" "}
                          {day.status === "none"
                            ? "No run"
                            : day.status === "success"
                              ? "Success"
                              : "Failed"}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between text-xs text-muted-foreground sm:pl-40">
            <span>
              {firstDay ? formatShortDate(new Date(`${firstDay}T12:00:00`)) : ""}
            </span>
            <span>Today</span>
          </div>
        </>
      )}
    </Card>
  );
}

function Upcoming({ d, jobs }: { d: Dashboard; jobs: Job[] | undefined }) {
  const schedules = new Map(jobs?.map((j) => [j.id, j.schedule]));
  return (
    <Card className="flex-[1_1_360px]">
      <h2 className="mb-1 flex min-h-11 items-center font-semibold">Upcoming</h2>
      {d.upcoming.length === 0 ? (
        <p className="border-t border-divider pt-3 text-sm text-muted-foreground">
          No runs scheduled. Paused jobs don&apos;t run on their own.
        </p>
      ) : (
        <ul>
          {d.upcoming.slice(0, 5).map((u) => (
            <li
              key={`${u.job_id}-${u.at}`}
              className="flex items-center justify-between gap-3 border-t border-divider py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/jobs/view?id=${u.job_id}`}
                  className="truncate font-medium hover:text-link"
                >
                  {u.job_name}
                </Link>
                {schedules.has(u.job_id) && (
                  <span className="text-[13px] text-muted-foreground">
                    {describeCron(schedules.get(u.job_id)!)}
                  </span>
                )}
              </div>
              <RelativeTime value={u.at} format="when" className="shrink-0 text-sm" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function runSummary(run: Run): string {
  if (run.status === "running") return "Backing up…";
  if (run.status === "failed") {
    return run.duration_seconds !== null
      ? `Failed after ${formatDuration(run.duration_seconds)}`
      : "Failed";
  }
  const parts = [formatDuration(run.duration_seconds)];
  if (run.size_change_bytes !== null) parts.push(formatSizeChange(run.size_change_bytes));
  if (run.new_files !== null) parts.push(`${formatCount(run.new_files)} new files`);
  return parts.join(" · ");
}

function RecentActivity() {
  const { data, error, isPending } = useRuns({ limit: 5 });
  return (
    <Card className="flex-[1_1_360px]">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">Recent activity</h2>
        <Link
          href="/activity"
          className="flex min-h-11 items-center px-1 text-[13px] font-medium text-link hover:underline"
        >
          View all
        </Link>
      </div>
      {isPending ? (
        <div className="flex flex-col gap-3 border-t border-divider pt-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="border-t border-divider pt-3 text-sm text-failed">
          Couldn&apos;t load recent runs.
        </p>
      ) : data.items.length === 0 ? (
        <p className="border-t border-divider pt-3 text-sm text-muted-foreground">
          No runs yet.
        </p>
      ) : (
        <ul>
          {data.items.map((run) => (
            <li key={run.id} className="border-t border-divider">
              <Link
                href={`/activity?run=${run.id}`}
                className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 outline-none hover:bg-hover-row focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusDot
                    tone={
                      run.status === "success"
                        ? "success"
                        : run.status === "failed"
                          ? "failed"
                          : "running"
                    }
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{run.job_name ?? `Job #${run.job_id}`}</span>
                    <span
                      className={cn(
                        "truncate text-[13px]",
                        run.status === "failed" ? "text-failed" : "text-muted-foreground"
                      )}
                    >
                      {runSummary(run)}
                    </span>
                  </div>
                </div>
                <RelativeTime
                  value={run.started_at}
                  format="when"
                  focusable={false}
                  className="shrink-0 text-[13px] text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-56 flex-[1_1_360px] rounded-xl" />
        <Skeleton className="h-56 flex-[1_1_360px] rounded-xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, error, refetch } = useDashboard();
  const { data: jobs } = useJobs();
  const now = useNow();

  const newBackup = (
    <Button asChild>
      <Link href="/jobs/new">
        <PlusIcon />
        New backup
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={data ? headline(data, now) : " "}
        actions={newBackup}
      />
      {error && !data ? (
        <ErrorState
          error={error}
          onRetry={() => refetch()}
          title="Couldn't load the dashboard"
        />
      ) : !data ? (
        <DashboardSkeleton />
      ) : data.jobs.total === 0 ? (
        <EmptyState
          icon={DatabaseIcon}
          title="No backups yet"
          description="Create a backup job to copy a folder on a schedule. Each run keeps a snapshot you can go back to."
          action={newBackup}
        />
      ) : (
        <>
          <SummaryCards d={data} />
          <Calendar d={data} />
          <div className="flex flex-wrap gap-4">
            <Upcoming d={data} jobs={jobs} />
            <RecentActivity />
          </div>
        </>
      )}
    </div>
  );
}
