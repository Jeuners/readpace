import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "./browser.js";

/**
 * Play a HyperFrames composition in headless Chromium and record, for every
 * reading block, at which sampled times it is readable.
 *
 * A reading block is the nearest non-inline ancestor of a text node, so
 * <em>, <b> and <span> belong to the surrounding block. A block counts as
 * readable at time t when every enclosing clip (data-start/data-duration) is
 * active, its cumulative opacity is >= 0.85, it intersects the frame and its
 * text is complete (typewriter effects count from the last character).
 *
 * @returns {Promise<{total:number, step:number, meta:object, samples:object}>}
 */
export async function probe(indexHtml, { step = 0.1, chromePath } = {}) {
  const browser = await puppeteer.launch({
    executablePath: chromePath || findChrome(),
    headless: true,
    args: ["--allow-file-access-from-files", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(pathToFileURL(path.resolve(indexHtml)).href, { waitUntil: "networkidle0" });
    await page.waitForFunction(
      () => window.__timelines && Object.keys(window.__timelines).length > 0,
      { timeout: 20000 },
    );
    return await page.evaluate(sampleTimeline, step);
  } finally {
    await browser.close();
  }
}

/* Runs inside the page. Must be self-contained. */
function sampleTimeline(STEP) {
  const root = document.querySelector("[data-composition-id]");
  const W = +root.dataset.width || 1920;
  const H = +root.dataset.height || 1080;
  const total = +root.dataset.duration;
  const timelines = Object.values(window.__timelines);

  const isInline = (el) => getComputedStyle(el).display.startsWith("inline");
  const clipsOf = (el) => {
    const out = [];
    for (let e = el; e && e !== root; e = e.parentElement) {
      if (e.hasAttribute("data-start")) out.push(e);
    }
    return out;
  };
  const cssPath = (el) => {
    const parts = [];
    for (let e = el; e && e !== root; e = e.parentElement) {
      if (e.id) { parts.unshift("#" + e.id); break; }
      const i = [...e.parentElement.children].indexOf(e) + 1;
      parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${i})`);
    }
    return parts.join(" > ");
  };
  const blocks = () => {
    const set = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      let el = n.parentElement;
      if (!el || el.closest("script,style,svg")) continue;
      while (el !== root && isInline(el)) el = el.parentElement;
      set.add(el);
    }
    return [...set];
  };
  const opacityChain = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  };

  const meta = {};
  const samples = {};
  const n = Math.round(total / STEP);
  for (let i = 0; i <= n; i++) {
    const t = +(i * STEP).toFixed(3);
    timelines.forEach((tl) => tl.seek(t, false));
    for (const el of blocks()) {
      const key = cssPath(el);
      const text = el.innerText.replace(/\s+/g, " ").trim();
      const clips = clipsOf(el);
      if (!meta[key]) {
        const cs = getComputedStyle(el);
        const scene = clips.length ? clips[clips.length - 1] : null;
        const factorEl = el.closest("[data-reading-factor]");
        const timingEl = el.closest("[data-timing]");
        meta[key] = {
          scene: scene ? scene.id || cssPath(scene) : null,
          sceneStart: scene ? +scene.dataset.start : 0,
          sceneEnd: scene ? +scene.dataset.start + +scene.dataset.duration : total,
          timing: timingEl ? timingEl.dataset.timing : null,
          factor: factorEl ? parseFloat(factorEl.dataset.readingFactor) : 1,
          fontPx: parseFloat(cs.fontSize),
          mono: /mono|menlo|courier|monaco|consolas/i.test(cs.fontFamily),
          text: "",
        };
      }
      const active = clips.every(
        (c) => t >= +c.dataset.start && t < +c.dataset.start + +c.dataset.duration,
      );
      const r = el.getBoundingClientRect();
      const onScreen = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 &&
        r.left < W && r.top < H;
      const visible = active && onScreen && opacityChain(el) >= 0.85;
      if (text.length > meta[key].text.length) meta[key].text = text;
      (samples[key] ||= []).push([t, visible ? 1 : 0, text.length]);
    }
  }
  return { total, step: STEP, meta, samples };
}
