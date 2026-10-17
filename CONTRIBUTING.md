# Contributing

Thanks for looking into readpace.

## Setup

```bash
npm install
npm test
```

The integration test needs a Chrome/Chromium binary (see the README) and
network access for the GSAP CDN used by the example; it is skipped when no
browser is found.

## Guidelines

- **Measure before and after.** Changes to the probe or the model must state
  their effect on `npm run example:check`. A refactor must leave the numbers
  identical.
- **Keep the model honest.** New defaults need a source or a calibration run;
  say which. Uncertainty is reported, not hidden.
- **No new runtime dependencies** without a strong reason. readpace should stay
  a small tool next to HyperFrames, not a framework.
- Plain ESM, Node ≥ 20, no build step. Match the existing style.
- One topic per pull request; add a line to `CHANGELOG.md` under *Unreleased*.

## Good first issues

- Reading cost for images and icons.
- Loading sub-compositions (`data-composition-src`) into the probe.
- Optional snapping of scene boundaries to a music beat grid.
- Separate calibrated rates for body text, headlines and code once enough data exists.
