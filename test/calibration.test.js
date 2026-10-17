import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addRecords, ageDays, loadSummary, summarize } from "../src/calibration.js";
import { calibrationPlan, toRecords } from "../src/calibrate-server.js";

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

test("calibration plan skips hold scenes and holds before the first block leaves", () => {
  const sc = (scene, start, timing, factor, blocks) =>
    ({ scene, start, timing, factor, firstReady: blocks[0].start, readTime: 3, orient: 0.4, blocks });
  const p = calibrationPlan({
    scenes: [
      sc("s1", 0, null, 1, [{ start: 0.6, end: 5.6, cost: 2 }, { start: 1, end: 5.8, cost: 1 }]),
      sc("end", 6, "hold", 1, [{ start: 6.5, end: 20, cost: 1 }]),
    ],
  });
  assert.deepEqual(p.scenes.map((s) => s.scene), ["s1"]);
  assert.equal(p.scenes[0].holdAt, 5.5);
  assert.match(p.token, /^[0-9a-f]{32}$/);
});

test("k is solved from the simulation, so waiting for entrances does not bias it", () => {
  // block 2 appears at t=5; a viewer twice as slow as the model finishes at 5 + 2*1 = 7
  const plan = { scenes: [{ scene: "s", factor: 1, readTime: 6, orient: 0,
    blocks: [{ start: 0, cost: 1 }, { start: 5, cost: 1 }] }] };
  const [rec] = toRecords(plan, [{ scene: "s", measured: 7 }]);
  assert.ok(Math.abs(rec.kScene - 2) < 0.01, `kScene ${rec.kScene}`);  // naive 7/6 would say 1.17
});

test("repeat scenes are solved against the unfactored model", () => {
  const plan = { scenes: [{ scene: "r", factor: 0.5, readTime: 1, orient: 0, blocks: [{ start: 0, cost: 1 }] }] };
  const [rec] = toRecords(plan, [{ scene: "r", measured: 1.2 }]);
  assert.ok(Math.abs(rec.fScene - 0.6) < 0.01);  // unfactored cost 2 → 1.2 s is 0.6
});
