// Собирает сайт Pages: main в dist/, каждую ветку origin в dist/branches/<slug>/.
// Спека: docs/superpowers/specs/2026-09-13-branch-previews-design.md §4.
// Использование: bun scripts/build-site.ts [--main-built]
// У bun нет своих API для копирования и удаления каталогов, временных каталогов и дописывания в файл: там node:fs.
import { appendFileSync, cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagramNames, renderIndex } from "./build-index.ts";

const MAIN_BRANCH = "main";
const BRANCH_STEP_TIMEOUT_MS = 5 * 60 * 1000;
const SITE_BRANCH_BUDGET_MS = 30 * 60 * 1000;
const ICON_CACHE_DIR = join(".eraser", "icons");
// Имя, которое slug ветки занимать не может: там лежит список превью.
const RESERVED_SLUGS = ["index.html"];

export interface Branch {
  name: string;
  sha: string;
}

export interface SluggedBranch extends Branch {
  slug: string;
}

export type BuildResult = { status: "ok" } | { status: "failed"; failedStep: string };
export type PreviewEntry = SluggedBranch & BuildResult;

export function branchSlug(name: string): string {
  const slug = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug && !/^\.+$/.test(slug) ? slug : "branch";
}

export function assignSlugs(branches: readonly Branch[]): SluggedBranch[] {
  const used = new Set(RESERVED_SLUGS);
  return [...branches]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, sha }) => {
      let slug = branchSlug(name);
      if (used.has(slug)) slug = `${slug}-${sha.slice(0, 7)}`;
      used.add(slug);
      return { name, sha, slug };
    });
}

// Разбирает вывод `git for-each-ref --format=%(refname:strip=3) %(objectname) refs/remotes/origin`.
export function parseBranches(output: string): Branch[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.lastIndexOf(" ");
      return { name: line.slice(0, space), sha: line.slice(space + 1) };
    })
    .filter(({ name }) => name !== "HEAD" && name !== MAIN_BRANCH);
}

