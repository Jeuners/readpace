// Integration test: real headless Chromium against the bundled example.
// Skipped when no browser is available. Needs network for the GSAP CDN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { findChrome } from "../src/browser.js";
import { probe } from "../src/probe.js";
import { DEFAULTS, analyse } from "../src/model.js";

const example = fileURLToPath(new URL("../examples/spf-dmarc/index.html", import.meta.url));
let chrome = null;
try { chrome = findChrome(); } catch (err) {
  // in CI a missing browser must fail, not silently skip the only real measurement
  if (process.env.READPACE_REQUIRE_CHROME) throw err;
}

test("hand-timed example: every scene is too short", { skip: !chrome && "no Chrome found", timeout: 120000 }, async () => {
  const r = analyse(await probe(example, { chromePath: chrome }), DEFAULTS);
  assert.deepEqual(r.scenes.map((s) => s.scene), ["s1_a", "s2_a", "s3_a", "s4_a", "s5_a"]);
  for (const s of r.scenes) assert.ok(s.worstDeficit > 0.5, `${s.scene} should be too short`);

  // typewriter lines only count once complete
  const terminal = r.scenes.find((s) => s.scene === "s4_a");
  const dmarc = terminal.blocks.find((b) => b.text.startsWith("_dmarc"));
  assert.ok(dmarc.start > terminal.start + 2, "DMARC line is typed, not instantly readable");
});

test("nested blocks: each block counts only its own text", { skip: !chrome && "no Chrome found", timeout: 60000 }, async () => {
  const fixture = fileURLToPath(new URL("./fixtures/nested.html", import.meta.url));
  const r = await probe(fixture, { chromePath: chrome });
  assert.deepEqual(Object.values(r.meta).map((m) => m.text).sort(), ["Intro words here", "one two three four five six"]);
});

test("per-character spans (SplitText) are joined into words; <br> separates; aria-hidden is skipped", { skip: !chrome && "no Chrome found", timeout: 60000 }, async () => {
  const fixture = fileURLToPath(new URL("./fixtures/split.html", import.meta.url));
  const r = await probe(fixture, { chromePath: chrome });
  const texts = Object.values(r.meta).map((m) => m.text).sort();
  assert.deepEqual(texts, ["Hello you", "Real", "Use SPF-records and email auth now"]);
});

test("compositions with <video>/<audio> do not hang the probe", { skip: !chrome && "no Chrome found", timeout: 60000 }, async () => {
  const fixture = fileURLToPath(new URL("./fixtures/media.html", import.meta.url));
  const r = await probe(fixture, { chromePath: chrome });
  assert.deepEqual(Object.values(r.meta).map((m) => m.text), ["Video and audio must not block the probe"]);
});

test("compositions that rely on runtime globals (__timelines, getVariables) work", { skip: !chrome && "no Chrome found", timeout: 60000 }, async () => {
  const fixture = fileURLToPath(new URL("./fixtures/no-init.html", import.meta.url));
  const r = await probe(fixture, { chromePath: chrome });
  assert.deepEqual(Object.values(r.meta).map((m) => m.text), ["Defaults come from the declaration"]);
});

test("motion text: typed + blinking cursor, decode, glitch at the exit, content underscores", { skip: !chrome && "no Chrome found", timeout: 60000 }, async () => {
  const fixture = fileURLToPath(new URL("./fixtures/effects.html", import.meta.url));
  const r = await probe(fixture, { chromePath: chrome });
  const text = Object.fromEntries(Object.entries(r.meta).map(([k, m]) => [k, m.text]));
  assert.deepEqual(text, { "#typed": "> Wake up.", "#decode": "Decoded words", "#glitch": "Stable text", "#snake": "snake_case_" });
  const res = analyse(r, DEFAULTS);
  const decode = res.scenes[0].blocks.find((b) => b.block === "#decode");
  assert.ok(decode.start >= 1.9, `decode readable only once decoded, got ${decode.start}`);
});
