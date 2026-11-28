"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, SearchXIcon } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { JobHeaderActions, isJobRunning } from "@/components/JobActions";
import JobWizard from "@/components/JobWizard";
import {
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
} from "@/components/PageStates";
import RelativeTime from "@/components/RelativeTime";
import RunsTable from "@/components/RunsTable";
import { HealthBadge } from "@/components/Status";
import { ApiError, type Job } from "@/lib/api";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatPercent,
  formatShortDate,
  formatSizeChange,
  formatWhen,
} from "@/lib/format";
import {
  useJob,
  useJobStats,
  useServerTimeZone,
  useSnapshots,
} from "@/lib/queries";
import { idParam, useSearchParamState } from "@/hooks/use-search-param-state";
import { describeCron } from "@/utils/schedule";

const TABS = ["overview", "runs", "snapshots", "settings"] as const;
type Tab = (typeof TABS)[number];

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
}) {
  return (
    <Card>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2 text-[28px] leading-tight font-bold tabular-nums">
        {value}
      </div>
      <span className="text-[13px] text-muted-foreground">{sub}</span>
    </Card>
  );
}

const chartConfig = {
  size: { label: "Data added", color: "var(--chart-1)" },
} satisfies ChartConfig;

function Overview({ job }: { job: Job }) {
  const { data: stats, error, refetch } = useJobStats(job.id);
  const timeZone = useServerTimeZone();

  if (error && !stats) {
    return <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load stats" />;
  }
  if (!stats) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  const finished = stats.success_runs + stats.failed_runs;
  const points = stats.chart.flatMap((p) =>
    p.started_at
      ? [{ at: p.started_at, size: p.size_change_bytes ?? 0, duration: p.duration_seconds }]
      : []
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <StatCard
          label="Success rate"
          value={finished > 0 ? formatPercent(stats.success_runs / finished) : "—"}
          sub={`${formatCount(stats.success_runs)} of ${formatCount(finished)} runs`}
        />
        <StatCard
          label="Avg duration"
          value={formatDuration(job.avg_duration_30d)}
          sub="last 30 days"
        />
        <StatCard
          label="Backup size"
          value={formatBytes(stats.backup_size_bytes)}
          sub="mirror + increments"
        />
        <StatCard
          label="Snapshots"
          value={formatCount(stats.snapshot_count)}
          sub={
            stats.oldest_snapshot
              ? `oldest ${formatShortDate(new Date(stats.oldest_snapshot), timeZone)}`
              : "none yet"
          }
        />
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Data added per run · last {points.length === 1 ? "run" : `${points.length} runs`}
        </h2>
        {points.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            The chart fills in after the first successful run.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-44 w-full"
              aria-label={`Bar chart of data added per run, from ${formatSizeChange(Math.min(...points.map((p) => p.size)))} to ${formatSizeChange(Math.max(...points.map((p) => p.size)))}`}
              role="img"
            >
              <BarChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="at" hide />
                <YAxis hide domain={[(min: number) => Math.min(0, min), "auto"]} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <ChartTooltip
                  cursor={{ fill: "var(--raised)" }}
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      labelFormatter={(_, payload) => {
                        const at = payload?.[0]?.payload?.at as string | undefined;
                        return at ? formatWhen(new Date(at), timeZone) : "";
                      }}
                      formatter={(value, _name, item) => (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono font-medium tabular-nums">
                            {formatSizeChange(Number(value))}
                          </span>
                          <span className="text-muted-foreground">
                            {formatDuration(item.payload.duration)}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="size" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                  {points.map((p) => (
                    <Cell
                      key={p.at}
                      fill={p.size < 0 ? "var(--stale)" : "var(--color-size)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatShortDate(new Date(points[0].at), timeZone)}</span>
              <span>
                {formatShortDate(new Date(points[points.length - 1].at), timeZone)}
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Snapshots({ job }: { job: Job }) {
  const { data, error, refetch } = useSnapshots(job.id);

  if (error && !data) {
    return (
      <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load snapshots" />
    );
  }
  return (
    <Card className="flex flex-col gap-1">
      <p className="mb-2 text-sm text-muted-foreground">
        Each successful run keeps a snapshot. Restoring a file or folder as it
        was on a given date is coming soon.
      </p>
      {!data ? (
        Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="my-1.5 h-11" />
        ))
      ) : data.length === 0 ? (
        <EmptyState
          icon={ArchiveIcon}
          title="No snapshots yet"
          description="A snapshot appears after the first successful run."
          className="mt-2"
        />
      ) : (
        <ul>
          {data.map((snapshot, i) => (
            <li
              key={snapshot.at}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-divider py-2.5"
            >
              <div className="flex flex-col gap-0.5">
                <RelativeTime value={snapshot.at} format="when" className="w-fit font-medium" />
                <span className="text-[13px] text-muted-foreground">
                  {i === 0 ? "Latest · current mirror" : "Increment"}
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* A disabled button gets no pointer events, so the wrapper carries the tooltip. */}
                  <span tabIndex={0} className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Button variant="outline" disabled aria-describedby="restore-soon">
                      Browse &amp; restore
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent id="restore-soon">Coming soon</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function JobDetail({ id }: { id: number }) {
  const router = useRouter();
  const [params, update] = useSearchParamState();
  const { data: job, error, refetch } = useJob(id);
  const tab: Tab = TABS.find((t) => t === params.get("tab")) ?? "overview";

  if (error && !job) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <EmptyState
          icon={SearchXIcon}
          title="Job not found"
          description="It may have been deleted."
          action={
            <Button asChild variant="outline">
              <Link href="/jobs">Back to jobs</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this job" />;
  }

  if (!job) {
    return (
      <div className="flex flex-col gap-5" aria-busy>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const running = isJobRunning(job);

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="flex gap-2 text-[13px] text-muted-foreground">
        <Link href="/jobs" className="text-link hover:underline">
          Jobs
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="truncate">
          {job.name}
        </span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em]">
              {job.name}
            </h1>
            <HealthBadge health={job.health} />
          </div>
          <p className="text-sm text-muted-foreground">
            {describeCron(job.schedule)}
            {" · "}
            {job.paused ? (
              <span className="text-paused">paused, no scheduled runs</span>
            ) : running ? (
              <span className="text-running">running now</span>
            ) : job.next_run ? (
              <>
                next run <RelativeTime value={job.next_run} format="both" />
              </>
            ) : (
              "no upcoming run"
            )}
          </p>
          <p className="font-mono text-xs [overflow-wrap:anywhere] text-muted-foreground">
            {job.source} → {job.destination}
          </p>
        </div>
        <JobHeaderActions job={job} />
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          update({ tab: value === "overview" ? null : value, page: null, status: null, run: null })
        }
        className="gap-5"
      >
        <TabsList
          variant="line"
          aria-label="Job sections"
          className="!h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b p-0"
        >
          {TABS.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="h-11 flex-none px-1 font-semibold capitalize after:absolute after:inset-x-0 after:!bottom-0 after:h-0.5 after:!bg-primary after:opacity-0 data-[state=active]:after:opacity-100"
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <Overview job={job} />
        </TabsContent>
        <TabsContent value="runs">
          <RunsTable jobId={job.id} />
        </TabsContent>
        <TabsContent value="snapshots">
          <Snapshots job={job} />
        </TabsContent>
        <TabsContent value="settings">
          <JobWizard
            key={job.id}
            job={job}
            onSaved={() => router.replace(`/jobs/view?id=${job.id}`, { scroll: false })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JobDetailPage() {
  const [params] = useSearchParamState();
  const id = idParam(params.get("id"));
  if (id === null) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="No job selected"
        action={
          <Button asChild variant="outline">
            <Link href="/jobs">Back to jobs</Link>
          </Button>
        }
      />
    );
  }
  return <JobDetail id={id} />;
}

export default function Page() {
  return (
    <Suspense>
      <JobDetailPage />
    </Suspense>
  );
}
