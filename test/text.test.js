import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBlock } from "../src/text.js";

const seq = (...texts) => texts.map((t, i) => [+(i * 0.1).toFixed(1), t === null ? 0 : 1, t ?? ""]);

test("typewriter: the typed text, not a prefix", () => {
  assert.equal(normalizeBlock(seq("", "He", "Hell", "Hello", "Hello", "Hello")).text, "Hello");
});

test("blinking cursor is removed where the text also shows without it", () => {
  const n = normalizeBlock(seq("Go_", "Go", "Go_", "Go", "Go_"));
  assert.equal(n.text, "Go");
  assert.deepEqual(n.samples.map((s) => s[2]), ["Go", "Go", "Go", "Go", "Go"]);
});

test("a trailing underscore that never blinks is content", () => {
  assert.equal(normalizeBlock(seq("snake_", "snake_", "snake_")).text, "snake_");
  assert.equal(normalizeBlock(seq("Name: ____", "Name: ____")).text, "Name: ____");
});

test("decode: scrambled glyphs of full length are not the text", () => {
  assert.equal(normalizeBlock(seq("x#9k", "W#9k", "Wake", "Wake", "Wake")).text, "Wake");
});

test("a glitch right before the exit does not replace the text", () => {
  assert.equal(normalizeBlock(seq("Hello", "Hello", "Hello", "Hello", "#@%&!")).text, "Hello");
});

test("backspacing at the end keeps the full text", () => {
  assert.equal(normalizeBlock(seq("Hello", "Hello", "Hello", "Hell", "He", "_")).text, "Hello");
});

test("flicker: the state that stays longest wins", () => {
  assert.equal(normalizeBlock(seq("ONLINE", "ONLINE", "DOWN", "ONLINE", "DOWN", "DOWN", "DOWN")).text, "DOWN");
});

test("ties go to the later text", () => {
  assert.equal(normalizeBlock(seq("First", "First", "Second", "Second")).text, "Second");
});

test("hidden samples do not count", () => {
  assert.equal(normalizeBlock(seq(null, null, "Shown", null)).text, "Shown");
});
