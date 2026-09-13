# Branch Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждый push в любую ветку публикует её схемы на GitHub Pages по адресу `/diagrams/branches/<slug>/`, `main` остаётся в корне, превью удалённых веток исчезают.

**Architecture:** Новый скрипт `scripts/build-site.mjs` собирает `main` в `dist/`, затем каждую ветку `origin` её собственными скриптами во временном `git worktree` и копирует результат в `dist/branches/<slug>/` со страницей-списком. `pages.yml` собирает и деплоит только с ref `main`; push в другую ветку лишь вызывает `workflow_dispatch` на `main`, удаление ветки запускает сборку сразу.

**Tech Stack:** bun 1.3.13 (скрипты, `bun test` на `node:test`), Node 22 (рендерер), git worktree, GitHub Actions (`actions/deploy-pages@v4`, `gh workflow run`).

**Spec:** `docs/superpowers/specs/2026-09-13-branch-previews-design.md`. Контекст: `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` §3.

## Global Constraints

- Настройки репозитория и правило окружения `github-pages` (только `main`) не меняются; источник Pages остаётся GitHub Actions.
- Сборка и деплой идут только в запусках с `github.ref == 'refs/heads/main'`; job `dispatch` имеет только `permissions: actions: write`; job `build` только `contents: read`; `pages: write` и `id-token: write` только у `deploy`.
- `timeout-minutes`: `dispatch` 5, `build` 45. Лимит на `bun install` и `bun run build` ветки 5 минут (`BRANCH_STEP_TIMEOUT_MS = 5 * 60 * 1000`).
- Slug: символы вне `[A-Za-z0-9._-]` заменяются на `-`, подряд идущие `-` схлопываются, `-` по краям убираются, пустой результат даёт `branch`; при совпадении `<slug>-<первые 7 символов sha>`; `index.html` занят заранее.
- Имена веток в HTML экранируются: `&`, `<`, `>`, `"`, `'`.
- Статус ветки: `ok` или `failed` с шагом `worktree`, `bun install`, `bun run build` или `dist`. Упавшая ветка не роняет сборку; упавший `main` роняет.
- Никаких runtime-зависимостей. Скрипты ESM `*.mjs` только на `node:*`, тесты на `node:test` + `node:assert/strict`, запуск `bun test`.
- В `dist/**/*.html` нет `file://` и внешних `src`, `<link>`, `@import`, `url()`.
- Коммит-сообщения пишутся в файл через Bash heredoc и коммитятся `git commit -F <файл>`; PowerShell here-strings не использовать. Каждое сообщение заканчивается строкой `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ничего не пушить, не удалять ветки на GitHub и не менять настройки репозитория без явного запроса пользователя (Task 5 оговаривает это отдельно).

---

## File Structure

| Файл | Ответственность |
| --- | --- |
| `scripts/build-index.mjs` | `renderIndex(names, options)` с необязательной ссылкой на превью |
| `scripts/build-index.test.mjs` | тест ссылки на превью |
| `scripts/build-site.mjs` | чистые функции (slug, разбор веток, HTML списка, сводка) и `main()` со сборкой сайта |
| `scripts/build-site.test.mjs` | тесты чистых функций |
| `package.json` | скрипт `site` |
| `.github/workflows/pages.yml` | триггеры, `dispatch`, сборка через `bun run site`, деплой |
| `README.md` | раздел «Превью веток», команда `bun run site` |
| `.claude/skills/eraser-diagrams/SKILL.md` | шаг про адрес превью в цикле правки |

---

### Task 1: Чистые функции превью и ссылка с главной

**Files:**
- Modify: `scripts/build-index.mjs`
- Modify: `scripts/build-index.test.mjs`
- Create: `scripts/build-site.mjs` (только чистые функции; `main()` добавит Task 2)
- Test: `scripts/build-site.test.mjs`

**Interfaces:**
- Consumes: `renderIndex(names)` и `diagramNames(dir)` из `scripts/build-index.mjs`.
- Produces:
  - `renderIndex(names: string[], options?: { previewsHref?: string }): string`
  - `branchSlug(name: string): string`
  - `assignSlugs(branches: { name: string, sha: string }[]): { name: string, sha: string, slug: string }[]`
  - `parseBranches(output: string): { name: string, sha: string }[]`
  - `escapeHtml(text: string): string`
  - `renderPreviewsIndex(entries: { name: string, slug: string, sha: string, status: "ok" | "failed", failedStep?: string }[]): string`
  - `renderSummary(entries: тот же тип): string`

- [ ] **Step 1: падающие тесты**

В конец `scripts/build-index.test.mjs` добавить:

```js
test("renderIndex: links branch previews only when previewsHref is given", () => {
  assert.match(renderIndex(["ci"], { previewsHref: "branches/" }), /<a href="branches\/">Превью веток<\/a>/);
  assert.doesNotMatch(renderIndex(["ci"]), /Превью веток/);
});
```

Создать `scripts/build-site.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  assignSlugs,
  branchSlug,
  escapeHtml,
  parseBranches,
  renderPreviewsIndex,
  renderSummary,
} from "./build-site.mjs";