// Аргументы git fetch: --depth=1 только для неглубокого клона, чтобы локальный запуск не обрезал историю.
export function fetchArgs(shallow: boolean): string[] {
  return ["fetch", ...(shallow ? ["--depth=1"] : []), "--no-tags", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPreviewsIndex(entries: readonly PreviewEntry[]): string {
  const list =
    entries.length === 0
      ? "  <p>Других веток нет.</p>"
      : [
          "  <ul>",
          ...entries.map((entry) => {
            const name = escapeHtml(entry.name);
            const sha = escapeHtml(entry.sha.slice(0, 7));
            const title =
              entry.status === "ok"
                ? `<a href="${escapeHtml(entry.slug)}/">${name}</a>`
                : `${name} (не собралась: ${escapeHtml(entry.failedStep)})`;
            return `    <li>${title} <code>${sha}</code></li>`;
          }),
          "  </ul>",
        ].join("\n");
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Превью веток</title>
  <style>
    body { margin: 0; padding: 24px; font: 16px/1.5 system-ui, sans-serif; background: #fafafa; color: #111; }
    h1 { margin: 0 0 24px; }
    li { margin: 8px 0; }
    code { color: #555; }
  </style>
</head>
<body>
  <p><a href="../">Диаграммы main</a></p>
  <h1>Превью веток</h1>
${list}
</body>
</html>
`;
}

export function renderSummary(entries: readonly PreviewEntry[]): string {
  const lines = entries.map((entry) =>
    entry.status === "ok"
      ? `- \`${entry.name}\`: branches/${entry.slug}/`
      : `- \`${entry.name}\`: не собралась на шаге ${entry.failedStep}`,
  );
  return ["### Превью веток", "", ...(lines.length ? lines : ["Других веток нет."]), ""].join("\n");
}

type Outcome = "ok" | "failed" | "timeout";

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Возвращает "ok", "failed" или "timeout". Отсутствующая программа в bun приходит исключением.
function run(cmd: string[], options: { cwd?: string; timeout?: number } = {}): Outcome {
  try {
    const result = Bun.spawnSync(cmd, { stdio: ["inherit", "inherit", "inherit"], killSignal: "SIGKILL", ...options });
    if (result.exitedDueToTimeout) {
      console.error(`${cmd.join(" ")}: timed out`);
      return "timeout";
    }
    return result.exitCode === 0 ? "ok" : "failed";
  } catch (error) {
    console.error(`${cmd.join(" ")}: ${errorMessage(error)}`);
    return "failed";
  }
}

// Запускает git и возвращает stdout, или null и печатает причину.
function gitOutput(args: string[]): string | null {
  try {
    const result = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode === 0) return result.stdout.toString();
    console.error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
    return null;
  } catch (error) {
    console.error(`git ${args.join(" ")}: ${errorMessage(error)}`);
    return null;
  }
}

function stepFailure(step: string, outcome: Outcome): BuildResult {
  return { status: "failed", failedStep: outcome === "timeout" ? `${step} (timeout)` : step };
}

function buildBranch(branch: SluggedBranch, tmpRoot: string): BuildResult {
  const dir = join(tmpRoot, branch.slug);
  const worktreeOutcome = run(["git", "worktree", "add", "--detach", dir, branch.sha]);
  if (worktreeOutcome !== "ok") {
    return stepFailure("worktree", worktreeOutcome);
  }
  try {
    const options = { cwd: dir, timeout: BRANCH_STEP_TIMEOUT_MS };
    const installOutcome = run(["bun", "install", "--frozen-lockfile"], options);
    if (installOutcome !== "ok") return stepFailure("bun install", installOutcome);
    // Кэш иконок основной сборки: ветке не нужно заново качать те же SVG.
    if (existsSync(ICON_CACHE_DIR)) {
      try {
        cpSync(ICON_CACHE_DIR, join(dir, ICON_CACHE_DIR), { recursive: true });
      } catch (error) {
        console.error(`site: icon cache not copied for ${branch.name}: ${errorMessage(error)}`);
      }
    }
    const buildOutcome = run(["bun", "run", "build"], options);
    if (buildOutcome !== "ok") return stepFailure("bun run build", buildOutcome);
    if (!existsSync(join(dir, "dist", "index.html"))) return { status: "failed", failedStep: "dist" };
    try {
      cpSync(join(dir, "dist"), join("dist", "branches", branch.slug), { recursive: true });
    } catch (error) {
      console.error(`site: copying ${branch.name} failed: ${errorMessage(error)}`);
      return { status: "failed", failedStep: "copy" };
    }
    return { status: "ok" };
  } finally {
    run(["git", "worktree", "remove", "--force", dir]);
  }
}

async function main(argv: string[]): Promise<number> {
  const started = Date.now();
  if (argv.includes("--main-built")) {
    if (!existsSync(join("dist", "index.html"))) {
      console.error("site: --main-built given but dist/index.html is missing");
      return 1;
    }
  } else if (run(["bun", "run", "build"]) !== "ok") {
    console.error("site: main build failed");
    return 1;
  }
  const shallow = gitOutput(["rev-parse", "--is-shallow-repository"])?.trim() === "true";
  if (run(["git", ...fetchArgs(shallow)]) !== "ok") {
    console.error("site: git fetch failed");
    return 1;
  }
  const refs = gitOutput(["for-each-ref", "--format=%(refname:strip=3) %(objectname)", "refs/remotes/origin"]);
  if (refs === null) {
    console.error("site: git for-each-ref failed");
    return 1;
  }
  const branches = assignSlugs(parseBranches(refs));
  const previewsDir = join("dist", "branches");
  rmSync(previewsDir, { recursive: true, force: true });

  const tmpRoot = mkdtempSync(join(tmpdir(), "diagrams-previews-"));
  const entries: PreviewEntry[] = [];
  try {
    for (const branch of branches) {
      if (Date.now() - started > SITE_BRANCH_BUDGET_MS) {
        console.error(`site: time budget exhausted, skipping ${branch.name}`);
        entries.push({ ...branch, status: "failed", failedStep: "time budget" });
        continue;
      }
      console.error(`site: building ${branch.name} into branches/${branch.slug}/`);
      entries.push({ ...branch, ...buildBranch(branch, tmpRoot) });
    }
  } finally {
    run(["git", "worktree", "prune"]);
    try {
      rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.error(`site: temp dir not removed: ${errorMessage(error)}`);
    }
  }

  await Bun.write(join(previewsDir, "index.html"), renderPreviewsIndex(entries));
  await Bun.write(join("dist", "index.html"), renderIndex(diagramNames(), { previewsHref: "branches/" }));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderSummary(entries));
  }
  const built = entries.filter((entry) => entry.status === "ok").length;
  console.error(`site: ${built}/${entries.length} branch previews built`);
  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
