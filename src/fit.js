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

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

export function sceneTag(html, id) {
  const m = new RegExp(`<[^>]*\\bid="${esc(id)}"[^>]*>`).exec(html);
  if (!m) throw new Error(`scene "${id}" not found in HTML`);
  const tag = m[0];
  const start = tag.match(/data-start="([\d.]+)"/);
  const dur = tag.match(/data-duration="([\d.]+)"/);
  if (!start || !dur) throw new Error(`scene "${id}" lacks data-start/data-duration`);
  return { index: m.index, tag, start: +start[1], dur: +dur[1] };
}

export function compositionDuration(html) {
  const m = /<[^>]*\bdata-composition-id="[^"]*"[^>]*>/.exec(html);
  const d = m && m[0].match(/data-duration="([\d.]+)"/);
  if (!d) throw new Error("root composition lacks data-duration");
  return +d[1];
}

/**
 * Lengthen scenes by their overrun (+margin), shorten idle ones, shift
 * following scenes (gaps preserved).
 *
 * Total length: a trailing data-timing="hold" scene keeps its end, so the
 * total (e.g. a song) stays fixed. Without one, the composition grows or
 * shrinks with its scenes, and so do full-length layers (backgrounds, music).
 *
 * @returns {{scenes: object[], total: {from: number, to: number}}}
 */
export function plan(html, analysis, cfg, opts = FIT_DEFAULTS) {
  const rows = analysis.scenes.map((s) => {
    const { tag, start, dur } = sceneTag(html, s.scene);
    const hold = /data-timing="hold"/.test(tag);
    let delta = 0;
    if (!hold && s.overrun > 0) delta = s.overrun + opts.margin;
    else if (!hold && s.idle > cfg.idleHint) delta = -(s.idle - opts.keepIdle);
    return { scene: s.scene, start, dur, hold, newDur: Math.max(opts.minScene, round1(dur + delta)) };
  });
  rows.sort((a, b) => a.start - b.start);

  let shift = 0;
  rows.forEach((x, i) => {
    x.newStart = round2(x.start + shift);
    if (x.hold && i === rows.length - 1) x.newDur = round2(x.start + x.dur - x.newStart);
    shift = x.newStart + x.newDur - (x.start + x.dur);
  });
  const from = compositionDuration(html);
  return { scenes: rows, total: { from, to: round2(from + shift) } };
}

/** Rewrite scene timing and, if the total changed, the root and full-length layers. */
export function apply(html, { scenes: rows, total }) {
  if (total.to !== total.from) {
    const full = new RegExp(`(<[^>]*\\bdata-start="0"[^>]*\\bdata-duration=")${esc(String(total.from))}(")`, "g");
    const fullRev = new RegExp(`(<[^>]*\\bdata-duration=")${esc(String(total.from))}("[^>]*\\bdata-start="0")`, "g");
    const to = String(+total.to.toFixed(2));
    html = html.replace(full, `$1${to}$2`).replace(fullRev, `$1${to}$2`);
    html = html.replace(/(<[^>]*\bdata-composition-id="[^"]*"[^>]*\bdata-duration=")[\d.]+(")/, `$1${to}$2`);
  }
  for (const x of rows) {
    const { index, tag } = sceneTag(html, x.scene);
    const next = tag
      .replace(/data-start="[\d.]+"/, `data-start="${+x.newStart.toFixed(2)}"`)
      .replace(/data-duration="[\d.]+"/, `data-duration="${+x.newDur.toFixed(2)}"`);
    html = html.slice(0, index) + next + html.slice(index + tag.length);
  }
  return html;
}

export const changed = (p) => p.scenes.filter((x) => x.newStart !== x.start || x.newDur !== x.dur);
