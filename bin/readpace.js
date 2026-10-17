#!/usr/bin/env node
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { exec } from "node:child_process";
import { DEFAULTS, analyse } from "../src/model.js";
import { probe } from "../src/probe.js";
import { apply, changed, plan } from "../src/fit.js";
import { calibrationPath, isStale, loadSummary, modelMismatch } from "../src/calibration.js";
import { calibrationPlan, serveCalibration } from "../src/calibrate-server.js";
import { calibrationLine, formatCheck, formatPlan } from "../src/report.js";

const HELP = `readpace — measured slide timing for HyperFrames compositions

Usage
  readpace check [dir]        Is every slide readable long enough?
  readpace fit [dir]          Re-time scenes from measured reading demand (dry run)
  readpace fit [dir] --write  ...and write index.html (backup: index.html.bak)
  readpace calibrate [dir]    Measure your own reading time, slide by slide
  readpace calibration        Show the current calibration
  readpace --version

Options
  --json                      Machine-readable output (check)
  --strict                    Exit 1 on warnings too (check)
  --no-calibration            Ignore the calibration, use default rates
  --wps <n>                   Body text, words per second       (default ${DEFAULTS.wps})
  --wps-head <n>              Headlines >= ${DEFAULTS.headPx}px, words per second (default ${DEFAULTS.wpsHead})
  --cps-mono <n>              Monospace, characters per second  (default ${DEFAULTS.cpsMono})
  --step <s>                  Sampling step in seconds          (default 0.1)
  --rounds <n>                Maximum fit rounds                (default 3)
  --port <n>                  Calibration server port           (default 8765)
  --no-open                   Do not open a browser (calibrate)

Exit codes
  0 ok · 1 slides too short (check) · 2 usage or runtime error

Environment
  CHROME_PATH                 Chrome/Chromium binary (auto-detected otherwise)
  READPACE_CALIBRATION        Calibration file (default ~/.config/readpace/calibration.json)

Docs: https://github.com/Jeuners/readpace`;

function fail(message) {
  console.error(message);
  process.exit(2);
}

let opt, positionals;
try {
  ({ values: opt, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean" }, strict: { type: "boolean" }, write: { type: "boolean" },
      "no-calibration": { type: "boolean" }, "no-open": { type: "boolean" },
      help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" },
      wps: { type: "string" }, "wps-head": { type: "string" }, "cps-mono": { type: "string" },
      step: { type: "string" }, port: { type: "string" }, rounds: { type: "string" },
    },
  }));
} catch (err) {
  fail(`${err.message}\nRun \`readpace --help\` for usage.`);
}

if (opt.version) {
  console.log(createRequire(import.meta.url)("../package.json").version);
  process.exit(0);
}
const [command = "help", target = "."] = positionals;
if (opt.help || command === "help") {
  console.log(HELP);
  process.exit(0);
}

function positive(name, fallback) {
  if (opt[name] === undefined) return fallback;
  const v = Number(opt[name]);
  if (!(v > 0) || !Number.isFinite(v)) fail(`--${name} must be a positive number, got "${opt[name]}"`);
  return v;
}

function resolveIndex(t) {
  const p = path.resolve(t);
  const index = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(index)) fail(`index.html not found: ${index}`);
  return index;
}

/** Reading model for this run; a stale calibration is shown but not applied. */
function config({ calibrated = true } = {}) {
  const summary = calibrated && !opt["no-calibration"] ? loadSummary() : null;
  const cfg = {
    ...DEFAULTS,
    wps: positive("wps", DEFAULTS.wps),
    wpsHead: positive("wps-head", DEFAULTS.wpsHead),
    cpsMono: positive("cps-mono", DEFAULTS.cpsMono),
  };
  const applied = !!summary && !isStale(summary);
  if (applied) cfg.k = summary.k;
  const mismatch = applied ? modelMismatch(summary, cfg) : null;
  const notes = mismatch
    ? [`WARNING  calibration was measured with different reading rates (${mismatch.join(", ")}); k may not fit`]
    : [];
  return { cfg, summary, applied, notes };
}

const step = positive("step", 0.1);

