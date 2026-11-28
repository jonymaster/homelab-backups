export const EMPTY = "—";

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** Decimal units, like `df -H` and disk vendors. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return EMPTY;
  }
  const sign = bytes < 0 ? "-" : "";
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const text = value.toFixed(digits).replace(/\.0$/, "");
  return `${sign}${text} ${UNITS[unit]}`;
}

/** Size delta with an explicit sign: "+1.2 GB", "-40 MB", "+0 B". */
export function formatSizeChange(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return EMPTY;
  }
  return bytes < 0 ? formatBytes(bytes) : `+${formatBytes(bytes)}`;
}

/** "2s", "4m 05s", "1h 02m". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return EMPTY;
  }
  if (seconds > 0 && seconds < 1) return "<1s";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY;
  return n.toLocaleString("en-US");
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) {
    return EMPTY;
  }
  const pct = Math.round(ratio * 1000) / 10;
  // Never round a job with failures up to a perfect score.
  return `${pct === 100 && ratio < 1 ? 99.9 : pct}%`;
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/** "just now", "3h ago", "in 32 min", "in 2 days". */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diff);
  const future = diff > 0;
  let text: string;
  if (abs < 45) return future ? "in a few seconds" : "just now";
  if (abs < HOUR) text = `${Math.max(1, Math.round(abs / MINUTE))} min`;
  else if (abs < DAY) text = `${Math.round(abs / HOUR)}h`;
  else {
    const days = Math.round(abs / DAY);
    text = days === 1 ? "1 day" : `${days} days`;
  }
  return future ? `in ${text}` : `${text} ago`;
}

/** Calendar date key (YYYY-MM-DD) of an instant in a time zone. */
export function dayKey(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const time = (date: Date, timeZone?: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

/** "Today 18:30", "Yesterday 18:34", "Tomorrow 03:00", "Thu 02:00", "Nov 14 18:30". */
export function formatWhen(
  date: Date,
  timeZone?: string,
  now: Date = new Date()
): string {
  const key = dayKey(date, timeZone);
  const offsetKey = (days: number) =>
    dayKey(new Date(now.getTime() + days * DAY * 1000), timeZone);
  const t = time(date, timeZone);
  if (key === offsetKey(0)) return `Today ${t}`;
  if (key === offsetKey(-1)) return `Yesterday ${t}`;
  if (key === offsetKey(1)) return `Tomorrow ${t}`;
  const ahead = date.getTime() - now.getTime();
  if (ahead > 0 && ahead < 6 * DAY * 1000) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(date);
    return `${weekday} ${t}`;
  }
  const sameYear = key.slice(0, 4) === offsetKey(0).slice(0, 4);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(date);
  return `${day} ${t}`;
}

/** Full timestamp for tooltips: "Fri, 28 Nov 2026, 18:30:05 (Europe/Paris)". */
export function formatExact(date: Date, timeZone?: string): string {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
  return timeZone ? `${text} (${timeZone})` : text;
}

/** "Nov 14" for chart and calendar axes. */
export function formatShortDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Returns the zone when the runtime knows it, so bad values never throw later. */
export function validTimeZone(zone: string | undefined): string | undefined {
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}
