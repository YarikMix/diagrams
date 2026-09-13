import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagramNames, renderIndex } from "./build-index.mjs";

test("diagramNames: basenames of *.json without extension, sorted", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "index-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "cd.json"), "{}");
  writeFileSync(join(dir, "ci.json"), "{}");
  writeFileSync(join(dir, "README.md"), "");
  assert.deepEqual(diagramNames(dir), ["cd", "ci"]);
});

test("renderIndex: one card per diagram with html link, png link and preview", () => {
  const html = renderIndex(["deployment", "ci"]);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<h2>deployment<\/h2>/);
  assert.match(html, /href="deployment\.html"/);
  assert.match(html, /href="deployment\.png"/);
  assert.match(html, /<img src="deployment\.png"/);
  assert.match(html, /<h2>ci<\/h2>/);
  assert.doesNotMatch(html, /<link|<script/);
});
