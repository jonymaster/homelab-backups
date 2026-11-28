import type { NotifyMode } from "./api.ts";

export const RETENTION_CHOICES: { days: number | null; label: string }[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: null, label: "Forever" },
];

/** Select values are strings; "forever" stands for null. */
export const retentionKey = (days: number | null): string =>
  days === null ? "forever" : String(days);

export function retentionFromKey(key: string): number | null {
  if (key === "forever") return null;
  const days = Number(key);
  return Number.isInteger(days) && days >= 1 ? days : null;
}

/** "6 months", "Forever", or "45 days" for values set outside the presets. */
export function retentionLabel(days: number | null): string {
  const choice = RETENTION_CHOICES.find((c) => c.days === days);
  if (choice) return choice.label;
  return days === 1 ? "1 day" : `${days} days`;
}

/** "Keeps 6 months", "Keeps every snapshot". */
export function retentionSummary(days: number | null): string {
  return days === null
    ? "Keeps every snapshot"
    : `Keeps ${retentionLabel(days)}`;
}

export const NOTIFY_MODES: {
  value: NotifyMode;
  label: string;
  description: string;
}[] = [
  {
    value: "default",
    label: "Use defaults",
    description: "Follows the events turned on in Settings.",
  },
  {
    value: "always",
    label: "Always",
    description: "Sends every event for this job, including each success.",
  },
  {
    value: "never",
    label: "Never",
    description: "This job never sends notifications.",
  },
];

export function notifySummary(mode: NotifyMode): string {
  switch (mode) {
    case "default":
      return "Notifications: defaults";
    case "always":
      return "Notifications: every run";
    case "never":
      return "Notifications: off";
  }
}

/** One pattern per line; blank lines and duplicates are dropped. */
export function parsePatterns(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const pattern = line.trim();
    if (pattern) seen.add(pattern);
  }
  return [...seen];
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" → daily cron at that time, or null when the time is malformed. */
export function dailyCronAt(time: string): string | null {
  const match = TIME.exec(time.trim());
  if (!match) return null;
  return `${Number(match[2])} ${Number(match[1])} * * *`;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Order-insensitive equality for preset id lists. */
export function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}
