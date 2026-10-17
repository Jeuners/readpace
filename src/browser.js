import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();

function newestMatch(base, dirPattern, relative) {
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).filter((d) => dirPattern.test(d)).sort().reverse();
  for (const d of dirs) {
    for (const rel of relative) {
      const p = path.join(base, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Locate a Chromium/Chrome binary. Order: CHROME_PATH, the Puppeteer cache,
 * the Playwright cache, then common system installs.
 */
export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const puppeteerCache = process.env.PUPPETEER_CACHE_DIR || path.join(HOME, ".cache/puppeteer");
  for (const product of ["chrome-headless-shell", "chrome"]) {
    const p = newestMatch(path.join(puppeteerCache, product), /./, [
      "chrome-headless-shell-mac-arm64/chrome-headless-shell",
      "chrome-headless-shell-mac-x64/chrome-headless-shell",
      "chrome-headless-shell-linux64/chrome-headless-shell",
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "chrome-linux64/chrome",
    ]);
    if (p) return p;
  }

  const playwrightCache = process.platform === "darwin"
    ? path.join(HOME, "Library/Caches/ms-playwright")
    : path.join(HOME, ".cache/ms-playwright");
  const pw = newestMatch(playwrightCache, /^chromium-\d+$/, [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chrome-linux64/chrome",
    "chrome-linux/chrome",
  ]);
  if (pw) return pw;

  for (const p of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    "No Chrome/Chromium found. Set CHROME_PATH, or install one with:\n" +
    "  npx @puppeteer/browsers install chrome-headless-shell@stable",
  );
}
