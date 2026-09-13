// Обёртка над eraser-diagrams CLI. Подставляет diagrams/*.json вместо glob,
// потому что cmd.exe на Windows glob не раскрывает, а CLI сам этого не делает.
// CLI запускается под node: под bun запуск Chrome зависает
// (docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md §2.1).
// Использование: bun scripts/eraser.mjs <command> [cli options...]
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DIAGRAMS_DIR = "diagrams";

export function listDiagrams(dir = DIAGRAMS_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dir, name));
}

export function cliEntry() {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("@eraserlabs/diagrams-cli/package.json");
  const { bin } = require(pkgPath);
  return join(dirname(pkgPath), bin["eraser-diagrams"]);
}

export function buildArgs(command, files, extra) {
  return [command, ...files, ...extra];
}

export function rendererCommand(command, files, extra) {
  return { cmd: "node", args: [cliEntry(), ...buildArgs(command, files, extra)] };
}

function main(argv) {
  const [command, ...extra] = argv;
  if (!command) {
    console.error("usage: bun scripts/eraser.mjs <command> [cli options...]");
    return 2;
  }
  const files = listDiagrams();
  if (files.length === 0) {
    console.error(`no *.json files in ${DIAGRAMS_DIR}/`);
    return 2;
  }
  const { cmd, args } = rendererCommand(command, files, extra);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    console.error("node not found on PATH: the eraser-diagrams renderer needs Node >= 22.12");
    return 2;
  }
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
