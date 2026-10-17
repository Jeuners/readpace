import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addRecords } from "./calibration.js";
import { solveScale } from "./model.js";

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "calibrate.html");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".wav": "audio/wav", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

/**
 * Scenes to ask about: everything except data-timing="hold". Playback holds
 * one sampling step before the first block of the scene starts to disappear,
 * so nothing is measured while text is fading out.
 *
 * A scene in which some block disappears before the last one appears cannot
 * be held with all of its text on screen; it is skipped and reported.
 */
export function calibrationPlan(analysis, step = 0.1, model = {}) {
  const skipped = [];
  const usable = analysis.scenes.filter((s) => {
    if (s.timing === "hold") return false;
    const firstGone = Math.min(...s.blocks.map((b) => b.end));
    const lastIn = Math.max(...s.blocks.map((b) => b.start));
    if (firstGone - step < lastIn) {
      skipped.push(s.scene);
      return false;
    }
    return true;
  });
  return {
    token: crypto.randomBytes(16).toString("hex"),
    model,
    skipped,
    scenes: usable.map((s) => ({
      scene: s.scene,
      start: s.start,
      holdAt: Math.round((Math.min(...s.blocks.map((b) => b.end)) - step) * 100) / 100,
      firstReady: s.firstReady,
      factor: s.factor,
      readTime: s.readTime,
      // the model scene (costs at k = 1, including the reading factor), for solving k
      orient: s.orient,
      blocks: s.blocks.map((b) => ({ start: b.start, cost: b.cost })),
    })),
  };
}

/**
 * Turn raw key-press times into records with the scale solved from the model.
 * Measurements the model cannot explain (scale outside SCALE_BOUNDS, e.g. a
 * key pressed by accident or a window left open) are dropped and reported.
 * Records carry the reading rates they were measured against.
 */
export function toRecords(plan, results) {
  const byScene = new Map(plan.scenes.map((s) => [s.scene, s]));
  const records = [];
  const rejected = [];
  for (const r of results) {
    const sc = byScene.get(r.scene);
    if (!sc || !(r.measured > 0)) continue;
    const unfactored = {
      orient: sc.orient / sc.factor,
      blocks: sc.blocks.map((b) => ({ start: b.start, cost: b.cost / sc.factor })),
    };
    const scale = solveScale(sc.factor === 1 ? sc : unfactored, r.measured);
    if (scale === null) {
      rejected.push(r.scene);
      continue;
    }
    const rec = { scene: r.scene, factor: sc.factor, measured: r.measured, predicted: sc.readTime, model: plan.model };
    rec[sc.factor === 1 ? "kScene" : "fScene"] = +scale.toFixed(3);
    records.push(rec);
  }
  records.rejected = rejected;
  return records;
}

/**
 * Serve the calibration page, the plan and the composition (so relative
 * assets resolve). Resolves with the summary once results are posted.
 */
export function serveCalibration({ projectDir, plan, project, port = 8765, calibrationFile, onListen }) {
  const root = path.resolve(projectDir);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "POST" && url.pathname === "/result") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          let results;
          try {
            const parsed = JSON.parse(body);
            if (parsed.token !== plan.token || !Array.isArray(parsed.results)) throw new Error("bad request");
            results = parsed.results;
          } catch {
            res.writeHead(400);
            return res.end();
          }
          const records = toRecords(plan, results);
          const summary = addRecords(project, records, calibrationFile);
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end((summary.k ? `k = ${summary.k.toFixed(2)} (n = ${summary.n})` : "no first-viewing scenes measured yet") +
            (records.rejected.length ? ` · ${records.rejected.length} implausible measurement(s) dropped` : ""));
          server.close();
          resolve({ results, records, rejected: records.rejected, summary });
        });
        return;
      }
      if (url.pathname === "/" || url.pathname === "/calibrate") {
        res.writeHead(200, { "Content-Type": TYPES[".html"] });
        return fs.createReadStream(PAGE).pipe(res);
      }
      if (url.pathname === "/plan.json") {
        // same-origin only: the token protects the result endpoint from other local pages
        res.writeHead(200, { "Content-Type": TYPES[".json"] });
        return res.end(JSON.stringify(plan));
      }
      if (url.pathname.startsWith("/composition/")) {
        let file;
        try {
          file = path.resolve(root, decodeURIComponent(url.pathname.slice("/composition/".length)));
        } catch {
          res.writeHead(400);
          return res.end();
        }
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
        return fs.createReadStream(file).pipe(res);
      }
      res.writeHead(404);
      res.end();
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => onListen?.(`http://127.0.0.1:${port}/calibrate`));
  });
}
