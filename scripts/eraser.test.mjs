import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDiagrams, buildArgs, cliEntry, rendererCommand, nodeProbeVerdict } from "./eraser.mjs";

test("listDiagrams returns only *.json, sorted, with dir prefix", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "eraser-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
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

test("rendererCommand runs the CLI under node, not under the current runtime", () => {
  const { cmd, args } = rendererCommand("render", ["diagrams/a.json"], ["-f", "html"]);
  assert.equal(cmd, "node");
  assert.equal(args[0], cliEntry());
  assert.deepEqual(args.slice(1), ["render", "diagrams/a.json", "-f", "html"]);
});

test("nodeProbeVerdict: real node answers node", () => {
  assert.equal(nodeProbeVerdict({ status: 0, stdout: "node" }), "ok");
});

test("nodeProbeVerdict: bun's node shim answers bun", () => {
  assert.equal(nodeProbeVerdict({ status: 0, stdout: "bun" }), "bun");
});

test("nodeProbeVerdict: no node on PATH is missing", () => {
  assert.equal(nodeProbeVerdict({ error: Object.assign(new Error("spawn node ENOENT"), { code: "ENOENT" }) }), "missing");
});

test("nodeProbeVerdict: other spawn errors and non-zero exits are failed", () => {
  assert.equal(nodeProbeVerdict({ error: Object.assign(new Error("EACCES"), { code: "EACCES" }) }), "failed");
  assert.equal(nodeProbeVerdict({ status: 1, stdout: "" }), "failed");
});
