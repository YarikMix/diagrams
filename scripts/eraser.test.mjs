import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDiagrams, buildArgs, cliEntry } from "./eraser.mjs";

test("listDiagrams returns only *.json, sorted, with dir prefix", () => {
  const dir = mkdtempSync(join(tmpdir(), "eraser-"));
  writeFileSync(join(dir, "b.json"), "{}");
  writeFileSync(join(dir, "a.json"), "{}");
  writeFileSync(join(dir, "notes.md"), "");
  assert.deepEqual(listDiagrams(dir), [join(dir, "a.json"), join(dir, "b.json")]);
});

test("buildArgs: command, then files, then extra options", () => {
  assert.deepEqual(
    buildArgs("render", ["diagrams/a.json", "diagrams/b.json"], ["-f", "html"]),
    ["render", "diagrams/a.json", "diagrams/b.json", "-f", "html"],
  );
});

test("cliEntry resolves the installed CLI entry point", () => {
  assert.match(cliEntry(), /diagrams-cli[\\/]dist[\\/]cli\.js$/);
});
