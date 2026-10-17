# Calibration

```bash
readpace calibrate path/to/composition   # or: npx github:Jeuners/readpace calibrate …
readpace calibration                    # show the current state
```

## Procedure

1. readpace probes the composition with the **uncalibrated** model and starts a local server on `127.0.0.1:8765` (`--port`). Your browser opens the calibration page (`--no-open` to open it yourself).
2. For each scene: <kbd>Space</kbd> starts it, it plays in real time and **holds one sampling step before its first block starts to disappear**. Press <kbd>Space</kbd> as soon as you have finished reading. <kbd>N</kbd> skips a scene, <kbd>Esc</kbd> finishes early and saves what has been measured. Scenes with `data-timing="hold"` are not asked.
3. The measured time runs from the moment the first block is readable — the same reference point as the model's read time — to your key press.

Scenes in which some block disappears before the last one appears cannot be held with all of their text on screen; they are skipped and listed. Measurements the model cannot explain (a solved scale outside 0.05–20, e.g. an accidental key press or a window left open) are dropped and reported.

Holding before the exit matters: if the slide disappeared, a slow reader would be cut off and the measurement would be a lower bound rather than a reading time.

## Result

`~/.config/readpace/calibration.json` (or `$READPACE_CALIBRATION`, or `$XDG_CONFIG_HOME/readpace/`):

```json
{
  "records": [
    { "scene": "s1_a", "factor": 1, "measured": 5.84, "predicted": 4.9, "kScene": 1.19,
      "model": { "wps": 3, "wpsHead": 3.5, "cpsMono": 15 }, "date": "2026-10-17", "project": "spf-dmarc" }
  ],
  "summary": { "k": 1.19, "iqr": [1.08, 1.31], "n": 10, "updated": "2026-10-17" }
}
```

- `kScene` is the scale at which the **simulated** read time of that scene equals the measured one (solved by bisection). A plain ratio `measured / predicted` would be biased towards 1, because waiting for staggered entrances is part of both and does not scale with reading speed.
- `k = median(kScene)` over scenes without a reading factor. Every reading cost is multiplied by `k`.
- `iqr` — the spread of the per-scene values. A wide IQR means the model's *mix* of rates is off, not just its scale.
- `kRepeat = median(fScene) / k` over scenes with `data-reading-factor < 1`, where `fScene` is solved against the unfactored model: the factor a repeated scene actually needs.
- Records accumulate across sessions and projects; the summary is recomputed from all of them.

`check` and `fit` print the calibration on every run (`check --json` includes it under `calibration`). After 90 days it is shown as stale and **not applied** — the defaults are used until you recalibrate. If the current reading rates (`--wps` etc.) differ from the ones the calibration was measured with, they warn. `--no-calibration` switches back to the defaults.

The calibration server listens on 127.0.0.1 only, serves nothing outside the composition folder, and accepts results only with a per-session token.

## Good practice

- Calibrate with people from the target audience, not the author.
- Use several people and several compositions; the median is robust, but not to a single reader.
- Recalibrate when the style changes (denser slides, a different language, a different platform).
