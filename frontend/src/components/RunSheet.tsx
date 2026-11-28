"use client";

import Link from "next/link";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunDetail } from "@/lib/api";
import {
  EMPTY,
  formatBytes,
  formatCount,
  formatDuration,
  formatSizeChange,
  formatWhen,
} from "@/lib/format";
import { useClock, useRun, useServerTimeZone } from "@/lib/queries";
import { useNow } from "@/hooks/use-now";
import { ErrorState } from "./PageStates";
import RelativeTime from "./RelativeTime";
import { RunStatusBadge } from "./Status";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-raised p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Elapsed({ since }: { since: string | null }) {
  const now = useNow();
  if (!since) return <>{EMPTY}</>;
  return <>{formatDuration((now.getTime() - Date.parse(since)) / 1000)}</>;
}

const fileCounts = (run: RunDetail) =>
  run.new_files === null &&
  run.changed_files === null &&
  run.deleted_files === null
    ? EMPTY
    : [run.new_files, run.changed_files, run.deleted_files]
        .map(formatCount)
        .join(" / ");

function LogViewer({ run }: { run: RunDetail }) {
  const log = run.log ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(log);
      toast.success("Log copied");
    } catch {
      toast.error("Couldn't copy: clipboard access was denied");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([log], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(run.job_name ?? "job").replace(/[^\w.-]+/g, "_")}-run-${run.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="run-log" className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="run-log" className="flex items-center gap-2 font-semibold">
          Log
          {run.status === "running" && (
            <span className="text-xs font-medium text-running">· live</span>
          )}
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copy} disabled={!log}>
            <CopyIcon />
            Copy
          </Button>
          <Button size="sm" variant="outline" onClick={download} disabled={!log}>
            <DownloadIcon />
            Download
          </Button>
        </div>
      </div>
      {log ? (
        <pre
          tabIndex={0}
          aria-label="Run log"
          className="max-h-[50vh] overflow-auto rounded-lg border bg-background p-3.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/85 outline-none [overflow-wrap:anywhere] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {log}
        </pre>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {run.status === "running"
            ? "Waiting for output…"
            : "This run has no log."}
        </p>
      )}
    </section>
  );
}

export default function RunSheet({
  runId,
  onClose,
}: {
  runId: number | null;
  onClose: () => void;
}) {
  const { data, error, refetch } = useRun(runId);
  // Previous data is kept only for the closing animation, not across runs.
  const run = data && (runId === null || data.id === runId) ? data : undefined;
  const timeZone = useServerTimeZone();
  const clock = useClock();

  return (
    <Sheet open={runId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-5 overflow-y-auto p-6 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="gap-1.5 p-0 pr-10">
          <span className="text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Run{run ? ` #${run.id}` : ""}
          </span>
          <SheetTitle className="text-xl font-bold">
            {run?.started_at
              ? formatWhen(new Date(run.started_at), timeZone, undefined, clock)
              : run
                ? `Run #${run.id}`
                : "Loading run"}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {run && (
                <>
                  <RunStatusBadge status={run.status} />
                  <Link
                    href={`/jobs/view?id=${run.job_id}`}
                    className="text-sm font-medium text-link hover:underline"
                  >
                    {run.job_name ?? `Job #${run.job_id}`}
                  </Link>
                </>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load this run"
          />
        ) : !run ? (
          <div className="flex flex-col gap-3" aria-busy>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Duration"
                value={
                  run.status === "running" ? (
                    <Elapsed since={run.started_at} />
                  ) : (
                    formatDuration(run.duration_seconds)
                  )
                }
              />
              <Stat label="Data added" value={formatSizeChange(run.size_change_bytes)} />
              <Stat label="New / changed / deleted" value={fileCounts(run)} />
              <Stat
                label="Errors"
                value={
                  <span className={run.errors ? "text-failed" : undefined}>
                    {formatCount(run.errors)}
                  </span>
                }
              />
              <Stat label="Source files" value={formatCount(run.source_files)} />
              <Stat label="Source size" value={formatBytes(run.source_size_bytes)} />
              <Stat label="Increment size" value={formatBytes(run.increment_size_bytes)} />
              <Stat
                label="Finished"
                value={
                  run.finished_at ? (
                    <RelativeTime value={run.finished_at} format="when" className="text-base" />
                  ) : (
                    EMPTY
                  )
                }
              />
            </div>
            <LogViewer run={run} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