async function check() {
  const { cfg, summary, applied, notes } = config();
  const result = analyse(await probe(resolveIndex(target), { step }), cfg);
  if (opt.json) {
    result.calibration = { summary, applied, stale: summary ? isStale(summary) : false, notes };
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatCheck(result, summary));
    notes.forEach((n) => console.log(n));
  }
  const errors = result.findings.filter((f) => f.level === "error").length;
  const warnings = result.findings.filter((f) => f.level === "warning").length;
  return errors || (opt.strict && warnings) ? 1 : 0;
}

async function fit() {
  const index = resolveIndex(target);
  const { cfg, summary, notes } = config();
  console.log(calibrationLine(summary));
  notes.forEach((n) => console.log(n));
  const original = fs.readFileSync(index, "utf8");
  // re-measure a scratch copy next to the original (so relative assets resolve);
  // index.html itself is only touched by --write
  const scratch = path.join(path.dirname(index), `.readpace-probe-${process.pid}.html`);
  const cleanup = () => fs.rmSync(scratch, { force: true });
  process.once("SIGINT", () => { cleanup(); process.exit(130); });
  let html = original;
  let converged = false;
  const rounds = positive("rounds", 3);
  try {
    for (let round = 1; round <= rounds; round++) {
      fs.writeFileSync(scratch, html);
      const measured = await probe(scratch, { step });
      const p = plan(html, analyse(measured, cfg), cfg, undefined, measured.clips);
      if (round === 1) p.warnings.forEach((w) => console.log(`WARNING  ${w}`));
      const diff = changed(p);
      console.log(formatPlan(round, diff, p.total));
      if (!diff.length) {
        converged = true;
        break;
      }
      html = apply(html, p);
    }
  } finally {
    cleanup();
  }
  if (!converged) {
    console.log(`\nWARNING  not converged after ${rounds} round(s): the last changes were not re-measured. ` +
      "Run fit again, or raise --rounds.");
  }
  if (!opt.write) {
    console.log("\nDry run — use --write to apply.");
    return 0;
  }
  if (html === original) {
    console.log("\nNothing to change.");
    return 0;
  }
  let backup = index + ".bak";
  for (let i = 2; fs.existsSync(backup); i++) backup = `${index}.bak${i}`; // never overwrite an older backup
  fs.writeFileSync(backup, original);
  fs.writeFileSync(index, html);
  console.log(`\nwritten: ${index} (backup: ${path.basename(backup)})`);
  return 0;
}

async function calibrate() {
  const index = resolveIndex(target);
  const { cfg } = config({ calibrated: false }); // compare against the raw model
  const model = { wps: cfg.wps, wpsHead: cfg.wpsHead, cpsMono: cfg.cpsMono };
  const p = calibrationPlan(analyse(await probe(index, { step }), cfg), step, model);
  for (const s of p.skipped) {
    console.log(`skipped ${s}: a block leaves before the last one appears, so the scene cannot be held with all text visible`);
  }
  if (!p.scenes.length) {
    console.error("no scenes to calibrate");
    return 2;
  }
  const { summary, rejected } = await serveCalibration({
    projectDir: path.dirname(index),
    plan: p,
    project: path.basename(path.dirname(index)),
    port: positive("port", 8765),
    onListen(url) {
      console.log(`${p.scenes.length} scenes. Calibration page: ${url}`);
      console.log("Space = finished reading, N = skip, Esc = finish. Ctrl+C aborts without saving.");
      if (!opt["no-open"]) {
        const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        exec(`${cmd} ${url}`);
      }
    },
  });
  if (rejected.length) console.log(`\ndropped ${rejected.length} implausible measurement(s): ${rejected.join(", ")}`);
  console.log(`\nsaved → ${calibrationPath()}`);
  printCalibration(summary);
  return 0;
}

function printCalibration(summary = loadSummary()) {
  if (!summary || !summary.k) {
    console.log("No calibration yet.");
    return 0;
  }
  console.log(calibrationLine(summary));
  if (summary.kRepeat) {
    console.log(`Repeated scenes: measured factor ${summary.kRepeat.toFixed(2)} (n = ${summary.nRepeat}) ` +
      "— use it as data-reading-factor");
  }
  console.log("k > 1: slower than the model, k < 1: faster.");
  return 0;
}

const commands = { check, fit, calibrate, calibration: () => printCalibration() };
if (!commands[command]) {
  console.error(`unknown command: ${command}\n\n${HELP}`);
  process.exit(2);
}
try {
  process.exitCode = await commands[command]();
} catch (err) {
  console.error(err.message);
  process.exitCode = 2;
}
