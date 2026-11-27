"use client";

import { useState } from "react";
import {
  DEFAULT_SCHEDULE,
  Frequency,
  MAX_DAY_OF_MONTH,
  Schedule,
  WEEKDAY_NAMES,
  isCronShaped,
  parseCron,
  summarize,
  toCron,
} from "@/utils/schedule";

interface ScheduleFieldProps {
  /** Initial cron; later changes are reported through onChange only. */
  initialCron?: string;
  /** Emits the cron string, or "" while the selection is incomplete. */
  onChange: (cron: string) => void;
}

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

// Monday first reads more naturally than the cron order.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const inputClass =
  "mt-1 block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100";

const pad = (n: number) => String(n).padStart(2, "0");

export default function ScheduleField({
  initialCron,
  onChange,
}: ScheduleFieldProps) {
  const initialPreset = initialCron ? parseCron(initialCron) : DEFAULT_SCHEDULE;
  const [schedule, setSchedule] = useState<Schedule>(
    initialPreset ?? DEFAULT_SCHEDULE
  );
  const [advanced, setAdvanced] = useState(initialPreset === null);
  const [cron, setCron] = useState(initialCron ?? toCron(DEFAULT_SCHEDULE));

  const emitPreset = (next: Schedule) => {
    setSchedule(next);
    onChange(
      next.frequency === "weekly" && next.weekdays.length === 0
        ? ""
        : toCron(next)
    );
  };

  const toggleAdvanced = () => {
    if (!advanced) {
      const current =
        schedule.frequency === "weekly" && schedule.weekdays.length === 0
          ? ""
          : toCron(schedule);
      setCron(current);
      onChange(current);
      setAdvanced(true);
      return;
    }
    const preset = parseCron(cron);
    if (!preset) return;
    setAdvanced(false);
    emitPreset(preset);
  };

  const canLeaveAdvanced = parseCron(cron) !== null;
  const advancedParsed = parseCron(cron);

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

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between">
        <legend className="block text-sm font-medium text-gray-300">
          Schedule
        </legend>
        <button
          type="button"
          onClick={toggleAdvanced}
          disabled={advanced && !canLeaveAdvanced}
          aria-pressed={advanced}
          title={
            advanced && !canLeaveAdvanced
              ? "This cron expression can't be shown as a simple schedule"
              : undefined
          }
          className="text-sm text-blue-400 hover:text-blue-300 disabled:cursor-not-allowed disabled:text-gray-500"
        >
          {advanced ? "Use simple schedule" : "Advanced (cron)"}
        </button>
      </div>

      {advanced ? (
        <div>
          <label
            htmlFor="schedule-cron"
            className="block text-sm text-gray-400"
          >
            Cron expression (minute hour day month weekday)
          </label>
          <input
            id="schedule-cron"
            type="text"
            value={cron}
            onChange={(e) => {
              setCron(e.target.value);
              onChange(e.target.value.trim());
            }}
            placeholder="0 2 * * *"
            spellCheck={false}
            className={`${inputClass} font-mono`}
            aria-invalid={cron !== "" && !isCronShaped(cron)}
          />
          <p className="mt-2 text-sm text-gray-400">
            {advancedParsed
              ? summarize(advancedParsed)
              : cron && !isCronShaped(cron)
              ? "A cron expression has 5 fields separated by spaces"
              : "Custom schedule"}
          </p>
        </div>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="Frequency"
            className="grid grid-cols-4 gap-1 rounded-md bg-gray-900/60 p-1"
          >
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={schedule.frequency === f.value}
                onClick={() => emitPreset({ ...schedule, frequency: f.value })}
                className={`rounded px-2 py-1.5 text-sm ${
                  schedule.frequency === f.value
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {schedule.frequency === "weekly" && (
            <div
              role="group"
              aria-label="Days of the week"
              className="flex flex-wrap gap-1"
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
                    className={`h-9 w-11 rounded-md text-sm ${
                      on
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {WEEKDAY_NAMES[d].slice(0, 3)}
                  </button>
                );
              })}
            </div>
          )}

          {schedule.frequency === "monthly" && (
            <div>
              <label
                htmlFor="schedule-dom"
                className="block text-sm text-gray-400"
              >
                Day of the month
              </label>
              <select
                id="schedule-dom"
                value={schedule.dayOfMonth}
                onChange={(e) =>
                  emitPreset({ ...schedule, dayOfMonth: Number(e.target.value) })
                }
                className={inputClass}
              >
                {Array.from({ length: MAX_DAY_OF_MONTH }, (_, i) => i + 1).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  )
                )}
              </select>
            </div>
          )}

          {schedule.frequency === "hourly" ? (
            <div>
              <label
                htmlFor="schedule-minute"
                className="block text-sm text-gray-400"
              >
                At minute
              </label>
              <input
                id="schedule-minute"
                type="number"
                min={0}
                max={59}
                value={schedule.minute}
                onChange={(e) => {
                  const m = Math.min(59, Math.max(0, Number(e.target.value)));
                  emitPreset({ ...schedule, minute: m });
                }}
                className={inputClass}
              />
            </div>
          ) : (
            <div>
              <label
                htmlFor="schedule-time"
                className="block text-sm text-gray-400"
              >
                Time
              </label>
              <input
                id="schedule-time"
                type="time"
                value={`${pad(schedule.hour)}:${pad(schedule.minute)}`}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          <p className="text-sm text-gray-400" aria-live="polite">
            {summarize(schedule)}
          </p>
        </>
      )}
    </fieldset>
  );
}
