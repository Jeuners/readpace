# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
- Unit tests and a headless integration test.
