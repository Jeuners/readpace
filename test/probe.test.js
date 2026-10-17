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
try { chrome = findChrome(); } catch { /* skip */ }

test("hand-timed example: every scene is too short", { skip: !chrome && "no Chrome found", timeout: 120000 }, async () => {
  const r = analyse(await probe(example, { chromePath: chrome }), DEFAULTS);
  assert.deepEqual(r.scenes.map((s) => s.scene), ["s1_a", "s2_a", "s3_a", "s4_a", "s5_a"]);
  for (const s of r.scenes) assert.ok(s.worstDeficit > 0.5, `${s.scene} should be too short`);

  // typewriter lines only count once complete
  const terminal = r.scenes.find((s) => s.scene === "s4_a");
  const dmarc = terminal.blocks.find((b) => b.text.startsWith("_dmarc"));
  assert.ok(dmarc.start > terminal.start + 2, "DMARC line is typed, not instantly readable");
});
