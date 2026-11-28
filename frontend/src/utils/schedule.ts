import { formatClockTime, type Clock } from "../lib/format.ts";

export type Frequency = "hourly" | "daily" | "weekly" | "monthly";

export interface Schedule {
  frequency: Frequency;
  /** 0-59 */
  minute: number;
  /** 0-23, ignored for hourly */
  hour: number;
  /** 0 (Sunday) to 6 (Saturday), used by weekly */
  weekdays: number[];
  /** 1-28, used by monthly */
  dayOfMonth: number;
}

export const DEFAULT_SCHEDULE: Schedule = {
  frequency: "daily",
  minute: 0,
  hour: 2,
  weekdays: [1],
  dayOfMonth: 1,
};

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Capped at 28 so a monthly backup never silently skips short months.
export const MAX_DAY_OF_MONTH = 28;

const pad = (n: number) => String(n).padStart(2, "0");

const inRange = (n: number, min: number, max: number) =>
  Number.isInteger(n) && n >= min && n <= max;

const uniqueSorted = (days: number[]) =>
  [...new Set(days)].sort((a, b) => a - b);

export function toCron(s: Schedule): string {
  switch (s.frequency) {
    case "hourly":
      return `${s.minute} * * * *`;
    case "daily":
      return `${s.minute} ${s.hour} * * *`;
    case "weekly":
      return `${s.minute} ${s.hour} * * ${uniqueSorted(s.weekdays).join(",")}`;
    case "monthly":
      return `${s.minute} ${s.hour} ${s.dayOfMonth} * *`;
  }
}

const parseNumber = (field: string): number | null =>
  /^\d{1,2}$/.test(field) ? Number(field) : null;

/** Accepts "1", "1,3", "1-5" and "1-3,5"; Sunday may be 0 or 7. */
function parseWeekdays(field: string): number[] | null {
  const days: number[] = [];
  for (const part of field.split(",")) {
    const range = /^(\d)-(\d)$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to) return null;
      for (let d = from; d <= to; d++) days.push(d);
    } else {
      const d = parseNumber(part);
      if (d === null) return null;
      days.push(d);
    }
  }
  if (!days.every((d) => inRange(d, 0, 7))) return null;
  return uniqueSorted(days.map((d) => d % 7));
}

/** Returns the matching preset, or null when the cron needs advanced mode. */
export function parseCron(cron: string): Schedule | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minF, hourF, domF, monF, dowF] = fields;
  if (monF !== "*") return null;

  const minute = parseNumber(minF);
  if (minute === null || !inRange(minute, 0, 59)) return null;

  if (hourF === "*") {
    if (domF !== "*" || dowF !== "*") return null;
    return { ...DEFAULT_SCHEDULE, frequency: "hourly", minute };
  }

  const hour = parseNumber(hourF);
  if (hour === null || !inRange(hour, 0, 23)) return null;

  if (domF === "*" && dowF === "*") {
    return { ...DEFAULT_SCHEDULE, frequency: "daily", minute, hour };
  }
  if (domF === "*") {
    const weekdays = parseWeekdays(dowF);
    if (!weekdays || weekdays.length === 0) return null;
    return { ...DEFAULT_SCHEDULE, frequency: "weekly", minute, hour, weekdays };
  }
  if (dowF === "*") {
    const dayOfMonth = parseNumber(domF);
    if (dayOfMonth === null || !inRange(dayOfMonth, 1, MAX_DAY_OF_MONTH)) {
      return null;
    }
    return {
      ...DEFAULT_SCHEDULE,
      frequency: "monthly",
      minute,
      hour,
      dayOfMonth,
    };
  }
  return null;
}

/** Structural check for the advanced field; the backend validates fully. */
export function isCronShaped(cron: string): boolean {
  return /^\S+(\s+\S+){4}$/.test(cron.trim());
}

const ordinal = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function summarize(s: Schedule, clock: Clock = "24h"): string {
  const time = formatClockTime(s.hour, s.minute, clock);
  switch (s.frequency) {
    case "hourly":
      return s.minute === 0
        ? "Every hour, on the hour"
        : `Every hour at minute ${pad(s.minute)}`;
    case "daily":
      return `Every day at ${time}`;
    case "weekly": {
      const days = uniqueSorted(s.weekdays);
      if (days.length === 0) return "Pick at least one day";
      if (days.length === 7) return `Every day at ${time}`;
      const names = days.map((d) => WEEKDAY_NAMES[d].slice(0, 3));
      return `Every ${joinList(names)} at ${time}`;
    }
    case "monthly":
      return `On the ${ordinal(s.dayOfMonth)} of every month at ${time}`;
  }
}

/** Summary for any cron string; unrecognised patterns read as "Custom schedule". */
export function describeCron(cron: string, clock: Clock = "24h"): string {
  const parsed = parseCron(cron);
  return parsed ? summarize(parsed, clock) : "Custom schedule";
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function wallClock(date: Date, timeZone?: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

const utcOf = (w: WallClock) =>
  Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);

/** The instant at which the wall clock in `timeZone` reads `w`. */
function instantOf(w: WallClock, timeZone?: string): Date {
  const guess = utcOf(w);
  const offsetAt = (t: number) =>
    utcOf(wallClock(new Date(t), timeZone)) - Math.floor(t / 60000) * 60000;
  const first = guess - offsetAt(guess);
  // A second pass corrects guesses that land across a DST change.
  return new Date(guess - offsetAt(first));
}

/** Upcoming run times for a preset, evaluated in the server time zone. */
export function nextRuns(
  s: Schedule,
  count: number,
  timeZone?: string,
  now: Date = new Date()
): Date[] {
  if (s.frequency === "weekly" && s.weekdays.length === 0) return [];
  const today = wallClock(now, timeZone);
  const runs: Date[] = [];
  for (let offset = 0; offset < 400 && runs.length < count; offset++) {
    const day = new Date(
      Date.UTC(today.year, today.month - 1, today.day + offset)
    );
    const matches =
      s.frequency === "hourly" ||
      s.frequency === "daily" ||
      (s.frequency === "weekly" && s.weekdays.includes(day.getUTCDay())) ||
      (s.frequency === "monthly" && day.getUTCDate() === s.dayOfMonth);
    if (!matches) continue;
    const hours =
      s.frequency === "hourly"
        ? Array.from({ length: 24 }, (_, h) => h)
        : [s.hour];
    for (const hour of hours) {
      const at = instantOf(
        {
          year: day.getUTCFullYear(),
          month: day.getUTCMonth() + 1,
          day: day.getUTCDate(),
          hour,
          minute: s.minute,
        },
        timeZone
      );
      if (at > now) runs.push(at);
      if (runs.length === count) break;
    }
  }
  return runs;
}
