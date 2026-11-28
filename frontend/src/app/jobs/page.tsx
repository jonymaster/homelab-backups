"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, DatabaseIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobRowActions, isJobRunning } from "@/components/JobActions";
import { EmptyState, ErrorState, PageHeader } from "@/components/PageStates";
import RelativeTime from "@/components/RelativeTime";
import { HEALTH, HealthBadge, HistoryBars } from "@/components/Status";
import type { Job, JobHealth } from "@/lib/api";
import { formatDuration, formatSizeChange } from "@/lib/format";
import { useClock, useJobs } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { describeCron } from "@/utils/schedule";

type Filter = "all" | JobHealth;
const FILTERS: Filter[] = ["all", "healthy", "running", "failing", "stale", "paused", "new"];

/** Paths are long; the interesting part is below the mount roots. */
const shortPath = (path: string) =>
  path.replace(/^\/app\/(source|destination)\/?/, "") || "/";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function JobNote({ job }: { job: Job }) {
  if (isJobRunning(job)) {
    return (
      <span className="text-[13px] text-running">
        Backing up… started{" "}
        <RelativeTime value={job.last_run?.started_at} />
      </span>
    );
  }
  if (job.health === "failing") {
    return (
      <span className="text-[13px] text-failed">
        Last run failed
        {job.last_success_at ? (
          <>
            . Last success <RelativeTime value={job.last_success_at} />
          </>
        ) : (
          " and it has never succeeded"
        )}
      </span>
    );
  }
  if (job.health === "stale") {
    return (
      <span className="text-[13px] text-stale">
        No successful run{" "}
        {job.last_success_at ? (
          <>
            since <RelativeTime value={job.last_success_at} />
          </>
        ) : (
          "yet"
        )}
      </span>
    );
  }
  return null;
}

function LastRun({ job }: { job: Job }) {
  const run = job.last_run;
  if (!run) return <span className="text-sm text-muted-foreground">Never</span>;
  const meta =
    run.status === "running"
      ? "In progress"
      : run.status === "failed"
        ? `Failed after ${formatDuration(run.duration_seconds)}`
        : `${formatDuration(run.duration_seconds)} · ${formatSizeChange(run.size_change_bytes)}`;
  return (
    <>
      <RelativeTime value={run.started_at} format="when" className="w-fit text-sm" />
      <span
        className={cn(
          "text-xs",
          run.status === "failed" ? "text-failed" : "text-muted-foreground"
        )}
      >
        {meta}
      </span>
    </>
  );
}

function JobRow({ job }: { job: Job }) {
  const clock = useClock();
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-xl border bg-card px-5 py-4.5 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto_auto]">
      <div className="flex min-w-0 flex-[2_1_240px] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/jobs/view?id=${job.id}`}
            className="text-base font-semibold hover:text-link"
          >
            {job.name}
          </Link>
          <HealthBadge health={job.health} />
        </div>
        <span
          className="truncate font-mono text-xs text-muted-foreground"
          title={`${job.source} → ${job.destination}`}
        >
          {shortPath(job.source)} → {shortPath(job.destination)}
        </span>
        <JobNote job={job} />
      </div>
      <div className="min-w-0 flex-[1_1_140px]">
        <Field label="Schedule">
          <span className="text-sm">{describeCron(job.schedule, clock)}</span>
        </Field>
      </div>
      <div className="min-w-0 flex-[1_1_140px]">
        <Field label="Last run">
          <LastRun job={job} />
        </Field>
      </div>
      <div className="min-w-0 flex-[1_1_110px]">
        <Field label="Next run">
          {job.paused ? (
            <span className="text-sm text-paused">Paused</span>
          ) : (
            <RelativeTime value={job.next_run} format="when" className="w-fit text-sm" />
          )}
        </Field>
      </div>
      <div className="flex flex-none flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Last 14 runs</span>
        <HistoryBars history={job.history} running={isJobRunning(job)} />
      </div>
      <div className="flex-none">
        <JobRowActions job={job} />
      </div>
    </li>
  );
}

function JobsList() {
  const { data: jobs, error, refetch } = useJobs();
  const [params, update] = useSearchParamState();
  const [query, setQuery] = useState("");
  const filter: Filter = FILTERS.find((f) => f === params.get("status")) ?? "all";

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: 0, healthy: 0, running: 0, failing: 0, stale: 0, paused: 0, new: 0,
    };
    for (const job of jobs ?? []) {
      c.all++;
      c[job.health] = (c[job.health] ?? 0) + 1;
    }
    return c;
  }, [jobs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs ?? []).filter(
      (j) =>
        (filter === "all" || j.health === filter) &&
        (!q || `${j.name} ${j.source} ${j.destination}`.toLowerCase().includes(q))
    );
  }, [jobs, filter, query]);

  const attention = counts.failing + counts.stale;
  const summary = jobs
    ? [
        `${counts.all} backup ${counts.all === 1 ? "job" : "jobs"}`,
        counts.running > 0 && `${counts.running} running`,
        attention > 0 && `${attention} ${attention === 1 ? "needs" : "need"} attention`,
      ]
        .filter(Boolean)
        .join(" · ")
    : " ";

  const newBackup = (
    <Button asChild>
      <Link href="/jobs/new">
        <PlusIcon />
        New backup
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Jobs" description={summary} actions={newBackup} />

      {jobs && jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-10 flex-[1_1_260px] items-center gap-2 rounded-lg border bg-card px-3 focus-within:ring-3 focus-within:ring-ring/50">
            <SearchIcon className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Search jobs</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or path"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
            {FILTERS.filter((f) => f === "all" || f === filter || counts[f] > 0).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => update({ status: f === "all" ? null : f })}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11",
                  filter === f
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f === "all" ? "All" : HEALTH[f].label}{" "}
                <span className="tabular-nums opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && !jobs ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load jobs" />
      ) : !jobs ? (
        <div className="flex flex-col gap-3" aria-busy>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={DatabaseIcon}
          title="No backup jobs yet"
          description="A job copies a folder from your server to the backup disk on a schedule."
          action={newBackup}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No jobs match this filter"
          action={
            <Button variant="outline" onClick={() => {
                setQuery("");
                update({ status: null });
              }}>
              Clear filters
              <ArrowRightIcon />
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense>
      <JobsList />
    </Suspense>
  );
}
