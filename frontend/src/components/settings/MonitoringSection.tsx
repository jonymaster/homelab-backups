"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/PageStates";
import { downloads, type Settings } from "@/lib/api";
import { useDashboard } from "@/lib/queries";
import {
  FieldLabel,
  Hint,
  SaveBar,
  SectionHeading,
  SwitchRow,
  useSectionDraft,
} from "./SettingsForm";

const MIN = 50;
const MAX = 99;

const noop = () => () => {};

/** window.location is unknown during SSR. */
export function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => ""
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 font-mono text-[13px] [overflow-wrap:anywhere] select-all">
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${label}`}
      >
        {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      </Button>
    </div>
  );
}

export default function MonitoringSection({
  settings,
  onDirtyChange,
}: {
  settings: Settings;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const origin = useOrigin();
  const { data: dashboard } = useDashboard();
  const form = useSectionDraft("monitoring", settings.monitoring, {
    label: "Monitoring",
    onDirtyChange,
  });
  const { value } = form;
  const [percentText, setPercentText] = useState<string | null>(null);

  const disks = dashboard?.disks.filter((d) => d.total_bytes > 0) ?? [];
  const fullest = disks.reduce<number | null>((max, d) => {
    const pct = Math.round((d.used_bytes / d.total_bytes) * 100);
    return max === null || pct > max ? pct : max;
  }, null);

  const setPercent = (n: number) => {
    setPercentText(null);
    form.patch({ disk_warning_percent: Math.min(MAX, Math.max(MIN, Math.round(n))) });
  };

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          form.save();
        }}
        className="flex flex-col gap-5"
      >
        <SectionHeading
          title="Monitoring"
          description="When to warn about disk space, and how other tools can watch your backups."
        />

        <div className="flex flex-col gap-3">
          <FieldLabel htmlFor={`${id}-pct`}>Warn when a disk is fuller than</FieldLabel>
          <div className="flex items-center gap-4">
            <Slider
              min={MIN}
              max={MAX}
              step={1}
              value={[value.disk_warning_percent]}
              onValueChange={([n]) => setPercent(n)}
              aria-label="Disk warning level"
              className="max-w-sm flex-1 py-3 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-track]]:h-1.5"
            />
            <div className="flex items-center gap-1.5">
              <Input
                id={`${id}-pct`}
                type="number"
                inputMode="numeric"
                min={MIN}
                max={MAX}
                value={percentText ?? String(value.disk_warning_percent)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPercentText(e.target.value);
                  if (e.target.value !== "" && n >= MIN && n <= MAX) setPercent(n);
                }}
                onBlur={() => setPercentText(null)}
                className="w-20 text-right tabular-nums"
                aria-describedby={`${id}-pct-hint`}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <Hint id={`${id}-pct-hint`}>
            Between {MIN} and {MAX}%. Shown on the dashboard and sent as a
            &ldquo;Disk almost full&rdquo; notification.
            {fullest !== null && ` Your fullest disk is at ${fullest}% now.`}
          </Hint>
        </div>

        <div className="border-t border-divider">
          <SwitchRow
            label="Prometheus metrics"
            description="Exposes last success, duration, size and disk space per job for Prometheus or Grafana."
            checked={value.metrics_enabled}
            onCheckedChange={(on) => form.patch({ metrics_enabled: on })}
          >
            <div className="flex flex-col gap-1.5">
              <CopyField value={`${origin}${downloads.metrics}`} label="metrics URL" />
              <Hint>
                {settings.monitoring.metrics_enabled
                  ? "Add it as a scrape target. No authentication is required."
                  : "Available once you save."}
              </Hint>
            </div>
          </SwitchRow>
        </div>

        <p className="rounded-lg bg-raised px-3.5 py-3 text-[13px] text-muted-foreground">
          For push-style monitoring (healthchecks.io, Uptime Kuma), add a ping
          URL to each job in its <span className="font-medium text-foreground">Options</span>{" "}
          step. It is called after every run.
        </p>

        <SaveBar
          dirty={form.dirty}
          pending={form.pending}
          error={form.error}
          onDiscard={() => {
            setPercentText(null);
            form.discard();
          }}
        />
      </form>
    </Card>
  );
}
