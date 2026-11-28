"use client";

import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Run, RunStatus } from "@/lib/api";
import {
  EMPTY,
  formatCount,
  formatDuration,
  formatSizeChange,
} from "@/lib/format";
import { useJobs, useRuns } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { idParam, useSearchParamState } from "@/hooks/use-search-param-state";
import { EmptyState, ErrorState } from "./PageStates";
import RelativeTime from "./RelativeTime";
import RunSheet from "./RunSheet";
import { RunStatusBadge } from "./Status";

const PAGE_SIZE = 15;
const STATUSES: RunStatus[] = ["success", "failed", "running"];
const ALL = "all";

/** Page numbers with gaps: 1 … 4 5 6 … 10 */
function pageList(page: number, total: number): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

const filesChanged = (run: Run) => {
  const parts = [run.new_files, run.changed_files, run.deleted_files];
  if (parts.every((p) => p === null)) return EMPTY;
  return formatCount(parts.reduce<number>((sum, p) => sum + (p ?? 0), 0));
};

function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeftIcon />
      </Button>
      {pageList(page, pages).map((p, i) =>
        p === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="flex size-9 items-center justify-center text-muted-foreground"
          >
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            aria-label={`Page ${p}`}
            className={cn(
              "tabular-nums",
              p === page && "bg-foreground text-background hover:bg-foreground"
            )}
          >
            {p}
          </Button>
        )
      )}
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

function JobFilter({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { data: jobs } = useJobs();
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span id="runs-job-filter">Job</span>
      <Select
        value={value === null ? ALL : String(value)}
        onValueChange={(v) => onChange(v === ALL ? null : Number(v))}
      >
        <SelectTrigger aria-labelledby="runs-job-filter" className="min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All jobs</SelectItem>
          {jobs?.map((job) => (
            <SelectItem key={job.id} value={String(job.id)}>
              {job.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Paginated runs with filters kept in the URL, so a run or a filtered view
 * can be linked to. Pass `jobId` to scope it to one job.
 */
export default function RunsTable({ jobId }: { jobId?: number }) {
  const [params, update] = useSearchParamState();
  const scopedJob = jobId ?? idParam(params.get("job"));
  const status = STATUSES.find((s) => s === params.get("status"));
  const page = idParam(params.get("page")) ?? 1;
  const selected = idParam(params.get("run"));
  const showJob = jobId === undefined;

  const { data, error, isPending, isPlaceholderData, refetch } = useRuns({
    job_id: scopedJob ?? undefined,
    status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(status) || (showJob && scopedJob !== null);
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <section aria-label="Runs" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {data
            ? `${formatCount(total)} ${total === 1 ? "run" : "runs"}${filtered ? " · filtered" : ""}`
            : " "}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {showJob && (
            <JobFilter
              value={scopedJob}
              onChange={(id) => update({ job: id, page: null, run: null })}
            />
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span id="runs-status-filter">Status</span>
            <Select
              value={status ?? ALL}
              onValueChange={(v) =>
                update({ status: v === ALL ? null : v, page: null })
              }
            >
              <SelectTrigger aria-labelledby="runs-status-filter" className="min-w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All runs</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && !data ? (
        <ErrorState
          error={error}
          onRetry={() => refetch()}
          title="Couldn't load runs"
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title={filtered ? "No runs match this filter" : "No runs yet"}
          description={
            filtered
              ? "Try another status or job."
              : "Runs appear here once a backup starts, on schedule or with Run now."
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                onClick={() => update({ status: null, job: null, page: null })}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-xl border bg-card transition-opacity",
            isPlaceholderData && "opacity-60"
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Started</TableHead>
                {showJob && <TableHead scope="col">Job</TableHead>}
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Duration</TableHead>
                <TableHead scope="col" className="text-right">
                  Files changed
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Data added
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Errors
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody aria-busy={isPending}>
              {isPending
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: showJob ? 7 : 6 }, (_, j) => (
                        <TableCell key={j} className="h-12">
                          <Skeleton className="h-4 w-full max-w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : data?.items.map((run) => (
                    <TableRow
                      key={run.id}
                      data-state={run.id === selected ? "selected" : undefined}
                      onClick={() => update({ run: run.id })}
                      className="cursor-pointer"
                    >
                      <TableCell className="p-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            update({ run: run.id });
                          }}
                          className="flex min-h-12 w-full items-center px-3 text-left font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                        >
                          <span className="sr-only">Open run from </span>
                          <RelativeTime
                            value={run.started_at}
                            format="when"
                            focusable={false}
                          />
                        </button>
                      </TableCell>
                      {showJob && (
                        <TableCell className="max-w-56 truncate">
                          {run.job_name ?? `Job #${run.job_id}`}
                        </TableCell>
                      )}
                      <TableCell>
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {run.status === "running"
                          ? "Running…"
                          : formatDuration(run.duration_seconds)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {filesChanged(run)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSizeChange(run.size_change_bytes)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          run.errors ? "font-semibold text-failed" : undefined
                        )}
                      >
                        {formatCount(run.errors)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && total > 0 && (
        <nav
          aria-label="Pagination"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span className="text-[13px] text-muted-foreground tabular-nums">
            Showing {formatCount(first)}–{formatCount(last)} of {formatCount(total)}
          </span>
          <Pagination
            page={page}
            pages={pages}
            onPage={(p) => update({ page: p === 1 ? null : p })}
          />
        </nav>
      )}

      <RunSheet runId={selected} onClose={() => update({ run: null })} />
    </section>
  );
}
