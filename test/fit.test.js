import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS } from "../src/model.js";
import { FIT_DEFAULTS, apply, changed, compositionDuration, plan, sceneTag } from "../src/fit.js";

const html = (holdEnd = false) => `
<div id="root" data-composition-id="main" data-start="0" data-duration="20">
  <div id="bg" class="clip" data-start="0" data-duration="20"></div>
  <audio id="music" data-duration="20" data-start="0"></audio>
  <div id="s1" class="clip scene" data-start="0" data-duration="5"></div>
  <div id="s2" class="clip scene" data-start="5" data-duration="5"></div>
  <div id="s3" class="clip scene" ${holdEnd ? 'data-timing="hold" ' : ""}data-start="10" data-duration="10"></div>
</div>`;

const scene = (id, over = {}) => ({ scene: id, overrun: 0, idle: 0, ...over });
const analysis = (...scenes) => ({ scenes });

test("sceneTag reads start and duration", () => {
  const t = sceneTag(html(), "s2");
  assert.equal(t.start, 5);
  assert.equal(t.dur, 5);
});

test("sceneTag fails loudly for unknown scenes", () => {
  assert.throws(() => sceneTag(html(), "nope"), /not found/);
});

test("an overrun lengthens the scene by overrun + margin and shifts the rest", () => {
  const p = plan(html(), analysis(scene("s1", { overrun: 2 }), scene("s2"), scene("s3")), DEFAULTS);
  const [s1, s2, s3] = p.scenes;
  assert.equal(s1.newDur, 5 + 2 + FIT_DEFAULTS.margin);
  assert.equal(s2.newStart, 7.3);
  assert.equal(s3.newStart, 12.3);
  assert.deepEqual(p.total, { from: 20, to: 22.3 });
});

test("idle scenes shrink to keepIdle", () => {
  const p = plan(html(), analysis(scene("s1"), scene("s2", { idle: 4 }), scene("s3")), DEFAULTS);
  assert.equal(p.scenes[1].newDur, 1.8); // 5 - (4 - keepIdle 0.8)
});

test("a trailing hold scene absorbs the shift; the total stays fixed", () => {
  const p = plan(html(true), analysis(scene("s1", { overrun: 2 }), scene("s2"), scene("s3")), DEFAULTS);
  const s3 = p.scenes[2];
  assert.equal(s3.newStart, 12.3);
  assert.equal(s3.newStart + s3.newDur, 20);
  assert.deepEqual(p.total, { from: 20, to: 20 });
});

test("apply rewrites scenes, the root and full-length layers", () => {
  const h = html();
  const p = plan(h, analysis(scene("s1", { overrun: 2 }), scene("s2"), scene("s3")), DEFAULTS);
  const out = apply(h, p);
  assert.equal(compositionDuration(out), 22.3);
  assert.match(out, /id="bg" class="clip" data-start="0" data-duration="22.3"/);
  assert.match(out, /id="music" data-duration="22.3" data-start="0"/);
  assert.match(out, /id="s1" class="clip scene" data-start="0" data-duration="7.3"/);
  assert.match(out, /id="s2" class="clip scene" data-start="7.3" data-duration="5"/);
});

test("nothing to do: changed() is empty and the total is unchanged", () => {
  const p = plan(html(), analysis(scene("s1"), scene("s2"), scene("s3")), DEFAULTS);
  assert.equal(changed(p).length, 0);
  assert.equal(apply(html(), p), html());
});
