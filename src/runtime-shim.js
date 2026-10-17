/**
 * Minimal stand-in for what the HyperFrames runtime provides before a
 * composition's own scripts run. Many compositions assume these globals exist
 * (e.g. `window.__timelines["main"] = tl` without initialising the object).
 * Variables resolve to the defaults declared in any data-composition-variables
 * (first declaration of an id wins), like the runtime's defaults layer.
 */
export const RUNTIME_SHIM = `(() => {
  window.__timelines = window.__timelines || {};
  if (!window.__hyperframes) {
    window.__hyperframes = {
      getVariables() {
        const out = {};
        for (const el of document.querySelectorAll("[data-composition-variables]")) {
          try {
            for (const v of JSON.parse(el.getAttribute("data-composition-variables") || "[]")) {
              if (!(v.id in out)) out[v.id] = v.default;
            }
          } catch { /* ignore malformed declarations */ }
        }
        return out;
      },
    };
  }
})();`;

/**
 * Insert the shim as the first script of an HTML document: after <head>, else
 * after <html>, else after the doctype — never before the doctype (quirks mode).
 */
export function injectShim(html) {
  const tag = `<script>${RUNTIME_SHIM}</script>`;
  const m = /<head(?:\s[^>]*)?>/i.exec(html) || /<html(?:\s[^>]*)?>/i.exec(html) || /<!doctype[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html;
}
