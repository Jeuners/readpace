# How readpace works

## 1. Probe (`src/probe.js`)

The composition's `index.html` is opened from disk in headless Chromium at 1920×1080. readpace waits for `window.__timelines` and then, for t = 0, 0.1, 0.2 … up to the root `data-duration`, seeks **every** registered timeline to t and inspects the page.

**Reading blocks.** For every non-empty text node, readpace walks up to the nearest ancestor whose computed `display` is not `inline*`. That element is one reading block, so `<em>`, `<b>` and `<span>` are read together with their surrounding line. Text inside `<script>`, `<style>` and `<svg>` is ignored. Blocks are keyed by `#id` or a short CSS path, so they can appear, change and disappear over time.

**Readable.** A block is readable at time t when

- every enclosing element with `data-start` is active (`start ≤ t < start + duration`) — this mirrors the HyperFrames runtime, which hides inactive clips,
- the product of `opacity` along its ancestor chain is ≥ 0.85, and nothing in the chain is `display: none` or `visibility: hidden`,
- its bounding box intersects the frame, and
- its text has reached its maximum observed length (typewriter effects count only once complete).

The probe returns, per block, its metadata (scene, font size, monospace or not, reading factor, timing mode, full text) and a list of `[t, readable, textLength]` samples.

## 2. Reading cost (`src/model.js`)

See [reading-model.md](reading-model.md). In short: words per second for proportional fonts, characters per second for monospace, a per-block overhead and a minimum, all multiplied by `data-reading-factor` and the calibration factor *k*.

## 3. Viewer simulation

Blocks are grouped by their outermost clip (the scene) and sorted by the time they become readable. A simulated viewer

1. spends the orientation time after the first block appears,
2. starts each block at `max(viewer free, block readable)`,
3. finishes it `cost` seconds later.

Two passes over the same blocks give two different measures:

- **Deficit** (capped pass): if a block disappears before the viewer finishes, the viewer gives up at the moment it disappears and moves on. `late = finish − disappear`. This answers *"is this slide too short?"*.
- **Overrun** (uncapped pass): the viewer is allowed to finish every block. `overrun = max(finish − disappear)`. This answers *"how much longer must the scene be?"*. It is larger than the worst deficit whenever an abandoned block let the viewer start the next block early.

`fit` uses the overrun. An earlier version used the deficit and needed three or more rounds without converging on a real composition; with the overrun it converges in one.

**Idle** is the time between the viewer finishing (capped pass) and the last block disappearing. Scenes marked `data-timing="hold"` are exempt from the idle hint.

## 4. Fit (`src/fit.js`)

For every scene: `new duration = duration + overrun + 0.3 s` if it lacks time, or `duration − (idle − 0.8 s)` if it idles for more than 2.5 s. Durations are rounded to 0.1 s, minimum 1.5 s. Scenes are then laid out in their original order, keeping the gaps between them.

The total length:

- with a trailing `data-timing="hold"` scene, that scene keeps its end and absorbs the shift, so the total stays fixed (a music track, a fixed slot);
- otherwise the root `data-duration` changes, and so does every layer that spanned the whole composition (`data-start="0"` and `data-duration` equal to the old total: backgrounds, music).

The HTML is changed only in those attributes. readpace then re-probes the new timing and repeats until nothing changes (at most three rounds).

## 5. Calibration

See [calibration.md](calibration.md).
