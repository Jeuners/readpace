import { ageDays, isStale } from "./calibration.js";

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const sec = (x) => `${x.toFixed(1)}s`;

export function calibrationLine(summary) {
  if (!summary) return "Uncalibrated: default reading rates (estimates). Calibrate with `readpace calibrate`.";
  const age = ageDays(summary);
  const base = `k = ${summary.k.toFixed(2)} (n = ${summary.n}, IQR ${summary.iqr[0].toFixed(2)}–` +
    `${summary.iqr[1].toFixed(2)}, ${age} days old)`;
  return isStale(summary)
    ? `Calibration is STALE and NOT applied: ${base}. Using default rates; recalibrate with \`readpace calibrate\`.`
    : `Calibrated: ${base}`;
}

export function formatCheck(result, summary) {
  const { scenes, findings, config } = result;
  const w = Math.max(5, ...scenes.map((s) => s.scene.length)) + 2;
  const lines = [calibrationLine(summary), ""];
  lines.push(`${pad("scene", w)}${lpad("time", 15)}${lpad("factor", 8)}${lpad("need", 8)}${lpad("readable", 10)}` +
    `${lpad("late", 7)}${lpad("idle", 8)}`);
  for (const s of scenes) {
    const mark = s.worstDeficit > config.errorDeficit ? " ✗" : s.worstDeficit > 0 ? " !" : "";
    lines.push(`${pad(s.scene, w)}${lpad(`${s.start.toFixed(1)}–${s.end.toFixed(1)}`, 15)}` +
      `${lpad(s.factor.toFixed(2), 8)}${lpad(sec(s.need), 8)}${lpad(sec(s.available), 10)}` +
      `${lpad(sec(s.worstDeficit), 7)}${lpad(sec(s.idle), 8)}${mark}`);
  }
  if (findings.length) lines.push("");
  for (const f of findings) lines.push(`${pad(f.level.toUpperCase(), 8)} ${pad(f.scene, w)}${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.filter((f) => f.level === "warning").length;
  lines.push("", `${errors} error(s), ${warnings} warning(s)`);
  return lines.join("\n");
}

export function formatPlan(round, rows, total) {
  const lines = [`Round ${round}: ${rows.length} clip(s) re-timed`];
  const w = Math.max(10, ...rows.map((x) => x.scene.length + 2));
  if (rows.length && total && total.to !== total.from) {
    lines[0] += ` — total ${total.from.toFixed(1)} s → ${total.to.toFixed(1)} s`;
  }
  for (const x of rows) {
    lines.push(`  ${pad(x.scene, w)}${lpad(x.start.toFixed(1), 7)} +${pad(x.dur.toFixed(1), 6)}→` +
      `${lpad(x.newStart.toFixed(1), 7)} +${x.newDur.toFixed(1)}`);
  }
  return lines.join("\n");
}
