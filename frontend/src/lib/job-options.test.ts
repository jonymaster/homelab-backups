import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyCronAt,
  isHttpUrl,
  notifySummary,
  parsePatterns,
  retentionFromKey,
  retentionKey,
  retentionLabel,
  retentionSummary,
  sameSet,
} from "./job-options.ts";

test("retention labels map preset days", () => {
  assert.equal(retentionLabel(7), "7 days");
  assert.equal(retentionLabel(90), "3 months");
  assert.equal(retentionLabel(180), "6 months");
  assert.equal(retentionLabel(365), "1 year");
  assert.equal(retentionLabel(null), "Forever");
  assert.equal(retentionLabel(45), "45 days");
  assert.equal(retentionLabel(1), "1 day");
});

test("retention summary reads as a sentence", () => {
  assert.equal(retentionSummary(180), "Keeps 6 months");
  assert.equal(retentionSummary(null), "Keeps every snapshot");
});

test("retention select keys round-trip", () => {
  for (const days of [7, 30, 90, 180, 365, 45, null]) {
    assert.equal(retentionFromKey(retentionKey(days)), days);
  }
  assert.equal(retentionFromKey("0"), null);
  assert.equal(retentionFromKey("abc"), null);
});

test("notify summary", () => {
  assert.equal(notifySummary("default"), "Notifications: defaults");
  assert.equal(notifySummary("never"), "Notifications: off");
});

test("parsePatterns trims, drops blanks and duplicates", () => {
  assert.deepEqual(parsePatterns(" **/*.log \n\n**/tmp\r\n**/*.log\n"), [
    "**/*.log",
    "**/tmp",
  ]);
  assert.deepEqual(parsePatterns(""), []);
});

test("dailyCronAt builds a daily cron", () => {
  assert.equal(dailyCronAt("02:00"), "0 2 * * *");
  assert.equal(dailyCronAt("23:45"), "45 23 * * *");
  assert.equal(dailyCronAt("7:05"), "5 7 * * *");
  assert.equal(dailyCronAt("24:00"), null);
  assert.equal(dailyCronAt("noon"), null);
});

test("isHttpUrl", () => {
  assert.equal(isHttpUrl("http://192.168.1.10:3000"), true);
  assert.equal(isHttpUrl("https://backups.lan"), true);
  assert.equal(isHttpUrl("ftp://x"), false);
  assert.equal(isHttpUrl("backups.lan"), false);
});

test("sameSet ignores order", () => {
  assert.equal(sameSet(["a", "b"], ["b", "a"]), true);
  assert.equal(sameSet(["a"], ["a", "b"]), false);
});
