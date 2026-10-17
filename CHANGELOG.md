# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] — 2026-10-17

Measurements change in this release: readable windows are now based on the text
a block actually shows, so numbers can shift (usually towards *more* needed
time for decode/scramble effects).

### Changed
- Readability is decided per block by `src/text.js` (`normalizeBlock`, exported):
  the non-empty text that stays on screen longest in one stretch (ties: later),
  with a single trailing cursor removed only where it blinks. Previously a
  block was readable once it reached its maximum length.
- `probe()` samples are now `[t, visible, text]` (were `[t, visible, length]`),
  and `readyWindow(samples, text, step)` takes the text instead of a length.
- The readable window is the longest stable stretch, not the first.

### Added
- `check --json`: each block carries its selector (`block`), so tools can map
  results back to the DOM.

### Fixed
- Compositions with `<video>`/`<audio>` no longer time out: the probe waits for
  `load` and web fonts instead of network idle.
- Compositions written for the HyperFrames runtime (no own
  `window.__timelines = {}`, `__hyperframes.getVariables()`) now load: readpace
  provides a minimal runtime shim, also on the calibration page.
- Text marked `aria-hidden="true"` (decorative duplicates) is no longer counted.
- Scramble/decode effects were counted as readable while still scrambled (too
  optimistic); a blinking cursor cut readable windows short; flickering states
  produced tiny early windows; a glitch or backspace right before the exit
  replaced the text being measured.
- Web fonts can delay the probe by at most 10 s; navigation timeout is 60 s.
- The runtime shim is inserted after `<head>` (not `<header>`), else after
  `<html>` or the doctype, never before it (quirks mode); `getVariables()`
  merges every `data-composition-variables` declaration.

## [0.1.0] — 2026-10-17

First public version, extracted from a production video pipeline.

### Added
- `readpace check`: headless probe of HyperFrames compositions, reading-block
  detection, viewer simulation with deficit, overrun and idle per scene.
- `readpace fit`: re-times scenes from the overrun; keeps a trailing
  `data-timing="hold"` scene's end, otherwise resizes the composition and its
  full-length layers. Converges in one round on the bundled example.
- `readpace calibrate` / `readpace calibration`: browser-based calibration with
  hold-before-exit, median factor *k* with IQR, sample size and age; repeat
  factor suggestion.
- `data-reading-factor` and `data-timing="hold"` attributes.
- Example composition `examples/spf-dmarc` (hand-timed, five scenes).
- Calibration solves *k* per scene from the viewer simulation, skips scenes that
  cannot be held with all text visible, drops implausible measurements, stores
  the reading rates used, and ignores calibrations older than 90 days; results
  need a per-session token.
- Unit tests and headless integration tests.

[Unreleased]: https://github.com/Jeuners/readpace/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Jeuners/readpace/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Jeuners/readpace/releases/tag/v0.1.0
