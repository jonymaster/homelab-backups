import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCHEDULE, nextRuns, parseCron, toCron } from "./schedule.ts";

test("toCron and parseCron round-trip a weekly preset", () => {
  const weekly = { ...DEFAULT_SCHEDULE, frequency: "weekly" as const, weekdays: [1, 4] };
  assert.equal(toCron(weekly), "0 2 * * 1,4");
  assert.deepEqual(parseCron("0 2 * * 1,4"), weekly);
});

test("nextRuns uses the server time zone", () => {
  const now = new Date("2026-11-28T16:58:00Z"); // 17:58 in Paris
  const daily = { ...DEFAULT_SCHEDULE, hour: 18, minute: 30 };
  const runs = nextRuns(daily, 2, "Europe/Paris", now);
  assert.deepEqual(
    runs.map((d) => d.toISOString()),
    ["2026-11-28T17:30:00.000Z", "2026-11-29T17:30:00.000Z"]
  );
});

test("nextRuns handles hourly, weekly and DST", () => {
  const now = new Date("2026-03-28T22:10:00Z"); // Sat 23:10 in Paris, DST starts Sunday
  const hourly = { ...DEFAULT_SCHEDULE, frequency: "hourly" as const, minute: 0 };
  assert.deepEqual(
    nextRuns(hourly, 2, "Europe/Paris", now).map((d) => d.toISOString()),
    ["2026-03-28T23:00:00.000Z", "2026-03-29T00:00:00.000Z"]
  );
  const sunday = { ...DEFAULT_SCHEDULE, frequency: "weekly" as const, weekdays: [0], hour: 4 };
  assert.deepEqual(
    nextRuns(sunday, 1, "Europe/Paris", now).map((d) => d.toISOString()),
    ["2026-03-29T02:00:00.000Z"]
  );
  assert.deepEqual(nextRuns({ ...sunday, weekdays: [] }, 3, "Europe/Paris", now), []);
});
