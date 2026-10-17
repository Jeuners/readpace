import { test } from "node:test";
import assert from "node:assert/strict";
import { injectShim, RUNTIME_SHIM } from "../src/runtime-shim.js";

const at = (html) => injectShim(html).indexOf(RUNTIME_SHIM);

test("after <head>", () => {
  const h = "<!DOCTYPE html><html><head><title>x</title></head><body></body></html>";
  assert.equal(at(h), h.indexOf("<head>") + "<head>".length + "<script>".length);
});

test("<header> is not mistaken for <head>", () => {
  const h = "<!DOCTYPE html><html><body><header>Top</header><script>window.__timelines.m = 1</script></body></html>";
  const out = injectShim(h);
  assert.ok(out.indexOf(RUNTIME_SHIM) < out.indexOf("<header>"));
  assert.ok(out.indexOf(RUNTIME_SHIM) > out.indexOf("<html>"));
});

test("never before the doctype (would trigger quirks mode)", () => {
  const h = "<!DOCTYPE html><body><p>no html, no head</p></body>";
  assert.ok(injectShim(h).startsWith("<!DOCTYPE html><script>"));
});
