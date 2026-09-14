import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagramNames, renderIndex } from "./build-index.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("diagramNames: basenames of *.json without extension, sorted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "index-"));
  tempDirs.push(dir);
  await Bun.write(join(dir, "cd.json"), "{}");
  await Bun.write(join(dir, "ci.json"), "{}");
  await Bun.write(join(dir, "README.md"), "");
  expect(diagramNames(dir)).toEqual(["cd", "ci"]);
});

test("renderIndex: one card per diagram with html link, png link and preview", () => {
  const html = renderIndex(["deployment", "ci"]);
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toMatch(/<h2>deployment<\/h2>/);
  expect(html).toMatch(/href="deployment\.html"/);
  expect(html).toMatch(/href="deployment\.png"/);
  expect(html).toMatch(/<img src="deployment\.png"/);
  expect(html).toMatch(/<h2>ci<\/h2>/);
  expect(html).not.toMatch(/<link|<script/);
});

test("renderIndex: links branch previews only when previewsHref is given", () => {
  expect(renderIndex(["ci"], { previewsHref: "branches/" })).toMatch(/<a href="branches\/">Превью веток<\/a>/);
  expect(renderIndex(["ci"])).not.toMatch(/Превью веток/);
});
