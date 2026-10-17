import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addRecords } from "./calibration.js";

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "calibrate.html");
const OUT = 0.45; // exit lead time of the scene convention

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".wav": "audio/wav", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

/** Scenes to ask about: everything except data-timing="hold". */
export function calibrationPlan(analysis) {
  return {
    scenes: analysis.scenes.filter((s) => s.timing !== "hold").map((s) => ({
      scene: s.scene,
      start: s.start,
      holdAt: Math.round((s.end - OUT - 0.05) * 100) / 100,
      firstReady: s.firstReady,
      factor: s.factor,
      readTime: s.readTime,
      // every cost scales linearly with the factor
      readTimeUnfactored: Math.round((s.readTime / s.factor) * 1000) / 1000,
    })),
  };
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
          const { results } = JSON.parse(body);
          const summary = addRecords(project, results, calibrationFile);
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
        res.writeHead(200, { "Content-Type": TYPES[".json"] });
        return res.end(JSON.stringify(plan));
      }
      if (url.pathname.startsWith("/composition/")) {
        const file = path.resolve(root, decodeURIComponent(url.pathname.slice("/composition/".length)));
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
