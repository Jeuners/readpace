import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyse, blockCost, readyWindow } from "../src/model.js";

const meta = (over = {}) => ({
  scene: "s1", sceneStart: 0, sceneEnd: 10, timing: null, factor: 1, fontPx: 40, mono: false, text: "", ...over,
});

/** Build a probe result: blocks = [{key, text, from, to, ...meta}] sampled at 0.1 s. */
function fakeProbe(blocks, total = 10, step = 0.1) {
  const out = { total, step, meta: {}, samples: {} };
  for (const b of blocks) {
    out.meta[b.key] = meta({ ...b, text: b.text });
    out.samples[b.key] = [];
    for (let i = 0; i <= Math.round(total / step); i++) {
      const t = +(i * step).toFixed(3);
      out.samples[b.key].push([t, t >= b.from && t < b.to ? 1 : 0, b.text]);
    }
  }
  return out;
}

test("body text costs words / wps plus the per-block overhead", () => {
  const c = blockCost(meta({ text: "one two three four five six" }));
  assert.equal(c, 6 / DEFAULTS.wps + DEFAULTS.perBlock);
});

test("headlines read faster than body text", () => {
  const text = "one two three four five six seven";
  assert.ok(blockCost(meta({ text, fontPx: 120 })) < blockCost(meta({ text, fontPx: 40 })));
});

test("monospace costs characters, not words; spaces are free", () => {
  const c = blockCost(meta({ text: "v=spf1 -all", mono: true }));
  assert.equal(c, 10 / DEFAULTS.cpsMono + DEFAULTS.perBlock);
});

test("short blocks cost at least minBlock", () => {
  assert.equal(blockCost(meta({ text: "#", mono: true })), DEFAULTS.minBlock);
});

test("reading factor and calibration k scale the cost", () => {
  const base = blockCost(meta({ text: "one two three four five six" }));
  assert.equal(blockCost(meta({ text: "one two three four five six", factor: 0.5 })), base * 0.5);
  assert.equal(blockCost(meta({ text: "one two three four five six" }), { ...DEFAULTS, k: 2 }), base * 2);
});

test("readyWindow waits for the final text (typewriter)", () => {
  const samples = [[0, 1, ""], [0.1, 1, "Hel"], [0.2, 1, "Hello!"], [0.3, 1, "Hello!"], [0.4, 0, "Hello!"]];
  assert.deepEqual(readyWindow(samples, "Hello!", 0.1), [0.2, 0.4]);
});

test("readyWindow returns null when never complete and visible", () => {
  assert.equal(readyWindow([[0, 0, "Hello"], [0.1, 1, "He"]], "Hello", 0.1), null);
});

test("scrambled text of full length is not readable until decoded", () => {
  const s = [[0, 1, "x#9k"], [0.1, 1, "Wa#k"], [0.2, 1, "Wake"], [0.3, 1, "Wake"], [0.4, 0, "Wake"]];
  assert.deepEqual(readyWindow(s, "Wake", 0.1), [0.2, 0.4]);
});

test("flicker: the longest stable window wins over an early blip", () => {
  const s = [[0, 1, "ONLINE"], [0.1, 1, "DOWN"], [0.2, 1, "ONLINE"], [0.3, 1, "DOWN"], [0.4, 1, "DOWN"], [0.5, 1, "DOWN"]];
  assert.deepEqual(readyWindow(s, "DOWN", 0.1), [0.3, 0.6]);
});

test("a long-enough scene has no errors, only an idle hint", () => {
  const p = fakeProbe([{ key: "#a", text: "one two three", from: 0.5, to: 9 }]);
  const r = analyse(p);
  assert.equal(r.findings.length, 1); // idle hint only
  assert.equal(r.findings[0].level, "hint");
  assert.equal(r.scenes[0].worstDeficit, 0);
  assert.equal(r.scenes[0].idle, 6.95); // 9 − (0.5 + 0.4 orient + 1.15 read)
});

test("too-short scene: deficit, overrun and an error finding", () => {
  // 30 words = 10 s of reading, visible for 3 s
  const text = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
  const r = analyse(fakeProbe([{ key: "#a", text, from: 1, to: 4 }]));
  const s = r.scenes[0];
  assert.equal(r.findings[0].level, "error");
  assert.ok(s.worstDeficit > 6.5 && s.worstDeficit < 8);
  assert.ok(Math.abs(s.overrun - s.worstDeficit) < 0.01); // single block: identical
});

test("overrun exceeds the deficit when an abandoned block frees the viewer", () => {
  const long = Array.from({ length: 15 }, (_, i) => `w${i}`).join(" "); // ~5 s
  const r = analyse(fakeProbe([
    { key: "#a", text: long, from: 1, to: 4 },
    { key: "#b", text: long, from: 1.5, to: 4 },
  ]));
  const s = r.scenes[0];
  assert.ok(s.overrun > s.worstDeficit, `${s.overrun} > ${s.worstDeficit}`);
});

test("data-timing=hold suppresses the idle hint", () => {
  const r = analyse(fakeProbe([{ key: "#a", text: "end card", from: 0.5, to: 9, timing: "hold" }]));
  assert.equal(r.findings.length, 0);
});

test("blocks that never become readable are reported", () => {
  const r = analyse(fakeProbe([{ key: "#ghost", text: "hidden", from: 99, to: 100 }]));
  assert.equal(r.scenes.length, 0);
  assert.match(r.findings[0].message, /never fully readable/);
});

test("contractions count as one word; stray dashes and ellipses are free", () => {
  const a = blockCost(meta({ text: "don't it’s — ... -" }));
  assert.equal(a, Math.max(DEFAULTS.minBlock, 2 / DEFAULTS.wps + DEFAULTS.perBlock));
});

