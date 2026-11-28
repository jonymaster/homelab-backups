"use client";

import { useId, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import {
  RETENTION_CHOICES,
  retentionFromKey,
  retentionKey,
  retentionLabel,
} from "@/lib/job-options";
import { useExcludePresets } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function RetentionSelect({
  value,
  onChange,
  hint = "Snapshots older than this are removed after each successful backup.",
}: {
  value: number | null;
  onChange: (days: number | null) => void;
  hint?: string;
}) {
  const id = useId();
  const known = RETENTION_CHOICES.some((c) => c.days === value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] text-foreground/80">
        Keep snapshots for
      </Label>
      <Select
        value={retentionKey(value)}
        onValueChange={(key) => onChange(retentionFromKey(key))}
      >
        <SelectTrigger id={id} className="w-full sm:w-56" aria-describedby={`${id}-hint`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RETENTION_CHOICES.map((c) => (
            <SelectItem key={retentionKey(c.days)} value={retentionKey(c.days)}>
              {c.label}
            </SelectItem>
          ))}
          {!known && (
            <SelectItem value={retentionKey(value)}>{retentionLabel(value)}</SelectItem>
          )}
        </SelectContent>
      </Select>
      <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
        {value === null ? "Every snapshot is kept; the backup only grows." : hint}
      </p>
    </div>
  );
}

/** Preset checkboxes plus free-form patterns, one per line. */
export function ExclusionFields({
  presets,
  onPresetsChange,
  patternsText,
  onPatternsTextChange,
}: {
  presets: string[];
  onPresetsChange: (ids: string[]) => void;
  patternsText: string;
  onPatternsTextChange: (text: string) => void;
}) {
  const id = useId();
  const { data, error } = useExcludePresets();
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (presetId: string, on: boolean) => {
    const all = data?.map((p) => p.id) ?? [];
    const next = new Set(presets);
    if (on) next.add(presetId);
    else next.delete(presetId);
    // Keep the catalogue order so toggling back and forth is not a change.
    onPresetsChange([
      ...all.filter((x) => next.has(x)),
      ...[...next].filter((x) => !all.includes(x)),
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-foreground/80">
          Skip common clutter
        </legend>
        {error && !data ? (
          <p className="text-[13px] text-failed">
            Couldn&apos;t load presets: {errorMessage(error)}
          </p>
        ) : !data ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.map((preset) => {
              const checked = presets.includes(preset.id);
              const open = expanded === preset.id;
              const boxId = `${id}-${preset.id}`;
              return (
                <li
                  key={preset.id}
                  className={cn(
                    "flex flex-col rounded-lg border transition-colors",
                    checked ? "border-primary/50 bg-primary/6" : "border-border"
                  )}
                >
                  <div className="flex items-center gap-1 pr-1">
                    <Label
                      htmlFor={boxId}
                      className="flex min-h-12 flex-1 cursor-pointer items-center gap-3 px-3.5 text-sm font-medium"
                    >
                      <Checkbox
                        id={boxId}
                        checked={checked}
                        onCheckedChange={(v) => toggle(preset.id, v === true)}
                      />
                      {preset.label}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : preset.id)}
                      aria-expanded={open}
                      aria-controls={`${boxId}-patterns`}
                      aria-label={`${open ? "Hide" : "Show"} patterns for ${preset.label}`}
                      title={preset.patterns.join("  ")}
                      className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-raised hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-11"
                    >
                      <ChevronDownIcon
                        className={cn("size-4 transition-transform", open && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                  </div>
                  {open && (
                    <ul
                      id={`${boxId}-patterns`}
                      className="flex flex-wrap gap-1.5 border-t border-divider px-3.5 py-2.5"
                    >
                      {preset.patterns.map((p) => (
                        <li
                          key={p}
                          className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-foreground/80"
                        >
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-patterns`} className="text-[13px] text-foreground/80">
          Custom patterns
        </Label>
        <Textarea
          id={`${id}-patterns`}
          value={patternsText}
          onChange={(e) => onPatternsTextChange(e.target.value)}
          placeholder={"**/*.log\n**/.DS_Store"}
          spellCheck={false}
          autoComplete="off"
          rows={3}
          className="min-h-20 font-mono"
          aria-describedby={`${id}-patterns-hint`}
        />
        <p id={`${id}-patterns-hint`} className="text-[13px] text-muted-foreground">
          One glob per line. Start with <span className="font-mono">**/</span>{" "}
          to match at any depth; other patterns are relative to the source
          folder.
        </p>
      </div>
    </div>
  );
}
