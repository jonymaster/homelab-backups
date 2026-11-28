"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatExact, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import {
  DEFAULT_SCHEDULE,
  Frequency,
  MAX_DAY_OF_MONTH,
  Schedule,
  WEEKDAY_NAMES,
  isCronShaped,
  nextRuns,
  parseCron,
  summarize,
  toCron,
} from "@/utils/schedule";

interface ScheduleFieldProps {
  /** Initial cron; later changes are reported through onChange only. */
  initialCron?: string;
  /** Emits the cron string, or "" while the selection is incomplete. */
  onChange: (cron: string) => void;
  /** Server zone, used for the next-run preview. */
  timeZone?: string;
}

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

// Monday first reads more naturally than the cron order.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const pad = (n: number) => String(n).padStart(2, "0");

const toggleClass = (on: boolean) =>
  cn(
    "rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    on
      ? "border-foreground bg-foreground text-background"
      : "border-border text-foreground/80 hover:border-muted-foreground/50"
  );

export default function ScheduleField({
  initialCron,
  onChange,
  timeZone,
}: ScheduleFieldProps) {
  const ids = useId();
  const now = useNow();
  const initialPreset = initialCron ? parseCron(initialCron) : DEFAULT_SCHEDULE;
  const [schedule, setSchedule] = useState<Schedule>(
    initialPreset ?? DEFAULT_SCHEDULE
  );
  const [advanced, setAdvanced] = useState(initialPreset === null);
  const [cron, setCron] = useState(initialCron ?? toCron(DEFAULT_SCHEDULE));

  const incomplete = (s: Schedule) =>
    s.frequency === "weekly" && s.weekdays.length === 0;

  const emitPreset = (next: Schedule) => {
    setSchedule(next);
    onChange(incomplete(next) ? "" : toCron(next));
  };

  const advancedParsed = parseCron(cron);

  const toggleAdvanced = () => {
    if (!advanced) {
      const current = incomplete(schedule) ? "" : toCron(schedule);
      setCron(current);
      onChange(current);
      setAdvanced(true);
      return;
    }
    if (!advancedParsed) return;
    setAdvanced(false);
    emitPreset(advancedParsed);
  };

  const toggleDay = (day: number) => {
    const weekdays = schedule.weekdays.includes(day)
      ? schedule.weekdays.filter((d) => d !== day)
      : [...schedule.weekdays, day];
    emitPreset({ ...schedule, weekdays });
  };

  const setTime = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    emitPreset({ ...schedule, hour: h, minute: m });
  };

  const effective = advanced ? advancedParsed : schedule;
  const upcoming = effective ? nextRuns(effective, 3, timeZone, now) : [];
  const summary = advanced
    ? advancedParsed
      ? summarize(advancedParsed)
      : cron && !isCronShaped(cron)
        ? "A cron expression has 5 fields separated by spaces"
        : "Custom schedule"
    : summarize(schedule);

  return (
    <div className="flex flex-col gap-5">
      {!advanced && (
        <>
          <div role="group" aria-label="Frequency" className="flex flex-wrap gap-2">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={schedule.frequency === f.value}
                onClick={() => emitPreset({ ...schedule, frequency: f.value })}
                className={cn("h-10 px-4 pointer-coarse:h-11", toggleClass(schedule.frequency === f.value))}
              >
                {f.label}
              </button>
            ))}
          </div>

          {schedule.frequency === "weekly" && (
            <div className="flex flex-col gap-1.5">
              <span id={`${ids}-days`} className="text-[13px] font-medium text-foreground/80">
                On these days
              </span>
              <div
                role="group"
                aria-labelledby={`${ids}-days`}
                className="flex flex-wrap gap-1.5"
              >
                {WEEKDAY_ORDER.map((d) => {
                  const on = schedule.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={WEEKDAY_NAMES[d]}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "h-11 w-12 rounded-lg border text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        on
                          ? "border-primary bg-primary/16 text-link"
                          : "border-border text-foreground/80 hover:border-muted-foreground/50"
                      )}
                    >
                      {WEEKDAY_NAMES[d].slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            {schedule.frequency === "monthly" && (
              <div className="flex w-48 flex-col gap-1.5">
                <Label htmlFor={`${ids}-dom`} className="text-[13px] text-foreground/80">
                  Day of the month
                </Label>
                <Select
                  value={String(schedule.dayOfMonth)}
                  onValueChange={(v) =>
                    emitPreset({ ...schedule, dayOfMonth: Number(v) })
                  }
                >
                  <SelectTrigger id={`${ids}-dom`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: MAX_DAY_OF_MONTH }, (_, i) => i + 1).map(
                      (n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {schedule.frequency === "hourly" ? (
              <div className="flex w-48 flex-col gap-1.5">
                <Label htmlFor={`${ids}-minute`} className="text-[13px] text-foreground/80">
                  At minute
                </Label>
                <Input
                  id={`${ids}-minute`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  value={schedule.minute}
                  onChange={(e) => {
                    const m = Math.min(59, Math.max(0, Number(e.target.value)));
                    emitPreset({ ...schedule, minute: m });
                  }}
                />
              </div>
            ) : (
              <div className="flex w-48 flex-col gap-1.5">
                <Label htmlFor={`${ids}-time`} className="text-[13px] text-foreground/80">
                  At
                </Label>
                <Input
                  id={`${ids}-time`}
                  type="time"
                  value={`${pad(schedule.hour)}:${pad(schedule.minute)}`}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {advanced && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-cron`} className="text-[13px] text-foreground/80">
            Cron expression (minute hour day month weekday)
          </Label>
          <Input
            id={`${ids}-cron`}
            value={cron}
            onChange={(e) => {
              setCron(e.target.value);
              onChange(e.target.value.trim());
            }}
            placeholder="0 2 * * *"
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
            aria-invalid={cron !== "" && !isCronShaped(cron)}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-4 rounded-lg bg-raised p-4">
        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
          <span className="text-xs text-muted-foreground">Runs</span>
          <span className="text-lg font-semibold" aria-live="polite">
            {summary}
          </span>
          <button
            type="button"
            onClick={toggleAdvanced}
            disabled={advanced && !advancedParsed}
            aria-pressed={advanced}
            title={
              advanced && !advancedParsed
                ? "This cron expression can't be shown as a simple schedule"
                : undefined
            }
            className="mt-1 flex min-h-8 w-fit items-center gap-2 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {advanced ? (
              "Use simple schedule"
            ) : (
              <>
                Advanced (cron)
                <span className="font-mono text-foreground/80">
                  {incomplete(schedule) ? "—" : toCron(schedule)}
                </span>
              </>
            )}
          </button>
        </div>
        <div className="flex flex-[1_1_220px] flex-col gap-1">
          <span className="text-xs text-muted-foreground">Next runs</span>
          {upcoming.length > 0 ? (
            upcoming.map((d) => (
              <span
                key={d.getTime()}
                className="text-sm"
                title={formatExact(d, timeZone)}
              >
                {formatWhen(d, timeZone, now)}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              {advanced ? "Preview not available for custom schedules" : "—"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
