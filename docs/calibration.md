# Calibration

```bash
npx readpace calibrate path/to/composition
npx readpace calibration          # show the current state
```

## Procedure

1. readpace probes the composition with the **uncalibrated** model and starts a local server on `127.0.0.1:8765` (`--port`). Your browser opens the calibration page (`--no-open` to open it yourself).
2. For each scene: <kbd>Space</kbd> starts it, it plays in real time and **holds just before its exit**. Press <kbd>Space</kbd> as soon as you have finished reading. <kbd>N</kbd> skips a scene, <kbd>Esc</kbd> finishes early and saves what has been measured. Scenes with `data-timing="hold"` are not asked.
3. The measured time runs from the moment the first block is readable — the same reference point as the model's read time — to your key press.

Holding before the exit matters: if the slide disappeared, a slow reader would be cut off and the measurement would be a lower bound rather than a reading time.

## Result

`~/.config/readpace/calibration.json` (or `$READPACE_CALIBRATION`, or `$XDG_CONFIG_HOME/readpace/`):

```json
{
  "records": [
    { "scene": "s1_a", "factor": 1, "measured": 5.84, "predicted": 4.9, "predictedUnfactored": 4.9,
      "date": "2026-10-17", "project": "spf-dmarc" }
  ],
  "summary": { "k": 1.19, "iqr": [1.08, 1.31], "n": 10, "updated": "2026-10-17" }
}
```

- `k = median(measured / predicted)` over scenes without a reading factor. Every reading cost is multiplied by `k`.
- `iqr` — the spread of the ratios. A wide IQR means the model's *mix* of rates is off, not just its scale.
- `kRepeat = median(measured / predictedUnfactored) / k` over scenes with `data-reading-factor < 1`: the factor a repeated scene actually needs.
- Records accumulate across sessions and projects; the summary is recomputed from all of them.

`check` and `fit` print the calibration they use on every run, and flag it as stale after 90 days. `--no-calibration` switches back to the defaults.

## Good practice

- Calibrate with people from the target audience, not the author.
- Use several people and several compositions; the median is robust, but not to a single reader.
- Recalibrate when the style changes (denser slides, a different language, a different platform).
