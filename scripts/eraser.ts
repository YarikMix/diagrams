// Обёртка над eraser-diagrams CLI. Подставляет diagrams/*.json вместо glob,
// потому что cmd.exe на Windows glob не раскрывает, а CLI сам этого не делает.
// CLI запускается под node: под bun запуск Chrome зависает
// (docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md §2.1).
// Использование: bun scripts/eraser.ts <command> [cli options...]
import { dirname, join } from "node:path";

export const DIAGRAMS_DIR = "diagrams";

export const NODE_PROBE_ARGS = ["-e", "process.stdout.write(process.versions.bun ? 'bun' : 'node')"];

export type SpawnError = { code: string | undefined; message: string };
export type NodeProbeResult = { error: SpawnError } | { exitCode: number | null; stdout: string };
export type NodeVerdict = "ok" | "missing" | "bun" | "failed";

export function listDiagrams(dir = DIAGRAMS_DIR): string[] {
  return [...new Bun.Glob("*.json").scanSync(dir)].sort().map((name) => join(dir, name));
}

export async function cliEntry(): Promise<string> {
  const pkgPath = Bun.resolveSync("@eraserlabs/diagrams-cli/package.json", import.meta.dir);
  const pkg = (await Bun.file(pkgPath).json()) as { bin: Record<string, string> };
  const bin = pkg.bin["eraser-diagrams"];
  if (!bin) throw new Error(`no eraser-diagrams bin in ${pkgPath}`);
  return join(dirname(pkgPath), bin);
}

export function buildArgs(command: string, files: readonly string[], extra: readonly string[]): string[] {
  return [command, ...files, ...extra];
}

export async function rendererCommand(
  command: string,
  files: readonly string[],
  extra: readonly string[],
): Promise<{ cmd: string; args: string[] }> {
  return { cmd: "node", args: [await cliEntry(), ...buildArgs(command, files, extra)] };
}

// "bun" значит, что `node` в PATH это shim от bun (bun run подкладывает его, когда Node нет).
export function nodeProbeVerdict(result: NodeProbeResult): NodeVerdict {
  if ("error" in result) return result.error.code === "ENOENT" ? "missing" : "failed";
  if (result.exitCode !== 0) return "failed";
  return result.stdout === "node" ? "ok" : "bun";
}

export function spawnError(error: unknown): SpawnError {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  return { code, message: error instanceof Error ? error.message : String(error) };
}

function probeNode(): NodeProbeResult {
  try {
    const result = Bun.spawnSync(["node", ...NODE_PROBE_ARGS]);
    return { exitCode: result.exitCode, stdout: result.stdout.toString() };
  } catch (error) {
    return { error: spawnError(error) };
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...extra] = argv;
  if (!command) {
    console.error("usage: bun scripts/eraser.ts <command> [cli options...]");
    return 2;
  }
  const files = listDiagrams();
  if (files.length === 0) {
    console.error(`no *.json files in ${DIAGRAMS_DIR}/`);
    return 2;
  }
  const probe = probeNode();
  const verdict = nodeProbeVerdict(probe);
  if (verdict === "missing" || verdict === "bun") {
    const reason = verdict === "missing" ? "node not found on PATH" : "node on PATH is bun's shim, not Node";
    console.error(`${reason}: the eraser-diagrams renderer needs Node >= 22.12`);
    return 2;
  }
  if (verdict === "failed") {
    console.error("error" in probe ? probe.error.message : `node probe exited with status ${probe.exitCode}`);
    return 1;
  }
  const { cmd, args } = await rendererCommand(command, files, extra);
  try {
    const result = Bun.spawnSync([cmd, ...args], { stdio: ["inherit", "inherit", "inherit"] });
    return result.exitCode ?? 1;
  } catch (error) {
    const { code, message } = spawnError(error);
    if (code === "ENOENT") {
      console.error("node not found on PATH: the eraser-diagrams renderer needs Node >= 22.12");
      return 2;
    }
    console.error(message);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
