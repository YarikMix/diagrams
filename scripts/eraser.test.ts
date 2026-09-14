import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildArgs, cliEntry, listDiagrams, nodeProbeVerdict, rendererCommand, spawnError } from "./eraser.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("listDiagrams returns only *.json, sorted, with dir prefix", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eraser-"));
  tempDirs.push(dir);
  await Bun.write(join(dir, "b.json"), "{}");
  await Bun.write(join(dir, "a.json"), "{}");
  await Bun.write(join(dir, "notes.md"), "");
  expect(listDiagrams(dir)).toEqual([join(dir, "a.json"), join(dir, "b.json")]);
});

test("buildArgs: command, then files, then extra options", () => {
  expect(buildArgs("render", ["diagrams/a.json", "diagrams/b.json"], ["-f", "html"])).toEqual([
    "render",
    "diagrams/a.json",
    "diagrams/b.json",
    "-f",
    "html",
  ]);
});

test("cliEntry resolves the installed CLI entry point", async () => {
  expect(await cliEntry()).toMatch(/diagrams-cli[\\/]dist[\\/]cli\.js$/);
});

test("rendererCommand runs the CLI under node, not under the current runtime", async () => {
  const { cmd, args } = await rendererCommand("render", ["diagrams/a.json"], ["-f", "html"]);
  expect(cmd).toBe("node");
  expect(args[0]).toBe(await cliEntry());
  expect(args.slice(1)).toEqual(["render", "diagrams/a.json", "-f", "html"]);
});

test("nodeProbeVerdict: real node answers node", () => {
  expect(nodeProbeVerdict({ exitCode: 0, stdout: "node" })).toBe("ok");
});

test("nodeProbeVerdict: bun's node shim answers bun", () => {
  expect(nodeProbeVerdict({ exitCode: 0, stdout: "bun" })).toBe("bun");
});

test("nodeProbeVerdict: no node on PATH is missing", () => {
  const missing = spawnError(Object.assign(new Error('Executable not found in $PATH: "node"'), { code: "ENOENT" }));
  expect(nodeProbeVerdict({ error: missing })).toBe("missing");
});

test("nodeProbeVerdict: other spawn errors and non-zero exits are failed", () => {
  const denied = spawnError(Object.assign(new Error("EACCES"), { code: "EACCES" }));
  expect(nodeProbeVerdict({ error: denied })).toBe("failed");
  expect(nodeProbeVerdict({ exitCode: 1, stdout: "" })).toBe("failed");
});
