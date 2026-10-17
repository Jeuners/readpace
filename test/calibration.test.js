import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addRecords, ageDays, loadSummary, summarize } from "../src/calibration.js";
import { calibrationPlan } from "../src/calibrate-server.js";

const rec = (measured, predicted, factor = 1) => ({
  scene: "s", factor, measured, predicted, predictedUnfactored: predicted / factor,
});

test("k is the median ratio of measured to model time", () => {
  const s = summarize([rec(6, 5), rec(12, 10), rec(30, 10)]);
  assert.equal(s.k, 1.2);
  assert.equal(s.n, 3);
  assert.deepEqual(s.iqr, [1.2, 2.1]);
});

test("repeat scenes yield kRepeat relative to k", () => {
  // first viewing at k = 1.2; repeats measured at 0.6 of the unfactored model
  const s = summarize([rec(6, 5), rec(12, 10), rec(3, 2.5, 0.5)]);
  assert.equal(s.kRepeat, 0.5);
  assert.equal(s.nRepeat, 1);
});

test("no first-viewing data → empty summary", () => {
  assert.deepEqual(summarize([rec(3, 2.5, 0.5)]), {});
});

test("addRecords appends and persists; loadSummary reads it back", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "readpace-")), "cal.json");
  addRecords("demo", [rec(6, 5)], file);
  const summary = addRecords("demo", [rec(12, 10)], file);
  assert.equal(summary.n, 2);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).records.length, 2);
  assert.equal(loadSummary(file).k, 1.2);
});

test("ageDays counts whole days since the last update", () => {
  assert.equal(ageDays({ updated: "2026-01-01" }, new Date("2026-01-31T12:00:00")), 30);
});

test("calibration plan skips hold scenes and pauses before the exit", () => {
  const p = calibrationPlan({
    scenes: [
      { scene: "s1", start: 0, end: 6, timing: null, factor: 1, firstReady: 0.6, readTime: 4 },
      { scene: "end", start: 6, end: 20, timing: "hold", factor: 1, firstReady: 6.5, readTime: 2 },
      { scene: "s1b", start: 20, end: 24, timing: null, factor: 0.6, firstReady: 20.5, readTime: 2.4 },
    ],
  });
  assert.deepEqual(p.scenes.map((s) => s.scene), ["s1", "s1b"]);
  assert.equal(p.scenes[0].holdAt, 5.5);
  assert.equal(p.scenes[1].readTimeUnfactored, 4);
});
