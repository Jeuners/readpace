/**
 * Minimal stand-in for what the HyperFrames runtime provides before a
 * composition's own scripts run. Many compositions assume these globals exist
 * (e.g. `window.__timelines["main"] = tl` without initialising the object).
 * Variables resolve to the defaults declared in data-composition-variables.
 */
export const RUNTIME_SHIM = `(() => {
  window.__timelines = window.__timelines || {};
  if (!window.__hyperframes) {
    window.__hyperframes = {
      getVariables() {
        try {
          const decl = JSON.parse(document.documentElement.getAttribute("data-composition-variables") || "[]");
          return Object.fromEntries(decl.map((v) => [v.id, v.default]));
        } catch { return {}; }
      },
    };
  }
})();`;

/** Insert the shim as the first script of an HTML document. */
export function injectShim(html) {
  const tag = `<script>${RUNTIME_SHIM}</script>`;
  const m = /<head[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html;
}
