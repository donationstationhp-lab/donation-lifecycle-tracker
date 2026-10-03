import assert from "node:assert/strict";
import test from "node:test";
import {
  digitalRoot, fractionCalendar, stageForDate, isAligned,
  STAGE_NAMES, PURPOSE_NAMES, STAGE_TO_POSITIONS, whenWindows, whenAllStages,
} from "./conScire";

test("digital roots sum digits to a position from 1 to 9", () => {
  for (const [input, expected] of [[1, 1], [9, 9], [10, 1], [29, 2], [999, 9], [12345, 6]]) {
    assert.equal(digitalRoot(input), expected);
  }
  for (const invalid of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => digitalRoot(invalid), RangeError);
  }
});

test("fraction calendar and secondary convergence use UTC month and day", () => {
  const date = new Date("2026-09-03T23:59:00Z");
  assert.deepEqual(fractionCalendar(date), { attention: 9, intention: 3, purpose: 3 });
  assert.equal(isAligned(date), true);
  assert.equal(isAligned(new Date("2026-01-01T00:00:00Z")), false);
  assert.throws(() => fractionCalendar(new Date("invalid")), RangeError);
});

test("self-determination stages cycle and reset at the year boundary, including leap years", () => {
  for (const [date, stage] of [
    ["2026-01-01", 1], ["2026-01-16", 16], ["2026-01-17", 1],
    ["2024-02-29", 12], ["2024-03-01", 13], ["2025-03-01", 12],
    ["2026-12-31", 13], ["2027-01-01", 1],
  ] as const) {
    assert.equal(stageForDate(new Date(`${date}T12:00:00Z`)), stage, date);
  }
  assert.equal(Object.keys(STAGE_NAMES).length, 16);
  assert.equal(Object.keys(PURPOSE_NAMES).length, 9);
});

test("windows include start day, exact metadata, and only governing purpose positions", () => {
  const start = new Date("2026-09-03T14:30:00Z");
  const before = start.toISOString();
  const windows = whenWindows("storage", start, 1);
  assert.deepEqual(windows, [{
    date: "2026-09-03", purposePosition: 3, purposeName: "Understanding",
    stage: 6, stageName: "Threshold", stageEtymology: "to cross over",
    aligned: true, convergence: 6,
  }]);
  assert.equal(start.toISOString(), before);
  const all = whenAllStages(start, 90);
  assert.deepEqual(Object.keys(all), Object.keys(STAGE_TO_POSITIONS));
  for (const [stage, entries] of Object.entries(all)) {
    assert.deepEqual(entries, whenWindows(stage, start, 90));
    for (const entry of entries) {
      assert.ok(STAGE_TO_POSITIONS[stage].includes(entry.purposePosition));
      assert.equal(entry.aligned, entry.convergence === 6);
      assert.equal(entry.stageName, STAGE_NAMES[entry.stage].name);
    }
  }
  assert.deepEqual(all.scheduled, all.distributed);
});

test("window scan handles month/year rollover and unknown stages without mutating input", () => {
  const start = new Date("2026-12-31T23:59:00Z");
  const dates = Object.values(whenAllStages(start, 3))
    .flat().map((window) => window.date);
  assert.deepEqual([...new Set(dates)].sort(), ["2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.deepEqual(whenWindows("unknown", start, 30), []);
  assert.deepEqual(whenWindows("constructor", start, 30), []);
  assert.deepEqual(whenWindows("intake", start, 0), []);
  assert.throws(() => whenWindows("intake", start, -1), RangeError);
});