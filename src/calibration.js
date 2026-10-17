import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Calibration turns the reading model from an estimate into a measurement.
 * Records are kept per person/audience in a JSON file; the summary holds
 *   k        median(measured / model) over first viewings
 *   iqr      spread of k (25th–75th percentile) — report it, don't round it away
 *   kRepeat  measured factor for repeated scenes (data-reading-factor < 1),
 *            relative to k — a suggestion for that attribute
 *   n, updated
 */
export const MAX_AGE_DAYS = 90;

export function calibrationPath() {
  return process.env.READPACE_CALIBRATION ||
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "readpace", "calibration.json");
}

export function readCalibration(file = calibrationPath()) {
  if (!fs.existsSync(file)) return { records: [] };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadSummary(file = calibrationPath()) {
  const s = readCalibration(file).summary;
  return s && s.k ? s : null;
}

export function ageDays(summary, today = new Date()) {
  return Math.floor((today - new Date(summary.updated + "T00:00:00")) / 86400000);
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const r3 = (x) => Math.round(x * 1000) / 1000;
const median = (xs) => quantile([...xs].sort((a, b) => a - b), 0.5);

export function summarize(records, today = new Date()) {
  const first = records.filter((r) => r.factor === 1 && r.predicted > 0).map((r) => r.measured / r.predicted);
  const repeat = records.filter((r) => r.factor < 1 && r.predictedUnfactored > 0)
    .map((r) => r.measured / r.predictedUnfactored);
  if (!first.length) return {};
  const sorted = [...first].sort((a, b) => a - b);
  const k = median(first);
  const out = {
    k: r3(k),
    iqr: [r3(quantile(sorted, 0.25)), r3(quantile(sorted, 0.75))],
    n: first.length,
    updated: today.toISOString().slice(0, 10),
  };
  if (repeat.length) {
    out.kRepeat = r3(median(repeat) / k);
    out.nRepeat = repeat.length;
  }
  return out;
}

export function addRecords(project, results, file = calibrationPath(), today = new Date()) {
  const data = readCalibration(file);
  const date = today.toISOString().slice(0, 10);
  for (const r of results) data.records.push({ ...r, date, project });
  data.summary = summarize(data.records, today);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return data.summary;
}