test("branchSlug replaces unsafe characters with single dashes and trims them", () => {
  assert.equal(branchSlug("feature/bun-and-colors"), "feature-bun-and-colors");
  assert.equal(branchSlug("fix//a b"), "fix-a-b");
  assert.equal(branchSlug("a--b"), "a-b");
  assert.equal(branchSlug("-a-"), "a");
  assert.equal(branchSlug("v1.2_rc"), "v1.2_rc");
});

test("branchSlug falls back to branch when nothing safe is left", () => {
  assert.equal(branchSlug("схемы/новые"), "branch");
});

test("assignSlugs sorts by name and suffixes a colliding slug with the short sha", () => {
  const result = assignSlugs([
    { name: "a/b", sha: "1111111aaaa" },
    { name: "a-b", sha: "2222222bbbb" },
  ]);
  assert.deepEqual(result, [
    { name: "a-b", sha: "2222222bbbb", slug: "a-b" },
    { name: "a/b", sha: "1111111aaaa", slug: "a-b-1111111" },
  ]);
});

test("assignSlugs never gives a branch the slug of the previews index file", () => {
  const [entry] = assignSlugs([{ name: "index.html", sha: "3333333cccc" }]);
  assert.equal(entry.slug, "index.html-3333333");
});

test("parseBranches skips HEAD and main and keeps names with slashes", () => {
  const output = "HEAD 0000000\nfeature/x 1111111\nmain 2222222\r\nfix 3333333\n";
  assert.deepEqual(parseBranches(output), [
    { name: "feature/x", sha: "1111111" },
    { name: "fix", sha: "3333333" },
  ]);
});

test("escapeHtml escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("renderPreviewsIndex links built branches and marks failed ones with the step", () => {
  const html = renderPreviewsIndex([
    { name: "feature/x", slug: "feature-x", sha: "abcdef0123", status: "ok" },
    { name: "a<b>", slug: "a-b", sha: "1234567890", status: "failed", failedStep: "bun install" },
  ]);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<a href="feature-x\/">feature\/x<\/a> <code>abcdef0<\/code>/);
  assert.match(html, /a&lt;b&gt; \(не собралась: bun install\)/);
  assert.match(html, /href="\.\.\/"/);
  assert.doesNotMatch(html, /<script|<link/);
});

test("renderPreviewsIndex says there are no other branches for an empty list", () => {
  assert.match(renderPreviewsIndex([]), /Других веток нет\./);
});

