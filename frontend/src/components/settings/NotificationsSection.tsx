"use client";

import { useCallback, useId, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellOffIcon,
  CheckCircle2Icon,
  InboxIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, EmptyState, ErrorState } from "@/components/PageStates";
import RelativeTime from "@/components/RelativeTime";
import {
  api,
  errorMessage,
  type Channel,
  type ChannelType,
  type NotificationEvent,
  type NotificationLogEntry,
  type Settings,
  type TestResult,
} from "@/lib/api";
import { formatTimeString } from "@/lib/format";
import {
  keys,
  useChannelTypes,
  useChannels,
  useClock,
  useNotificationLog,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import ChannelDialog from "./ChannelDialog";
import { channelIcon } from "./channel-icons";
import {
  FieldLabel,
  SaveBar,
  SectionHeading,
  SwitchRow,
  useSectionDraft,
} from "./SettingsForm";

const EVENTS: {
  key: NotificationEvent;
  label: string;
  description: string;
}[] = [
  {
    key: "run_failed",
    label: "Backup failed",
    description: "A run ends with an error.",
  },
  {
    key: "run_recovered",
    label: "Backup recovered",
    description: "The first success after one or more failures.",
  },
  {
    key: "job_stale",
    label: "Missed runs",
    description: "A job has not succeeded on schedule and is now stale.",
  },
  {
    key: "disk_low",
    label: "Disk almost full",
    description: "A backup disk crosses the warning level set in Monitoring.",
  },
  {
    key: "run_succeeded",
    label: "Backup succeeded",
    description: "Every successful run. Noisy with frequent schedules.",
  },
  {
    key: "weekly_summary",
    label: "Weekly summary",
    description: "One digest of all jobs, runs and disk space.",
  },
];

const EVENT_LABELS: Record<NotificationLogEntry["event"], string> = {
  run_failed: "Failed",
  run_recovered: "Recovered",
  job_stale: "Missed runs",
  disk_low: "Disk low",
  run_succeeded: "Succeeded",
  weekly_summary: "Weekly summary",
  test: "Test",
};

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type TestResults = Record<number, TestResult & { at: string }>;

function ChannelRow({
  channel,
  type,
  lastTest,
  onTested,
  onEdit,
}: {
  channel: Channel;
  type: ChannelType | undefined;
  lastTest: TestResults[number] | undefined;
  onTested: (id: number, result: TestResult) => void;
  onEdit: () => void;
}) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const Icon = channelIcon(channel.type);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.updateChannel(channel.id, { enabled }),
    onSuccess: (saved) => {
      client.setQueryData<Channel[]>(keys.channels, (list) =>
        list?.map((c) => (c.id === saved.id ? saved : c))
      );
      toast.success(`${saved.name} ${saved.enabled ? "enabled" : "disabled"}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const test = useMutation({
    mutationFn: () => api.testChannel(channel.id),
    onSuccess: (result) => {
      onTested(channel.id, result);
      if (result.ok) toast.success(`Test sent to ${channel.name}`);
      else toast.error(`Test to ${channel.name} failed`, { description: result.error ?? undefined });
    },
    onError: (e) => {
      onTested(channel.id, { ok: false, error: errorMessage(e) });
      toast.error(errorMessage(e));
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.notificationLog }),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteChannel(channel.id),
    onSuccess: () => {
      toast.success(`Deleted ${channel.name}`);
      setConfirming(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => client.invalidateQueries({ queryKey: keys.channels }),
  });

  const enabled = toggle.isPending ? toggle.variables : channel.enabled;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-divider py-3.5 first:border-t-0">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg bg-raised",
          enabled ? "text-link" : "text-muted-foreground"
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-[1_1_160px] flex-col gap-0.5">
        <span className={cn("truncate font-medium", !enabled && "text-muted-foreground")}>
          {channel.name}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
          {type?.label ?? channel.type}
          {lastTest && (
            <>
              <span aria-hidden>·</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className={cn(
                      "flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      lastTest.ok ? "text-success" : "text-failed"
                    )}
                  >
                    {lastTest.ok ? (
                      <CheckCircle2Icon className="size-3.5" aria-hidden />
                    ) : (
                      <XCircleIcon className="size-3.5" aria-hidden />
                    )}
                    {lastTest.ok ? "Test sent" : "Test failed"}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {lastTest.ok ? "Last test succeeded" : (lastTest.error ?? "Last test failed")}
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] text-muted-foreground">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => toggle.mutate(v)}
            disabled={toggle.isPending}
            aria-label={`${channel.name} enabled`}
          />
          <span className="w-14">{enabled ? "On" : "Off"}</span>
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => test.mutate()}
          disabled={test.isPending}
          aria-label={`Send a test to ${channel.name}`}
        >
          {test.isPending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
          Test
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${channel.name}`}>
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${channel.name}`}
          className="hover:text-failed"
        >
          <Trash2Icon />
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {channel.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Notifications stop going to this channel. Its saved secrets are
              removed too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending && <LoaderCircleIcon className="animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function Channels() {
  const { data: channels, error, refetch } = useChannels();
  const { data: types, error: typesError } = useChannelTypes();
  const [dialog, setDialog] = useState<{ key: number; channel?: Channel } | null>(null);
  const [tests, setTests] = useState<TestResults>({});

  const onTested = useCallback((id: number, result: TestResult) => {
    setTests((t) => ({ ...t, [id]: { ...result, at: new Date().toISOString() } }));
  }, []);

  const openDialog = (channel?: Channel) => setDialog({ key: Date.now(), channel });
  const canAdd = Boolean(types);

  const addButton = (
    <Button onClick={() => openDialog()} disabled={!canAdd}>
      <PlusIcon />
      Add channel
    </Button>
  );

  let body: React.ReactNode;
  if (error && !channels) {
    body = <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load channels" />;
  } else if (!channels) {
    body = (
      <div className="flex flex-col gap-2" aria-busy>
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  } else if (channels.length === 0) {
    body = (
      <EmptyState
        icon={BellOffIcon}
        title="No channels yet"
        description="Add ntfy, Telegram, email or 90+ other services to hear about failed backups."
        action={addButton}
      />
    );
  } else {
    body = (
      <ul>
        {channels.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            type={types?.find((t) => t.type === channel.type)}
            lastTest={tests[channel.id]}
            onTested={onTested}
            onEdit={() => openDialog(channel)}
          />
        ))}
      </ul>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <SectionHeading
        title="Channels"
        description="Where alerts are sent. Every enabled channel gets every event."
        actions={channels && channels.length > 0 ? addButton : undefined}
      />
      {typesError && (
        <p role="alert" className="text-[13px] text-failed">
          Couldn&apos;t load channel types: {errorMessage(typesError)}
        </p>
      )}
      {body}
      {dialog && types && (
        <ChannelDialog
          key={dialog.key}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          types={types}
          channel={dialog.channel}
          onTested={onTested}
        />
      )}
    </Card>
  );
}

function Events({
  saved,
  onDirtyChange,
}: {
  saved: Settings["notifications"];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const ids = useId();
  const clock = useClock();
  const { data: channels } = useChannels();
  const form = useSectionDraft("notifications", saved, {
    label: "Notification events",
    onDirtyChange,
  });
  const { value } = form;
  const setEvent = (key: NotificationEvent, on: boolean) =>
    form.patch({ events: { ...value.events, [key]: on } });

  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(value.weekly_summary_time);

  return (
    <Card>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (timeValid) form.save();
        }}
        className="flex flex-col gap-2"
      >
        <SectionHeading
          title="Events"
          description="Choose what is worth a message. Jobs can opt out, or ask for every event, in their Options."
        />
        {channels?.length === 0 && (
          <p className="mt-2 rounded-lg bg-raised px-3.5 py-3 text-[13px] text-muted-foreground">
            Nothing is sent until you add a channel above.
          </p>
        )}
        <div className="flex flex-col divide-y divide-divider">
          {EVENTS.map((event) => (
            <SwitchRow
              key={event.key}
              label={event.label}
              description={event.description}
              checked={value.events[event.key]}
              onCheckedChange={(on) => setEvent(event.key, on)}
            >
              {event.key === "weekly_summary" && (
                <div className="flex flex-wrap gap-4 rounded-lg bg-raised p-3.5">
                  <div className="flex w-full flex-col gap-1.5 sm:w-48">
                    <FieldLabel htmlFor={`${ids}-day`}>Day</FieldLabel>
                    <Select
                      value={String(value.weekly_summary_day)}
                      onValueChange={(d) => form.patch({ weekly_summary_day: Number(d) })}
                    >
                      <SelectTrigger id={`${ids}-day`} className="w-full bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((name, i) => (
                          <SelectItem key={name} value={String(i)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex w-full flex-col gap-1.5 sm:w-48">
                    <FieldLabel htmlFor={`${ids}-time`}>At</FieldLabel>
                    <Input
                      id={`${ids}-time`}
                      type="time"
                      value={value.weekly_summary_time}
                      onChange={(e) => form.patch({ weekly_summary_time: e.target.value })}
                      aria-invalid={!timeValid}
                    />
                  </div>
                  <p className="w-full text-[13px] text-muted-foreground">
                    Sent every {WEEKDAYS[value.weekly_summary_day] ?? "week"} at{" "}
                    {formatTimeString(value.weekly_summary_time, clock)}, server time.
                  </p>
                </div>
              )}
            </SwitchRow>
          ))}
        </div>
        <SaveBar
          dirty={form.dirty}
          pending={form.pending}
          error={form.error}
          invalid={timeValid ? null : "Pick a time for the weekly summary."}
          onDiscard={form.discard}
        />
      </form>
    </Card>
  );
}

function Log() {
  const { data, error, refetch } = useNotificationLog(50);

  return (
    <Card className="flex flex-col gap-3">
      <SectionHeading
        title="Recent notifications"
        description="The last 50 send attempts across all channels, newest first."
      />
      {error && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load the log" />
      ) : !data ? (
        <div className="flex flex-col gap-2" aria-busy>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Nothing sent yet"
          description="Tests and alerts show up here with their delivery status."
        />
      ) : (
        <ul className="flex flex-col">
          {data.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-3 border-t border-divider py-3 first:border-t-0"
            >
              {entry.ok ? (
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-label="Delivered" />
              ) : (
                <XCircleIcon className="mt-0.5 size-4 shrink-0 text-failed" aria-label="Failed" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
                    {entry.title}
                  </span>
                  <RelativeTime value={entry.at} className="text-[13px] text-muted-foreground" />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                  <span className="rounded bg-raised px-1.5 py-0.5 text-xs font-medium text-foreground/80">
                    {EVENT_LABELS[entry.event] ?? entry.event}
                  </span>
                  {entry.job_id !== null && (
                    <Link
                      href={`/jobs/view?id=${entry.job_id}`}
                      className="font-medium text-link hover:underline"
                    >
                      {entry.job_name ?? `Job #${entry.job_id}`}
                    </Link>
                  )}
                </div>
                {!entry.ok && entry.error && (
                  <p className="font-mono text-xs [overflow-wrap:anywhere] text-failed">
                    {entry.error}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function NotificationsSection({
  settings,
  onDirtyChange,
}: {
  settings: Settings;
  onDirtyChange: (dirty: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Channels />
      <Events saved={settings.notifications} onDirtyChange={onDirtyChange} />
      <Log />
    </div>
  );
}
