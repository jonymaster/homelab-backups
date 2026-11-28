import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatRelative,
  formatSizeChange,
  formatWhen,
} from "./format.ts";

test("formatBytes uses decimal units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(1500), "1.5 KB");
  assert.equal(formatBytes(412_000_000), "412 MB");
  assert.equal(formatBytes(1_200_000_000), "1.2 GB");
  assert.equal(formatBytes(1_800_000_000_000), "1.8 TB");
  assert.equal(formatBytes(null), "—");
});

test("formatSizeChange signs the delta", () => {
  assert.equal(formatSizeChange(1_200_000_000), "+1.2 GB");
  assert.equal(formatSizeChange(0), "+0 B");
  assert.equal(formatSizeChange(-40_000_000), "-40 MB");
  assert.equal(formatSizeChange(undefined), "—");
});

test("formatDuration", () => {
  assert.equal(formatDuration(0.03), "<1s");
  assert.equal(formatDuration(2), "2s");
  assert.equal(formatDuration(245), "4m 05s");
  assert.equal(formatDuration(3720), "1h 02m");
  assert.equal(formatDuration(null), "—");
});

test("formatPercent never shows 100% with failures", () => {
  assert.equal(formatPercent(1), "100%");
  assert.equal(formatPercent(0.986), "98.6%");
  assert.equal(formatPercent(0.9999), "99.9%");
  assert.equal(formatPercent(0), "0%");
});

test("formatRelative", () => {
  const now = new Date("2026-11-28T17:58:00Z");
  const at = (s: number) => new Date(now.getTime() + s * 1000);
  assert.equal(formatRelative(at(-10), now), "just now");
  assert.equal(formatRelative(at(32 * 60), now), "in 32 min");
  assert.equal(formatRelative(at(-3 * 3600), now), "3h ago");
  assert.equal(formatRelative(at(-86400), now), "1 day ago");
  assert.equal(formatRelative(at(3 * 86400), now), "in 3 days");
});

test("formatWhen names nearby days in the given zone", () => {
  const now = new Date("2026-11-28T16:58:00Z");
  const zone = "Europe/Paris";
  assert.equal(formatWhen(new Date("2026-11-28T17:30:00Z"), zone, now), "Today 18:30");
  assert.equal(formatWhen(new Date("2026-11-27T17:34:00Z"), zone, now), "Yesterday 18:34");
  assert.equal(formatWhen(new Date("2026-11-29T02:00:00Z"), zone, now), "Tomorrow 03:00");
  assert.equal(formatWhen(new Date("2026-11-14T17:30:00Z"), zone, now), "Nov 14 18:30");
});
