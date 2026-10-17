/**
 * Reading model and viewer simulation.
 *
 * Every value here is an estimate until calibrated (see calibration.js);
 * k scales all reading costs and defaults to 1.
 */
export const DEFAULTS = Object.freeze({
  wps: 3.0,          // body text, words per second
  wpsHead: 3.5,      // headlines (font size >= headPx)
  headPx: 72,
  cpsMono: 15.0,     // monospace/code, non-space characters per second
  perBlock: 0.15,    // eye movement to a new block
  minBlock: 0.4,
  orient: 0.4,       // orientation after a scene change
  warnDeficit: 0.0,
  errorDeficit: 0.5,
  idleHint: 2.5,
  k: 1.0,            // calibration factor
});

const WORD_RE = /[\p{L}\p{N}@.$%_-]+/gu;

export function blockCost(meta, cfg = DEFAULTS) {
  let base;
  if (meta.mono) {
    base = meta.text.replace(/\s/g, "").length / cfg.cpsMono;
  } else {
    const words = (meta.text.match(WORD_RE) || []).length;
    base = words / (meta.fontPx >= cfg.headPx ? cfg.wpsHead : cfg.wps);
  }
  return Math.max(cfg.minBlock, base + cfg.perBlock) * meta.factor * cfg.k;
}

/** First contiguous interval in which the block is visible and complete. */
export function readyWindow(samples, fullLength, step) {
  let start = null;
  for (const [t, visible, length] of samples) {
    const ok = visible && length >= fullLength;
    if (ok && start === null) start = t;
    else if (!ok && start !== null) return [start, t];
  }
  return start === null ? null : [start, samples[samples.length - 1][0] + step];
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Simulate a viewer who reads the blocks of each scene in order of
 * appearance: a block is started once it is readable and the previous block
 * is finished.
 *
 * Per scene:
 *   deficit  how late the viewer finishes a block after it disappears
 *   overrun  how much time the scene lacks if the viewer were allowed to
 *            finish every block. Deficits underestimate this because an
 *            abandoned block frees the viewer early for the next one.
 *   idle     time the scene stays up after everything has been read
 */
export function analyse(probeResult, cfg = DEFAULTS) {
  const { step, meta, samples } = probeResult;
  const scenes = new Map();
  const unreadable = [];

  for (const [key, m] of Object.entries(meta)) {
    if (!m.text) continue;
    const win = readyWindow(samples[key], m.text.length, step);
    if (!win) {
      unreadable.push({ block: key, text: m.text });
      continue;
    }
    const id = m.scene || "(root)";
    if (!scenes.has(id)) scenes.set(id, []);
    scenes.get(id).push({ block: key, text: m.text, start: win[0], end: win[1], cost: blockCost(m, cfg), meta: m });
  }

  const report = [];
  const findings = [];
  for (const [scene, blocks] of scenes) {
    blocks.sort((a, b) => a.start - b.start || a.block.localeCompare(b.block));
    const m0 = blocks[0].meta;
    const orient = cfg.orient * m0.factor * cfg.k;

    let free = blocks[0].start + orient;
    let overrun = 0;
    for (const b of blocks) {
      free = Math.max(free, b.start) + b.cost;
      overrun = Math.max(overrun, free - b.end);
    }
    const readTime = free - blocks[0].start;

    let cursor = blocks[0].start + orient;
    let worst = 0;
    for (const b of blocks) {
      const finish = Math.max(cursor, b.start) + b.cost;
      b.deficit = r2(Math.max(0, finish - b.end));
      worst = Math.max(worst, b.deficit);
      cursor = Math.min(finish, b.end);
    }

    const late = blocks.filter((b) => b.deficit > cfg.warnDeficit);
    if (late.length) {
      const first = late[0];
      findings.push({
        level: worst > cfg.errorDeficit ? "error" : "warning",
        scene,
        message: `${late.length}/${blocks.length} blocks not finished, up to ${worst.toFixed(1)} s late. ` +
          `First: "${first.text.slice(0, 40)}" needs ${first.cost.toFixed(1)} s, ` +
          `readable ${first.start.toFixed(1)}–${first.end.toFixed(1)} s`,
      });
    }

    const visibleEnd = Math.max(...blocks.map((b) => b.end));
    const idle = r2(Math.max(0, visibleEnd - cursor));
    if (idle > cfg.idleHint && m0.timing !== "hold") {
      findings.push({ level: "hint", scene, message: `${idle.toFixed(1)} s idle after reading — shorten the scene?` });
    }

    report.push({
      scene,
      start: r2(m0.sceneStart),
      end: r2(m0.sceneEnd),
      timing: m0.timing,
      factor: m0.factor,
      firstReady: blocks[0].start,
      need: r2(orient + blocks.reduce((s, b) => s + b.cost, 0)),
      available: r2(visibleEnd - blocks[0].start),
      readTime: r2(readTime),
      worstDeficit: r2(worst),
      overrun: r2(Math.max(0, overrun)),
      idle,
      blocks: blocks.map(({ text, start, end, cost, deficit }) => ({ text, start, end, cost: r2(cost), deficit })),
    });
  }

  report.sort((a, b) => a.start - b.start);
  for (const u of unreadable) {
    findings.push({ level: "hint", scene: "-", message: `never fully readable: "${u.text.slice(0, 60)}" (${u.block})` });
  }
  return { config: cfg, scenes: report, findings };
}
