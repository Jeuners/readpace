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
 */
export function calibrationPlan(analysis, step = 0.1) {
  return {
    token: crypto.randomBytes(16).toString("hex"),
    scenes: analysis.scenes.filter((s) => s.timing !== "hold").map((s) => ({
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

/** Turn raw key-press times into records with the scale solved from the model. */
export function toRecords(plan, results) {
  const byScene = new Map(plan.scenes.map((s) => [s.scene, s]));
  return results.filter((r) => byScene.has(r.scene) && r.measured > 0).map((r) => {
    const sc = byScene.get(r.scene);
    const unfactored = {
      orient: sc.orient / sc.factor,
      blocks: sc.blocks.map((b) => ({ start: b.start, cost: b.cost / sc.factor })),
    };
    const rec = { scene: r.scene, factor: sc.factor, measured: r.measured, predicted: sc.readTime };
    if (sc.factor === 1) rec.kScene = +solveScale(sc, r.measured).toFixed(3);
    else rec.fScene = +solveScale(unfactored, r.measured).toFixed(3);
    return rec;
  });
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
          const summary = addRecords(project, toRecords(plan, results), calibrationFile);
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(summary.k ? `k = ${summary.k.toFixed(2)} (n = ${summary.n})` : "no first-viewing scenes measured yet");
          server.close();
          resolve({ results, summary });
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
