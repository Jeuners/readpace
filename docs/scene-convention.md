# Scene convention

`readpace check` works with any composition. `readpace fit` rewrites timing, and it can only do that safely if the timing lives in exactly one place.

## Rules

1. Every scene is a clip with its own `id`, `data-start` and `data-duration`.
2. The scene's animation code reads start and end **from those attributes**, never from numbers in the code.
3. Entrances are relative to the scene start `S`; the exit is relative to the scene end `E`.

```js
function win(id) {
  const el = document.getElementById(id);
  const S = parseFloat(el.dataset.start);
  return { S, E: S + parseFloat(el.dataset.duration) };
}
const OUT = 0.45; // the exit starts this long before the scene ends

let w = win("s2");
tl.to("#mail",    { opacity: 1, y: 0, duration: 0.6 }, w.S + 0.15);
tl.to("#stamp",   { opacity: 1, scale: 1, duration: 0.3 }, w.S + 1.7);
tl.to("#caption", { opacity: 1, duration: 0.5 }, w.S + 2.5);
tl.to(["#mail", "#caption"], { opacity: 0, duration: 0.4 }, w.E - OUT);
```

When `fit` lengthens this scene, the entrance choreography stays exactly the same and the reading pause before the exit grows. Following scenes move because their `data-start` moves.

## Mounting a scene group twice

To repeat a block of slides (for example a second pass with `data-reading-factor="0.6"`), give the markup an id suffix per pass and build the timeline with a function:

```js
function slides(p) {
  const $ = (id) => `#${id}_${p}`;
  let w = win("s1_" + p);
  tl.to($("title"), { opacity: 1, duration: 0.6 }, w.S + 0.2);
  tl.to($("title"), { opacity: 0, duration: 0.4 }, w.E - OUT);
  // …
}
slides("a");
slides("b");
```

`examples/spf-dmarc/index.html` is a complete composition in this style.

## Migrating an existing composition

1. Run `readpace check` and keep the output.
2. Replace absolute times with `w.S + offset` (entrances) and `w.E - offset` (exits).
3. Run `readpace check` again. The numbers must be **identical** — the refactor must not change behaviour. Only then run `fit`.
