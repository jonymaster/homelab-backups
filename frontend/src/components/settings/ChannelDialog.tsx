"use client";

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  SendIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  api,
  errorMessage,
  type Channel,
  type ChannelField,
  type ChannelType,
  type TestResult,
} from "@/lib/api";
import {
  SECRET_PLACEHOLDER,
  buildConfig,
  hasStoredSecrets,
  initialValues,
  missingRequired,
  sameValues,
  type FormValues,
} from "@/lib/channels";
import { keys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { channelBlurb, channelIcon } from "./channel-icons";
import { FieldLabel, Hint } from "./SettingsForm";

function TypePicker({
  types,
  onPick,
}: {
  types: ChannelType[];
  onPick: (type: ChannelType) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Channel types">
      {types.map((t) => {
        const Icon = channelIcon(t.type);
        return (
          <li key={t.type}>
            <button
              type="button"
              onClick={() => onPick(t)}
              className="group flex h-full min-h-24 w-full flex-col items-start gap-2 rounded-xl border bg-raised/40 p-3.5 text-left transition-colors outline-none hover:border-primary/60 hover:bg-primary/6 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-raised text-link transition-colors group-hover:bg-primary/16">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-semibold">{t.label}</span>
              {channelBlurb(t.type) && (
                <span className="text-xs leading-snug text-muted-foreground">
                  {channelBlurb(t.type)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FieldInput({
  field,
  id,
  value,
  onChange,
  storedSecret,
}: {
  field: ChannelField;
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Editing a channel whose secret is set and not yet retyped. */
  storedSecret: boolean;
}) {
  const [reveal, setReveal] = useState(false);

  if (field.type === "select" && field.options) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.secret) {
    return (
      <div className="relative">
        <Input
          id={id}
          type={reveal ? "text" : "password"}
          value={storedSecret ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            storedSecret ? "Saved. Type to replace it." : (field.placeholder ?? "")
          }
          autoComplete="new-password"
          spellCheck={false}
          required={field.required && !storedSecret}
          className="pr-12 font-mono"
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? `Hide ${field.label}` : `Show ${field.label}`}
          aria-pressed={reveal}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {reveal ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
    );
  }

  return (
    <Input
      id={id}
      type={field.type === "number" ? "number" : "text"}
      inputMode={field.type === "number" ? "numeric" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder ?? ""}
      autoComplete="off"
      spellCheck={false}
      required={field.required}
    />
  );
}

export function TestOutcome({ result }: { result: TestResult }) {
  return result.ok ? (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/8 px-3.5 py-3 text-sm text-success"
    >
      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      Test message sent. Check that it arrived.
    </p>
  ) : (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-failed/40 bg-failed/8 px-3.5 py-3 text-sm text-failed"
    >
      <XCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">The test failed.</span>
        {result.error && (
          <span className="font-mono text-xs [overflow-wrap:anywhere] text-failed/90">
            {result.error}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ChannelDialog({
  open,
  onOpenChange,
  types,
  channel,
  onTested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: ChannelType[];
  /** Present when editing. */
  channel?: Channel;
  onTested?: (channelId: number, result: TestResult) => void;
}) {
  const ids = useId();
  const client = useQueryClient();
  const isEdit = channel !== undefined;
  const [type, setType] = useState<ChannelType | null>(
    () => types.find((t) => t.type === channel?.type) ?? null
  );
  const [name, setName] = useState(channel?.name ?? "");
  const [initial, setInitial] = useState<FormValues>(() =>
    type ? initialValues(type.fields, channel) : {}
  );
  const [values, setValues] = useState<FormValues>(initial);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields = type?.fields ?? [];
  const dirty =
    !isEdit || name.trim() !== channel.name || !sameValues(values, initial);
  const missing = missingRequired(
    fields.filter((f) => !(f.secret && values[f.key] === SECRET_PLACEHOLDER)),
    values
  );

  const pick = (t: ChannelType) => {
    const start = initialValues(t.fields);
    setType(t);
    setInitial(start);
    setValues(start);
    setName((n) => n || t.label);
    setResult(null);
    setError(null);
  };

  const change = (key: string, value: string) => {
    setResult(null);
    setError(null);
    setValues((v) => ({
      ...v,
      // Clearing a stored secret's field keeps the stored value.
      [key]: value === "" && initial[key] === SECRET_PLACEHOLDER ? SECRET_PLACEHOLDER : value,
    }));
  };

  const test = useMutation({
    mutationFn: () => {
      if (isEdit && (!dirty || hasStoredSecrets(fields, values))) {
        return api.testChannel(channel.id);
      }
      return api.testUnsavedChannel(type!.type, buildConfig(fields, values));
    },
    onSuccess: (r) => {
      setResult(r);
      if (isEdit && !dirty) onTested?.(channel.id, r);
    },
    onError: (e) => setResult({ ok: false, error: errorMessage(e) }),
  });

  const save = useMutation({
    mutationFn: () => {
      const config = buildConfig(fields, values);
      return isEdit
        ? api.updateChannel(channel.id, { name: name.trim(), config })
        : api.createChannel({ name: name.trim(), type: type!.type, enabled: true, config });
    },
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: keys.channels });
      toast.success(isEdit ? `Saved ${saved.name}` : `Added ${saved.name}`, {
        description: isEdit ? undefined : "Use Test in the list to check it any time.",
      });
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const problem = !name.trim()
    ? "Give the channel a name."
    : missing.length > 0
      ? `Fill in ${missing.map((f) => f.label).join(", ")}.`
      : null;

  // Testing unsaved edits needs the real secret, which only the backend has.
  const untestableEdit = isEdit && dirty && hasStoredSecrets(fields, values);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    save.mutate();
  };

  const Icon = type ? channelIcon(type.type) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            {Icon && (
              <span className="flex size-8 items-center justify-center rounded-lg bg-raised text-link">
                <Icon className="size-4" aria-hidden />
              </span>
            )}
            {isEdit
              ? `Edit ${channel.name}`
              : type
                ? `Add ${type.label}`
                : "Add a notification channel"}
          </DialogTitle>
          <DialogDescription>
            {type
              ? isEdit
                ? "Secrets stay hidden. Leave them empty to keep the saved values."
                : "Send a test before saving to check the details."
              : "Pick where alerts should go. You can add more than one."}
          </DialogDescription>
        </DialogHeader>

        {!type ? (
          <TypePicker types={types} onPick={pick} />
        ) : (
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={`${ids}-name`}>Name</FieldLabel>
              <Input
                id={`${ids}-name`}
                value={name}
                onChange={(e) => {
                  setError(null);
                  setName(e.target.value);
                }}
                placeholder="Phone"
                autoComplete="off"
                autoFocus={!isEdit}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => {
                const id = `${ids}-${field.key}`;
                const wide = field.secret || field.key.endsWith("url");
                return (
                  <div
                    key={field.key}
                    className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}
                  >
                    <FieldLabel htmlFor={id}>
                      {field.label}
                      {!field.required && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          (optional)
                        </span>
                      )}
                    </FieldLabel>
                    <FieldInput
                      field={field}
                      id={id}
                      value={values[field.key] ?? ""}
                      onChange={(v) => change(field.key, v)}
                      storedSecret={values[field.key] === SECRET_PLACEHOLDER}
                    />
                  </div>
                );
              })}
            </div>

            {type.type === "apprise" && (
              <Hint>
                Any{" "}
                <a
                  href="https://github.com/caronc/apprise/wiki"
                  target="_blank"
                  rel="noreferrer"
                  className="text-link underline-offset-4 hover:underline"
                >
                  Apprise URL
                </a>
                , for example <span className="font-mono">mailto://</span>,{" "}
                <span className="font-mono">matrix://</span> or{" "}
                <span className="font-mono">json://</span>.
              </Hint>
            )}

            {result && <TestOutcome result={result} />}
            {untestableEdit && !result && (
              <Hint>
                Send test uses the saved settings. Retype the secrets to test
                your edits before saving.
              </Hint>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-failed/40 bg-failed/8 px-3.5 py-3 text-sm text-failed"
              >
                {error}
              </p>
            )}

            <DialogFooter className="sticky -bottom-4 z-10 mt-1 flex-row flex-wrap justify-between gap-2 bg-popover sm:justify-between">
              {!isEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setType(null);
                    setResult(null);
                    setError(null);
                  }}
                >
                  <ArrowLeftIcon />
                  Change type
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    test.mutate();
                  }}
                  disabled={test.isPending || (missing.length > 0 && !isEdit)}
                  title={missing.length > 0 && !isEdit ? (problem ?? undefined) : undefined}
                >
                  {test.isPending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
                  Send test
                </Button>
                <Button type="submit" disabled={save.isPending || (isEdit && !dirty)}>
                  {save.isPending && <LoaderCircleIcon className="animate-spin" />}
                  {isEdit ? "Save changes" : "Add channel"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
