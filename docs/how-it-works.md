# How readpace works

## 1. Probe (`src/probe.js`)

The composition's `index.html` is opened from disk in headless Chromium at 1920×1080. Before the page's own scripts run, readpace provides the globals the HyperFrames runtime would (`window.__timelines`, and `window.__hyperframes.getVariables()` returning the defaults declared in `data-composition-variables`), so compositions written for the runtime load as they would in Studio. It waits for the `load` event — not network idle, which `<video>`/`<audio>` never reach — and for web fonts, then for `window.__timelines`, and then, for t = 0, 0.1, 0.2 … up to the root `data-duration`, seeks **every** registered timeline to t and inspects the page.

**Reading blocks.** For every non-empty text node, readpace walks up to the nearest ancestor whose computed `display` is not `inline*`. That element is one reading block, so `<em>`, `<b>` and `<span>` are read together with their surrounding line. Text inside `<script>`, `<style>`, `<svg>`, `<template>` and anything marked `aria-hidden="true"` (decorative copies such as glitch layers) is ignored. Blocks are keyed by `#id` or a short CSS path, so they can appear, change and disappear over time.

**Readable.** A block is readable at time t when

- every enclosing element with `data-start` is active (`start ≤ t < start + duration`) — this mirrors the HyperFrames runtime, which hides inactive clips,
- the product of `opacity` along its ancestor chain is ≥ 0.85, and nothing in the chain is `display: none` or `visibility: hidden`,
- its bounding box intersects the frame, and
- it shows **its text**: the non-empty text that stays on screen longest in one stretch (ties: the later one). Typewriter effects count once typed, scramble/decode effects once legible (they have full length long before that), and a glitch or backspace right before the exit does not replace the text. A single trailing cursor (`_ | ▌ █ ▏`) is ignored where it blinks — that is, where the same text also appears without it — so content like `snake_case_` is kept.

If a block is readable in several stretches, its readable window is the **longest** one. One phase per block: a block that shows two different messages, or appears twice, is measured on its longest phase only (see `src/text.js`).

A block's text is its **own** text, in document order: inline descendants (including `inline-block`, e.g. per-character SplitText spans) are joined without extra spaces, while `<br>` and nested blocks act as word boundaries. Text of nested blocks is counted once, in the nested block.

The probe returns, per block, its metadata (scene, font size, monospace or not, reading factor, timing mode, full text) and a list of `[t, readable, textLength]` samples, plus the top-level clips of the root and the number of sub-compositions (which are reported as not measured).

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

`fit` uses the overrun: lengthening a scene by its overrun is enough for every block in it, whereas lengthening by the deficit leaves the blocks after an abandoned one short and needs further rounds.

**Idle** is the time between the viewer finishing (capped pass) and the last block disappearing. Scenes marked `data-timing="hold"` are exempt from the idle hint.

## 4. Fit (`src/fit.js`)

`fit` works on the **outermost clips** under the root — the same units `check` calls scenes (a wrapper element without `data-start` is fine). Full-length clips *without text of their own* (`data-start` 0, `data-duration` equal to the total: backgrounds, music) are layers; they need an `id` so they can be resized with the composition. Every other outermost clip must follow the previous one — overlapping clips stop `fit` with an error. Compositions with sub-compositions (`data-composition-src`) are rejected for now.

For every scene: `new duration = duration + overrun + 0.3 s` if it lacks time, or `duration − (idle − 0.8 s)` if it idles for more than 2.5 s. Durations are rounded to 0.1 s, minimum 1.5 s. Clips without text keep their duration but move with the rest. Scenes are then laid out in their original order, keeping the gaps between them.

The total length:

- with a trailing `data-timing="hold"` scene, that scene keeps its end and absorbs the shift, so the total stays fixed (a music track, a fixed slot). If it would shrink below 1.5 s, `fit` stops with an error instead;
- otherwise the root `data-duration` (the first element with `data-composition-id`) changes, and so do the layers.

The HTML is changed only in those attributes; comments, scripts and styles are ignored when looking them up, attributes may be quoted, single-quoted or unquoted, and non-numeric values (`"4s"`) are rejected. readpace re-probes a scratch copy next to `index.html` with the new timing and repeats until nothing changes (at most three rounds, `--rounds`); if it stops before that, it says so. The original file is written only with `--write`, and an existing backup is never overwritten (`index.html.bak`, `.bak2`, …).

## 5. Calibration

See [calibration.md](calibration.md).
