/**
 * Which text does a block "really" show?
 *
 * Motion text changes over time: it is typed, decoded from scrambled glyphs,
 * blinks a cursor, flickers between states, glitches before it leaves, or is
 * deleted again. readpace measures the text a viewer is meant to read: the
 * non-empty text that stays on screen longest in one stretch (ties: the later
 * one). A trailing cursor is removed only where there is evidence of blinking —
 * the same text also appears without it — so content like `snake_` is kept.
 */
const CURSOR = /[_|▌█▏]$/u;

/**
 * @param {Array<[number, 0|1, string]>} samples  [t, visible, text] per sample
 * @returns {{samples: Array<[number, 0|1, string]>, text: string}}
 */
export function normalizeBlock(samples) {
  const seen = new Set(samples.filter((s) => s[1]).map((s) => s[2]));
  const norm = (text) => {
    if (!CURSOR.test(text)) return text;
    const base = text.slice(0, -1).trimEnd();
    return seen.has(base) || base === "" ? base : text;
  };
  const out = samples.map(([t, v, text]) => [t, v, norm(text)]);

  let best = "";
  let bestLen = 0;
  let run = "";
  let len = 0;
  const close = () => {
    if (run && len >= bestLen) { best = run; bestLen = len; }
    run = "";
    len = 0;
  };
  for (const [, v, text] of out) {
    if (v && text && text === run) len++;
    else {
      close();
      if (v && text) { run = text; len = 1; }
    }
  }
  close();
  return { samples: out, text: best };
}
