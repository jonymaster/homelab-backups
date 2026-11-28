"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  ArrowUpCircleIcon,
  CheckCircle2Icon,
  DatabaseBackupIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileUpIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/PageStates";
import RelativeTime from "@/components/RelativeTime";
import {
  api,
  downloads,
  errorMessage,
  type ImportResult,
  type Settings,
} from "@/lib/api";
import { formatVersion } from "@/lib/format";
import { useUpdateSettings, useUpdates } from "@/lib/queries";
import { Hint, SectionHeading, SwitchRow } from "./SettingsForm";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ImportSummary({ result }: { result: ImportResult }) {
  const clean = result.errors.length === 0;
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border bg-raised/50 px-3.5 py-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        {clean ? (
          <CheckCircle2Icon className="size-4 text-success" aria-hidden />
        ) : (
          <AlertTriangleIcon className="size-4 text-stale" aria-hidden />
        )}
        {clean ? "Import finished" : "Import finished with problems"}
      </p>
      <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground">
        <li>{plural(result.jobs_created, "job")} created</li>
        {result.jobs_skipped.length > 0 && (
          <li>
            {plural(result.jobs_skipped.length, "job")} skipped because the name
            exists: {result.jobs_skipped.join(", ")}
          </li>
        )}
        <li>
          {plural(result.channels_created, "channel")} created
          {result.channels_created > 0 &&
            ". Channels without secrets stay off until you edit them"}
        </li>
        <li>{result.settings_applied ? "Settings applied" : "Settings unchanged"}</li>
      </ul>
      {!clean && (
        <ul className="flex flex-col gap-1 border-t border-divider pt-2 font-mono text-xs text-failed">
          {result.errors.map((e, i) => (
            <li key={i} className="[overflow-wrap:anywhere]">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-divider py-4 first:border-t-0 first:pt-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-raised text-link">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-[13px] text-muted-foreground">{description}</span>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Updates({ settings }: { settings: Settings }) {
  const { data, error, isFetching, refetch } = useUpdates();
  const save = useUpdateSettings();
  const checking = settings.maintenance.update_check;

  let status: React.ReactNode;
  if (!data) {
    status = error ? (
      <span className="text-failed">Couldn&apos;t read the version: {errorMessage(error)}</span>
    ) : (
      <Skeleton className="h-5 w-48" />
    );
  } else if (data.update_available && data.latest) {
    status = (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-stale">
          {formatVersion(data.latest)} is available
        </span>
        {data.release_url && (
          <a
            href={data.release_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-link hover:underline"
          >
            Release notes
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        )}
      </span>
    );
  } else if (!checking) {
    status = <span className="text-muted-foreground">Update check is off.</span>;
  } else if (data.latest === null) {
    status = <span className="text-muted-foreground">Couldn&apos;t reach GitHub to check.</span>;
  } else {
    status = (
      <span className="flex items-center gap-1.5 text-success">
        <CheckCircle2Icon className="size-4" aria-hidden />
        Up to date
      </span>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionHeading title="Version" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {data ? (
          <span className="font-mono text-2xl font-semibold tabular-nums">
            {formatVersion(data.current)}
          </span>
        ) : (
          <Skeleton className="h-8 w-20" />
        )}
        <div className="flex min-w-0 flex-col gap-0.5 text-sm" aria-live="polite">
          {status}
          {data?.checked_at && checking && (
            <span className="text-[13px] text-muted-foreground">
              Checked <RelativeTime value={data.checked_at} />
              {isFetching && " · checking…"}
            </span>
          )}
        </div>
        {checking && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto"
          >
            {isFetching ? <LoaderCircleIcon className="animate-spin" /> : <ArrowUpCircleIcon />}
            Check now
          </Button>
        )}
      </div>
      <div className="border-t border-divider">
        <SwitchRow
          label="Check for updates"
          description="Asks GitHub for the latest release every 6 hours. Nothing else is sent."
          checked={checking}
          disabled={save.isPending}
          onCheckedChange={(update_check) =>
            save.mutate(
              { maintenance: { update_check } },
              {
                onSuccess: () =>
                  toast.success(update_check ? "Update check on" : "Update check off"),
                onError: (e) => toast.error(errorMessage(e)),
              }
            )
          }
        />
      </div>
    </Card>
  );
}

export default function MaintenanceSection({ settings }: { settings: Settings }) {
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const importConfig = useMutation({
    mutationFn: (file: File) => api.importConfig(file),
    onMutate: () => setResult(null),
    onSuccess: (r) => {
      setResult(r);
      // An import can touch jobs, channels and settings alike.
      client.invalidateQueries();
      if (r.errors.length === 0) toast.success("Import finished");
      else toast.warning("Import finished with problems");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <SectionHeading
          title="Backup and restore"
          description="Move your setup to another server, or keep a copy of it."
        />
        <div className="flex flex-col">
          <Row
            icon={DownloadIcon}
            title="Export configuration"
            description="Jobs, settings and channels as YAML. Channel secrets are left out."
          >
            <Button asChild variant="outline">
              <a href={downloads.export} download>
                <DownloadIcon />
                Download YAML
              </a>
            </Button>
          </Row>
          <Row
            icon={FileUpIcon}
            title="Import configuration"
            description="Adds jobs and channels from an export. Jobs with an existing name are skipped."
          >
            <input
              ref={fileInput}
              type="file"
              accept=".yaml,.yml,application/yaml,text/yaml"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) importConfig.mutate(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={importConfig.isPending}
            >
              {importConfig.isPending ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <FileUpIcon />
              )}
              Choose file…
            </Button>
          </Row>
          {(result || importConfig.error) && (
            <div className="pb-4 sm:pl-14">
              {result ? (
                <ImportSummary result={result} />
              ) : (
                <p role="alert" className="rounded-lg border border-failed/40 bg-failed/8 px-3.5 py-3 text-sm text-failed">
                  {errorMessage(importConfig.error)}
                </p>
              )}
            </div>
          )}
          <Row
            icon={DatabaseBackupIcon}
            title="Database backup"
            description="A consistent copy of the SQLite database, including run history and secrets."
          >
            <Button asChild variant="outline">
              <a href={downloads.databaseBackup} download>
                <DownloadIcon />
                Download .db
              </a>
            </Button>
          </Row>
        </div>
        <Hint>
          The database file contains channel secrets. Store it somewhere safe.
        </Hint>
      </Card>
      <Updates settings={settings} />
    </div>
  );
}
