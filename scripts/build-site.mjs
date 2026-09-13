// Собирает сайт Pages: main в dist/, каждую ветку origin в dist/branches/<slug>/.
// Спека: docs/superpowers/specs/2026-09-13-branch-previews-design.md §4.
// Использование: bun scripts/build-site.mjs
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diagramNames, renderIndex } from "./build-index.mjs";

const MAIN_BRANCH = "main";
const BRANCH_STEP_TIMEOUT_MS = 5 * 60 * 1000;
const ICON_CACHE_DIR = join(".eraser", "icons");
// Имя, которое slug ветки занимать не может: там лежит список превью.
const RESERVED_SLUGS = ["index.html"];

export function branchSlug(name) {
  const slug = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "branch";
}

export function assignSlugs(branches) {
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
export function parseBranches(output) {
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

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPreviewsIndex(entries) {
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

export function renderSummary(entries) {
  const lines = entries.map((entry) =>
    entry.status === "ok"
      ? `- \`${entry.name}\`: branches/${entry.slug}/`
      : `- \`${entry.name}\`: не собралась на шаге ${entry.failedStep}`,
  );
  return ["### Превью веток", "", ...(lines.length ? lines : ["Других веток нет."]), ""].join("\n");
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...options });
  if (result.error) {
    console.error(`${cmd} ${args.join(" ")}: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

function buildBranch(branch, tmpRoot) {
  const dir = join(tmpRoot, branch.slug);
  if (!run("git", ["worktree", "add", "--detach", dir, branch.sha])) {
    return { status: "failed", failedStep: "worktree" };
  }
  try {
    const options = { cwd: dir, timeout: BRANCH_STEP_TIMEOUT_MS };
    if (!run("bun", ["install", "--frozen-lockfile"], options)) return { status: "failed", failedStep: "bun install" };
    // Кэш иконок основной сборки: ветке не нужно заново качать те же SVG.
    if (existsSync(ICON_CACHE_DIR)) cpSync(ICON_CACHE_DIR, join(dir, ICON_CACHE_DIR), { recursive: true });
    if (!run("bun", ["run", "build"], options)) return { status: "failed", failedStep: "bun run build" };
    if (!existsSync(join(dir, "dist", "index.html"))) return { status: "failed", failedStep: "dist" };
    cpSync(join(dir, "dist"), join("dist", "branches", branch.slug), { recursive: true });
    return { status: "ok" };
  } finally {
    run("git", ["worktree", "remove", "--force", dir]);
  }
}

function main() {
  if (!run("bun", ["run", "build"])) {
    console.error("site: main build failed");
    return 1;
  }
  if (!run("git", ["fetch", "--depth=1", "--no-tags", "origin", "+refs/heads/*:refs/remotes/origin/*"])) {
    console.error("site: git fetch failed");
    return 1;
  }
  const refs = spawnSync(
    "git",
    ["for-each-ref", "--format=%(refname:strip=3) %(objectname)", "refs/remotes/origin"],
    { encoding: "utf8" },
  );
  if (refs.error || refs.status !== 0) {
    console.error(`site: git for-each-ref failed: ${refs.error?.message ?? refs.stderr}`);
    return 1;
  }
  const branches = assignSlugs(parseBranches(refs.stdout));
  const previewsDir = join("dist", "branches");
  rmSync(previewsDir, { recursive: true, force: true });
  mkdirSync(previewsDir, { recursive: true });

  const tmpRoot = mkdtempSync(join(tmpdir(), "diagrams-previews-"));
  const entries = [];
  try {
    for (const branch of branches) {
      console.error(`site: building ${branch.name} into branches/${branch.slug}/`);
      entries.push({ ...branch, ...buildBranch(branch, tmpRoot) });
    }
  } finally {
    run("git", ["worktree", "prune"]);
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  writeFileSync(join(previewsDir, "index.html"), renderPreviewsIndex(entries));
  writeFileSync(join("dist", "index.html"), renderIndex(diagramNames(), { previewsHref: "branches/" }));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderSummary(entries));
  }
  const built = entries.filter((entry) => entry.status === "ok").length;
  console.error(`site: ${built}/${entries.length} branch previews built`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
