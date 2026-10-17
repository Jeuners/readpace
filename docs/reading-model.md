# Reading model

| Parameter | Default | CLI | Rationale |
|---|---|---|---|
| Body text | 3.0 words/s | `--wps` | Conservative on-screen reading rate for German/English text in motion. Silent reading of static prose is faster; viewers of moving slides are not. |
| Headline (≥ 72 px) | 3.5 words/s | `--wps-head` | Short, large lines are taken in faster. |
| Monospace | 15 non-space chars/s | `--cps-mono` | Roughly in line with subtitle reading-speed norms (around 17–20 chars/s, which count spaces); code and addresses are denser than prose. |
| Per block | +0.15 s, min 0.4 s | — | Eye movement to a new block; a one-word label still takes a fixation. |
| Per scene | +0.4 s | — | Orientation after a cut. |
| Error threshold | > 0.5 s late | — | Below that it is a warning. |
| Idle hint | > 2.5 s | — | After everything is read. |

`cost = max(min, base + perBlock) × data-reading-factor × k`

Words are runs of letters, digits and `@ . $ % _ -` (plus apostrophes inside a word) that contain at least one letter or digit, so `ceo@yourdomain.com` and `don't` are one word each in proportional fonts, while a stray `—`, `-` or `...` costs nothing.

## These are estimates

Every number above is an assumption. readpace says so on every run until a calibration exists, and the calibration is a single factor *k* on purpose: separate rates per text type can only be estimated once there are enough measurements with a different mix of body text, headlines and code (rule of thumb: ten or more scenes per parameter).

If your audience is known to read faster or slower — children, a technical audience, non-native speakers, a muted autoplay feed — calibrate with people from that audience, not with the author. Authors know the text and read it faster than anyone else.