test("renderSummary lists every branch with its preview path or failed step", () => {
  const summary = renderSummary([
    { name: "feature/x", slug: "feature-x", sha: "abc", status: "ok" },
    { name: "old", slug: "old", sha: "def", status: "failed", failedStep: "bun install" },
  ]);
  assert.match(summary, /- `feature\/x`: branches\/feature-x\//);
  assert.match(summary, /- `old`: не собралась на шаге bun install/);
});
```

- [ ] **Step 2: убедиться, что тесты падают**

Run: `bun test scripts/build-site.test.mjs scripts/build-index.test.mjs`
Expected: FAIL, `Cannot find module` с упоминанием `./build-site.mjs`; тест `renderIndex: links branch previews...` падает на отсутствии `Превью веток`.

- [ ] **Step 3: `renderIndex` с опцией**

В `scripts/build-index.mjs`:

1. Строку `export function renderIndex(names) {` заменить на `export function renderIndex(names, options = {}) {`.
2. Сразу после строки `    .join("\n");` (конец построения `cards`) вставить:

```js
  const previews = options.previewsHref
    ? `\n  <p><a href="${options.previewsHref}">Превью веток</a></p>`
    : "";
```

3. В шаблоне строку `${cards}` (перед `</body>`) заменить на `${cards}${previews}`.

- [ ] **Step 4: чистые функции `scripts/build-site.mjs`**

Создать `scripts/build-site.mjs`:

```js
// Собирает сайт Pages: main в dist/, каждую ветку origin в dist/branches/<slug>/.
// Спека: docs/superpowers/specs/2026-09-13-branch-previews-design.md §4.
// Использование: bun scripts/build-site.mjs

const MAIN_BRANCH = "main";
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
```

- [ ] **Step 5: тесты проходят**

Run: `bun test scripts/build-site.test.mjs scripts/build-index.test.mjs`
Expected: `12 pass`, `0 fail`.

Run: `bun run test`
Expected: `50 pass`, `0 fail`.

- [ ] **Step 6: коммит**

```bash
git add scripts/build-index.mjs scripts/build-index.test.mjs scripts/build-site.mjs scripts/build-site.test.mjs
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Add branch preview helpers and an optional previews link on the index page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 2: Сборка сайта `bun run site`

**Files:**
- Modify: `scripts/build-site.mjs` (полная замена содержимого: чистые функции из Task 1 без изменений плюс сборка)
- Modify: `package.json` (скрипт `site`)

**Interfaces:**
- Consumes: функции Task 1; `diagramNames()` и `renderIndex(names, { previewsHref })` из `scripts/build-index.mjs`; скрипт `bun run build`.
- Produces: `bun run site`: выход 0 и `dist/` с `index.html` (ссылка `branches/`), схемами `main` и `dist/branches/index.html` плюс `dist/branches/<slug>/` для собранных веток; выход 1, если упал `bun run build` основной ветки, `git fetch` или `git for-each-ref`.

- [ ] **Step 1: полное содержимое `scripts/build-site.mjs`**

Заменить файл целиком:

```js
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
```

Все чистые функции совпадают с Task 1 символ в символ; меняются только импорты, константы `BRANCH_STEP_TIMEOUT_MS` и `ICON_CACHE_DIR` и новый код после `renderSummary`.

- [ ] **Step 2: скрипт `site`**

В `package.json` после строки

```json
    "build": "bun run validate && bun run check && bun run render && bun run index",
```

добавить строку

```json
    "site": "bun scripts/build-site.mjs",
```

- [ ] **Step 3: тесты не сломаны**

Run: `bun run test`
Expected: `50 pass`, `0 fail`.

- [ ] **Step 4: сквозной прогон против временного origin**

Прогон в копии репозитория вне рабочей копии, чтобы не трогать настоящий `origin`. `$SCRATCH` это любая пустая временная папка вне репозитория.

Run (Bash, из корня рабочей копии):

```bash
SCRATCH="$(mktemp -d)"
REPO="$(pwd)"
git clone -q --bare "$REPO" "$SCRATCH/origin.git"
git -C "$SCRATCH/origin.git" branch preview/npm-era e21c159
git -C "$SCRATCH/origin.git" branch 'preview/no-scripts&x' 6be51ba
git clone -q "$SCRATCH/origin.git" "$SCRATCH/clone"
git -C "$SCRATCH/clone" checkout -q "$(git branch --show-current)"
# Шаги 1–2 ещё не закоммичены: переносим их в клон.
cp "$REPO/scripts/build-site.mjs" "$REPO/scripts/build-index.mjs" "$SCRATCH/clone/scripts/"
cp "$REPO/package.json" "$SCRATCH/clone/package.json"
cd "$SCRATCH/clone"
bun install --frozen-lockfile
GITHUB_STEP_SUMMARY="$SCRATCH/summary.md" bun run site > "$SCRATCH/site.log" 2>&1; echo "site-exit=$?"
grep '^site:' "$SCRATCH/site.log"
cat "$SCRATCH/summary.md"
ls dist/branches
grep -c 'href="branches/"' dist/index.html
grep -E '<li>' dist/branches/index.html
git worktree list
grep -rl 'file://' dist --include='*.html' | wc -l
cd "$REPO"
```

Коммиты `e21c159` (эпоха npm, есть `package-lock.json`) и `6be51ba` (нет `package.json`) есть в истории этой ветки. Прогон занимает около 30 секунд.

Expected:
- `site-exit=0`;
- строки `site: building ...` для `feature/...` текущей ветки, `preview/no-scripts&x`, `preview/npm-era` (плюс локальные ветки, попавшие в bare-клон, кроме `main`), затем `site: N/M branch previews built`;
- в `summary.md` текущая ветка и `preview/npm-era` с путями `branches/<slug>/`, `preview/no-scripts&x` с `не собралась на шаге bun run build`;
- `ls dist/branches` показывает `index.html`, каталог slug текущей ветки и `preview-npm-era`, но не `preview-no-scripts-x`;
- счётчик ссылки `branches/` равен `1`;
- в `<li>` имя `preview/no-scripts&amp;x` экранировано;
- `git worktree list` показывает одну строку (сам клон);
- счётчик файлов с `file://` равен `0`.

Если сборка текущей ветки упала с `E_UNKNOWN_ICON` на существующей иконке, это сбой сети при загрузке иконок: повторить `bun run site` один раз и записать оба вывода в отчёт.

- [ ] **Step 5: коммит**

```bash
git add scripts/build-site.mjs package.json
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Build the Pages site with previews of every origin branch

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 3: `pages.yml` с диспетчером

**Files:**
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `bun run site` (Task 2).
- Produces: workflow по §3 спеки.

- [ ] **Step 1: полное содержимое**

Заменить `.github/workflows/pages.yml` целиком:

```yaml
name: Pages

on:
  push:
    branches:
      - "**"
  delete:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages-${{ github.ref == 'refs/heads/main' && 'main' || github.run_id }}
  cancel-in-progress: false

jobs:
  dispatch:
    if: github.event_name == 'push' && github.ref != 'refs/heads/main' && !github.event.deleted
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      actions: write
    steps:
      - run: gh workflow run pages.yml --ref main --repo "$GITHUB_REPOSITORY"
        env:
          GH_TOKEN: ${{ github.token }}

  build:
    if: github.ref == 'refs/heads/main' && (github.event_name != 'delete' || github.event.ref_type == 'branch')
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      CHROMIUM_PATH: /usr/bin/google-chrome
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.13
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/cache@v4
        with:
          path: .eraser/icons
          key: icons-${{ hashFiles('diagrams/*.json') }}
          restore-keys: |
            icons-
      - run: bun install --frozen-lockfile
      - run: bun run test
      - run: bun run site
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: проверка**

Run (Bash):

```bash
python -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/pages.yml')); print(sorted(d['jobs']), d['jobs']['build']['timeout-minutes'], d['jobs']['dispatch']['permissions'])" 2>/dev/null || echo "no python yaml"
grep -n 'bun run site\|gh workflow run\|timeout-minutes\|actions: write\|pages: write\|ref_type\|github.event.deleted' .github/workflows/pages.yml
grep -c $'\t' .github/workflows/pages.yml
git diff --check
```

Expected: если есть PyYAML, `['build', 'deploy', 'dispatch'] 45 {'actions': 'write'}` (ключ `on` PyYAML читает как `True`, это нормально); grep показывает `gh workflow run pages.yml --ref main`, `timeout-minutes: 5` и `45`, `actions: write`, `pages: write`, `ref_type == 'branch'`, `!github.event.deleted`, `bun run site`; табов `0`; `git diff --check` пуст. `bun run build` в файле больше не встречается.

- [ ] **Step 3: коммит**

```bash
git add .github/workflows/pages.yml
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Deploy Pages from main for every branch push and branch deletion

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 4: README и скилл

**Files:**
- Modify: `README.md`
- Modify: `.claude/skills/eraser-diagrams/SKILL.md`

**Interfaces:**
- Consumes: адреса и поведение из Tasks 2–3.

- [ ] **Step 1: README, команда**

В `README.md` строку

```
bun run build      # validate + check + render + dist/index.html
```

заменить на две строки

```
bun run build      # validate + check + render + dist/index.html
bun run site       # build + превью всех веток origin в dist/branches/
```

- [ ] **Step 2: README, раздел**

В `README.md` перед строкой, которая начинается с `Дизайн: \`docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md\``, вставить:

```
## Превью веток

Push в любую ветку публикует её схемы по адресу
`https://yarikmix.github.io/diagrams/branches/<slug>/`, где slug это имя
ветки, в котором всё, кроме латиницы, цифр, `.`, `_` и `-`, заменено на
`-`: `feature/new-vps` становится `feature-new-vps`. Список всех превью:
**https://yarikmix.github.io/diagrams/branches/**

Push в ветку запускает workflow Pages на `main`. Тот собирает `main` и все
ветки их собственными скриптами (`bun run site`) и публикует единым
сайтом, поэтому превью появляется через несколько минут. После удаления
ветки её превью исчезает при следующем запуске. Ветка, которая не
собралась, остаётся в списке с пометкой «не собралась» и шагом, на котором
упала. Слитые ветки лучше удалять: каждая добавляет время сборки.

```

И в той же строке `Дизайн: ...` в конце перечня файлов добавить третий путь: заменить

```
`docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`.
```

на

```
`docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`,
`docs/superpowers/specs/2026-09-13-branch-previews-design.md`.
```

- [ ] **Step 3: скилл**

В `.claude/skills/eraser-diagrams/SKILL.md` строку

```
7. Перед коммитом: `bun run test` и `bun run build` (то же, что делает CI).
```

заменить на

```
7. Перед коммитом: `bun run test` и `bun run build` (то же, что делает CI).
8. После push ветки превью появится через несколько минут по адресу
   `https://yarikmix.github.io/diagrams/branches/<slug>/`, где slug это имя
   ветки, в котором всё, кроме латиницы, цифр, `.`, `_` и `-`, заменено на
   `-`. Ссылку можно дать в PR.
```

- [ ] **Step 4: проверка**

Run (Bash):

```bash
grep -n 'bun run site\|## Превью веток\|branch-previews-design' README.md
grep -n '^8\. После push' .claude/skills/eraser-diagrams/SKILL.md
head -4 .claude/skills/eraser-diagrams/SKILL.md
git diff --check
```

Expected: в README есть строка команды, заголовок раздела и путь спеки; в SKILL.md есть шаг 8; frontmatter начинается с `---` и `name: eraser-diagrams`; `git diff --check` пуст.

- [ ] **Step 5: коммит**

```bash
git add README.md .claude/skills/eraser-diagrams/SKILL.md
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Docs: branch previews in README and the eraser-diagrams skill

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 5: Приёмка

Шаги 2–4 пушат ветку, создают PR, требуют слияния в `main` и создают и удаляют тестовую ветку на GitHub. Это внешние действия: выполнять только после явного подтверждения пользователя.

**Files:** нет изменений.

- [ ] **Step 1: локальная приёмка**

Run (Bash):

```bash
bun run test
git status --short
```

Expected: `50 pass`, `0 fail`; `git status --short` пуст. Сквозной прогон `bun run site` уже выполнен в Task 2 Step 4.

- [ ] **Step 2: (после подтверждения пользователя) push и PR**

Push ветки запустит `pages.yml` этой ветки: job `dispatch` вызовет workflow Pages на `main`, где пока старая версия workflow, и тот пересоберёт текущий `main`. Это безвредно.

```bash
git push -u origin HEAD
```

Создание PR и его описание согласовать с пользователем: на ветке также лежат миграция на bun и цветовая конвенция. Ожидание: `CI` зелёный, в логе `bun run test` строка `50 pass`.

- [ ] **Step 3: (после слияния в `main` пользователем) запуск от `main`**

Run: `gh run list --workflow pages.yml --branch main --limit 1` и `gh run watch <id> --exit-status`.
Expected: `build` и `deploy` зелёные, в сводке раздел «Превью веток»; `curl -s -o /dev/null -w '%{http_code}' https://yarikmix.github.io/diagrams/branches/` даёт `200`.

- [ ] **Step 4: (после подтверждения пользователя) тестовая ветка**

```bash
git push origin HEAD:refs/heads/preview-smoke-test
gh run list --workflow pages.yml --limit 3
```

Expected: запуск `dispatch` на `preview-smoke-test` зелёный, затем запуск `workflow_dispatch` на `main` зелёный; `https://yarikmix.github.io/diagrams/branches/preview-smoke-test/` отдаёт `200`.

```bash
git push origin --delete preview-smoke-test
gh run list --workflow pages.yml --limit 2
```

Expected: запуск по `delete` на `main` зелёный; `https://yarikmix.github.io/diagrams/branches/preview-smoke-test/` отдаёт `404`.
