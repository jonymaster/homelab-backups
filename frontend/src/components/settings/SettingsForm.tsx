"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  errorMessage,
  type Settings,
  type SettingsSection,
} from "@/lib/api";
import { useUpdateSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Local draft of one settings section. The draft is null while it matches
 * what is saved, so a fresh server answer shows up without syncing effects.
 */
export function useSectionDraft<K extends SettingsSection>(
  section: K,
  saved: Settings[K],
  {
    label,
    onDirtyChange,
  }: { label: string; onDirtyChange?: (dirty: boolean) => void }
) {
  const [draft, setDraft] = useState<Settings[K] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateSettings();
  const value = draft ?? saved;
  const dirty = draft !== null && !same(draft, saved);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const patch = (changes: Partial<Settings[K]>) => {
    setError(null);
    setDraft({ ...value, ...changes });
  };

  const discard = () => {
    setError(null);
    setDraft(null);
  };

  const save = (override?: Settings[K]) => {
    setError(null);
    mutation.mutate(
      { [section]: override ?? value },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success(`${label} saved`);
        },
        onError: (e) => {
          setError(errorMessage(e));
          toast.error(`Couldn't save ${label.toLowerCase()}`);
        },
      }
    );
  };

  return {
    value,
    dirty,
    patch,
    discard,
    save,
    error,
    setError,
    pending: mutation.isPending,
  };
}

export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="max-w-prose text-[13px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Save/discard footer; it sticks above the mobile nav while there are edits. */
export function SaveBar({
  dirty,
  pending,
  error,
  invalid,
  onDiscard,
}: {
  dirty: boolean;
  pending: boolean;
  error: string | null;
  /** Client-side problem that blocks saving. */
  invalid?: string | null;
  onDiscard: () => void;
}) {
  const problem = error ?? invalid ?? null;
  return (
    <footer
      className={cn(
        "-mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t px-5 py-3.5",
        dirty &&
          "sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 bg-card/95 backdrop-blur lg:bottom-0"
      )}
    >
      <div className="min-w-0 flex-[1_1_200px] text-[13px]" aria-live="polite">
        {problem ? (
          <p role="alert" className="text-failed">
            {problem}
          </p>
        ) : dirty ? (
          <p className="flex items-center gap-2 font-medium text-stale">
            <span className="size-2 rounded-full bg-stale" aria-hidden />
            Unsaved changes
          </p>
        ) : (
          <p className="text-muted-foreground">All changes saved</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onDiscard}
          disabled={!dirty || pending}
        >
          Discard
        </Button>
        <Button type="submit" disabled={!dirty || pending || Boolean(invalid)}>
          {pending && <LoaderCircleIcon className="animate-spin" />}
          Save
        </Button>
      </div>
    </footer>
  );
}

export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Extra controls shown under the row while it is on. */
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor={id} className="min-h-6 text-sm font-medium">
            {label}
          </Label>
          {description && (
            <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-describedby={description ? `${id}-hint` : undefined}
          className="mt-0.5 pointer-coarse:mt-1 pointer-coarse:scale-125"
        />
      </div>
      {checked && children}
    </div>
  );
}

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-[13px] text-foreground/80">
      {children}
    </Label>
  );
}

export function Hint({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p id={id} className={cn("text-[13px] text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/** Pill toggle group, same look as the schedule frequency picker. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11",
              on
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground/80 hover:border-muted-foreground/50"
            )}
          >
            {option.icon && <option.icon className="size-4" aria-hidden />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
