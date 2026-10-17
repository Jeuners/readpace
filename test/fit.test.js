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

const layerClips = [
  { id: "bg", start: 0, duration: 20, hasText: false }, { id: "music", start: 0, duration: 20, hasText: false },
  { id: "s1", start: 0, duration: 5, hasText: true }, { id: "s2", start: 5, duration: 5, hasText: true },
  { id: "s3", start: 10, duration: 10, hasText: true },
];

test("apply rewrites scenes, the root and full-length layers", () => {
  const h = html();
  const p = plan(h, analysis(scene("s1", { overrun: 2 }), scene("s2"), scene("s3")), DEFAULTS, undefined, layerClips);
  assert.deepEqual(p.layers, ["bg", "music"]);
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

// --- regressions from review ---

const clip = (id, start, duration, extra = {}) => ({ id, start, duration, hasText: true, hold: false, ...extra });

test("textless scenes are shifted along instead of being overlapped", () => {
  const h = `<div data-composition-id="m" data-start="0" data-duration="15">
    <div id="s1" data-start="0" data-duration="5"></div>
    <div id="img" data-start="5" data-duration="5"></div>
    <div id="s3" data-start="10" data-duration="5"></div></div>`;
  const p = plan(h, analysis(scene("s1", { overrun: 2 }), scene("s3")), DEFAULTS, undefined,
    [clip("s1", 0, 5), clip("img", 5, 5, { hasText: false }), clip("s3", 10, 5)]);
  assert.deepEqual(p.scenes.map((x) => [x.scene, x.newStart, x.newDur]), [["s1", 0, 7.3], ["img", 7.3, 5], ["s3", 12.3, 5]]);
});

test("full-length layers are not scenes; overlapping clips are rejected", () => {
  const h = `<div data-composition-id="m" data-start="0" data-duration="10">
    <div id="logo" data-start="0" data-duration="10"></div>
    <div id="s1" data-start="0" data-duration="5"></div>
    <div id="cap" data-start="3" data-duration="4"></div>
    <div id="s2" data-start="5" data-duration="5"></div></div>`;
  const clips = [clip("logo", 0, 10, { hasText: false }), clip("s1", 0, 5), clip("cap", 3, 4), clip("s2", 5, 5)];
  assert.throws(() => plan(h, analysis(scene("s1"), scene("s2")), DEFAULTS, undefined, clips), /overlap/);
  const ok = plan(h, analysis(scene("s1"), scene("s2")), DEFAULTS, undefined, clips.filter((c) => c.id !== "cap"));
  assert.deepEqual(ok.scenes.map((x) => x.scene), ["s1", "s2"]);
  assert.deepEqual(ok.layers, ["logo"]);
});

test("a hold scene that would turn negative is an error, not a negative duration", () => {
  const h = `<div data-composition-id="m" data-start="0" data-duration="12">
    <div id="s1" data-start="0" data-duration="10"></div>
    <div id="end" data-timing="hold" data-start="10" data-duration="2"></div></div>`;
  assert.throws(() => plan(h, analysis(scene("s1", { overrun: 4 }), scene("end")), DEFAULTS), /cannot absorb/);
});

test("sceneTag ignores comments and data-id look-alikes", () => {
  const h = `<!-- <div id="s1" data-start="9" data-duration="9"> -->
    <div data-id="s1" data-start="7" data-duration="7"></div>
    <div id="s1" data-start="1" data-duration="2"></div>`;
  const t = sceneTag(h, "s1");
  assert.equal(t.start, 1);
  assert.equal(t.dur, 2);
});

test("full-length layers are matched numerically and with either quote style", () => {
  const h = `<div data-composition-id="m" data-start="0" data-duration="10">
    <div id="bg" data-start='0' data-duration="10.0"></div>
    <div id="s1" data-start="0" data-duration="5"></div>
    <div id="s2" data-start="5" data-duration="5"></div></div>`;
  const out = apply(h, plan(h, analysis(scene("s1", { overrun: 1 }), scene("s2")), DEFAULTS, undefined,
    [clip("bg", 0, 10, { hasText: false }), clip("s1", 0, 5), clip("s2", 5, 5)]));
  assert.match(out, /id="bg" data-start='0' data-duration="11.3"/);
  assert.equal(compositionDuration(out), 11.3);
});

test("a single full-length scene with text is a scene, not a layer", () => {
  const h = `<div data-composition-id="m" data-start="0" data-duration="5"><div id="s1" data-start="0" data-duration="5"></div></div>`;
  const p = plan(h, analysis(scene("s1", { overrun: 1 })), DEFAULTS, undefined, [clip("s1", 0, 5)]);
  assert.equal(p.scenes[0].newDur, 6.3);
  assert.equal(p.total.to, 6.3);
});

test("only the first data-composition-id is the root; sub-compositions stop fit", () => {
  const h = `<div data-composition-id="m" data-start="0" data-duration="10">
    <div id="intro" data-composition-id="intro" data-start="0" data-duration="5"></div>
    <div id="s2" data-start="5" data-duration="5"></div></div>`;
  assert.equal(compositionDuration(h), 10);
  const withSrc = h.replace('data-composition-id="intro"', 'data-composition-id="intro" data-composition-src="c/intro.html"');
  assert.throws(() => plan(withSrc, analysis(scene("s2")), DEFAULTS), /sub-compositions/);
});

test("attributes may be unquoted or spaced; non-numeric values are rejected", () => {
  const h = `<div data-composition-id=m data-start = "0" data-duration=8><div id=s1 data-start= '0' data-duration = 8></div></div>`;
  assert.equal(compositionDuration(h), 8);
  const t = sceneTag(h, "s1");
  assert.equal(t.dur, 8);
  const out = apply(h, plan(h, analysis(scene("s1", { overrun: 1 })), DEFAULTS, undefined, [clip("s1", 0, 8)]));
  assert.match(out, /id=s1 data-start="0" data-duration="9.3"/);
  assert.throws(() => sceneTag(h.replace("data-duration = 8", 'data-duration="4s"'), "s1"), /plain number/);
});

