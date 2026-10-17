/**
 * Re-time scenes from measured reading demand.
 *
 * Requires the scene convention (docs/scene-convention.md): every scene reads
 * its start and end from its own data-start/data-duration, entrances are
 * relative to the start, the exit is relative to the end. Then rewriting those
 * two attributes is enough — the animation code stays untouched.
 */
export const FIT_DEFAULTS = Object.freeze({
  margin: 0.3,     // air after the last block is read
  keepIdle: 0.8,   // idle time a scene may keep after reading
  minScene: 1.5,
});

const EPS = 1e-6;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
const num = (x) => String(+x.toFixed(2));

/** Blank out comments, scripts and styles (same length, so indexes still match). */
function mask(html) {
  return html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,
    (m) => m.replace(/[^\n]/g, " "));
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}=(["'])([^"']*)\\1`));
  return m ? m[2] : null;
};

function* tags(html) {
  const masked = mask(html);
  const re = /<[a-zA-Z][^>]*>/g;
  for (let m = re.exec(masked); m; m = re.exec(masked)) yield { index: m.index, tag: html.slice(m.index, m.index + m[0].length) };
}

export function sceneTag(html, id) {
  const masked = mask(html);
  const m = new RegExp(`<[a-zA-Z][^>]*\\sid=(["'])${esc(id)}\\1[^>]*>`).exec(masked);
  if (!m) throw new Error(`scene "${id}" not found in HTML`);
  const tag = html.slice(m.index, m.index + m[0].length);
  const start = attr(tag, "data-start");
  const dur = attr(tag, "data-duration");
  if (start === null || dur === null) throw new Error(`scene "${id}" lacks data-start/data-duration`);
  return { index: m.index, tag, start: +start, dur: +dur };
}

export function compositionDuration(html) {
  for (const { tag } of tags(html)) {
    if (attr(tag, "data-composition-id") === null) continue;
    const d = attr(tag, "data-duration");
    if (d === null || !(+d > 0)) throw new Error("the root composition needs a positive data-duration");
    return +d;
  }
  throw new Error("no element with data-composition-id found");
}

/**
 * Lay out the top-level clips again: lengthen scenes by their overrun
 * (+margin), shorten idle ones, keep textless clips as they are, shift every
 * following clip (gaps preserved).
 *
 * Clips that span the whole composition (backgrounds, music) are layers, not
 * scenes. All other top-level clips must be in sequence; overlapping clips are
 * rejected because fit cannot know how they relate.
 *
 * Total length: a trailing data-timing="hold" scene keeps its end, so the
 * total (e.g. a song) stays fixed. Without one, the composition grows or
 * shrinks with its scenes, and so do the full-length layers.
 *
 * @param clips top-level clips as reported by probe()
 * @returns {{scenes: object[], total: {from:number, to:number}, warnings: string[]}}
 */
export function plan(html, analysis, cfg, opts = FIT_DEFAULTS, clips = null) {
  const from = compositionDuration(html);
  const byScene = new Map(analysis.scenes.map((s) => [s.scene, s]));
  const warnings = [];

  const list = (clips ?? analysis.scenes.map((s) => ({ id: s.scene }))).filter((c) => {
    const isLayer = c.start !== undefined && Math.abs(c.start) < EPS && Math.abs(c.duration - from) < EPS;
    return !isLayer;
  });
  for (const s of analysis.scenes) {
    if (!list.some((c) => c.id === s.scene)) warnings.push(`text outside a top-level scene is not re-timed: ${s.scene}`);
  }

  const rows = list.map((c) => {
    if (!c.id) throw new Error("every top-level clip needs an id for fit (see docs/scene-convention.md)");
    const { tag, start, dur } = sceneTag(html, c.id);
    const hold = attr(tag, "data-timing") === "hold";
    const s = byScene.get(c.id);
    let delta = 0;
    if (s && !hold && s.overrun > 0) delta = s.overrun + opts.margin;
    else if (s && !hold && s.idle > cfg.idleHint) delta = -(s.idle - opts.keepIdle);
    const newDur = delta ? Math.max(opts.minScene, round1(dur + delta)) : dur;
    return { scene: c.id, start, dur, hold, newDur };
  });
  rows.sort((a, b) => a.start - b.start);

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    if (rows[i].start < prev.start + prev.dur - EPS) {
      throw new Error(`fit needs scenes in sequence, but "${prev.scene}" and "${rows[i].scene}" overlap. ` +
        "Parallel clips (overlays, captions) are not supported by fit yet; check still works.");
    }
  }

  let shift = 0;
  rows.forEach((x, i) => {
    x.newStart = round2(x.start + shift);
    if (x.hold && i === rows.length - 1) {
      x.newDur = round2(x.start + x.dur - x.newStart);
      if (x.newDur < opts.minScene) {
        throw new Error(`hold scene "${x.scene}" cannot absorb +${round2(shift).toFixed(2)} s ` +
          `(${x.dur} s long, would end up ${x.newDur} s). Lengthen the composition or shorten the text.`);
      }
    }
    shift = x.newStart + x.newDur - (x.start + x.dur);
  });
  return { scenes: rows, total: { from, to: round2(from + shift) }, warnings };
}

function setAttr(tag, name, value) {
  return tag.replace(new RegExp(`(\\s${name}=)(["'])[^"']*\\2`), `$1$2${value}$2`);
}

/** Rewrite scene timing and, if the total changed, the root and full-length layers. */
export function apply(html, { scenes: rows, total }) {
  const edits = [];
  if (Math.abs(total.to - total.from) > EPS) {
    for (const { index, tag } of tags(html)) {
      const isRoot = attr(tag, "data-composition-id") !== null;
      const start = attr(tag, "data-start");
      const dur = attr(tag, "data-duration");
      const fullLength = start !== null && dur !== null && Math.abs(+start) < EPS && Math.abs(+dur - total.from) < EPS;
      if (isRoot || fullLength) edits.push({ index, tag, next: setAttr(tag, "data-duration", num(total.to)) });
    }
  }
  for (const x of rows) {
    if (x.newStart === x.start && x.newDur === x.dur) continue;
    const { index, tag } = sceneTag(html, x.scene);
    const pending = edits.find((e) => e.index === index);
    const base = pending ? pending.next : tag;
    const next = setAttr(setAttr(base, "data-start", num(x.newStart)), "data-duration", num(x.newDur));
    if (pending) pending.next = next;
    else edits.push({ index, tag, next });
  }
  edits.sort((a, b) => b.index - a.index);
  for (const e of edits) html = html.slice(0, e.index) + e.next + html.slice(e.index + e.tag.length);
  return html;
}

export const changed = (p) => p.scenes.filter((x) => x.newStart !== x.start || x.newDur !== x.dur);
