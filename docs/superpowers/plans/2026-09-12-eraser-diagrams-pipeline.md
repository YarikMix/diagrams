# Eraser Diagrams Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Архитектурные схемы стартапа лежат в репозитории как JSON в формате eraser-diagrams, правятся агентом, проверяются в CI и публикуются на GitHub Pages.

**Architecture:** Четыре JSON-файла в `diagrams/` рендерятся CLI `@eraserlabs/diagrams-cli` в автономные HTML и PNG. Три маленьких Node-скрипта без зависимостей: обёртка над CLI (раскрывает glob, cmd.exe этого не умеет), генератор `icons.txt` из каталога иконок Eraser, генератор `dist/index.html`. GitHub Actions валидирует и рендерит на PR, деплоит `dist/` на Pages из `main`. Скилл в `.claude/skills/` учит агента править диаграммы.

**Tech Stack:** Node 22+ (ESM, `node:test`), `@eraserlabs/diagrams-cli@0.1.0`, Google Chrome (локально автопоиск, в CI `/usr/bin/google-chrome`), GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md`. Исходник для миграции схем: `docs/reference/figjam-architecture-v3.xml`.

## Global Constraints

- Node ≥ 22.12 (локально стоит 24.8). CI: `actions/setup-node@v4`, `node-version: 22`.
- Версия CLI зафиксирована: `"@eraserlabs/diagrams-cli": "0.1.0"` в `devDependencies` без `^`.
- Никаких runtime-зависимостей. Скрипты только на `node:*` и глобальном `fetch`.
- Все скрипты ESM (`"type": "module"`), файлы `*.mjs`. Тесты `scripts/*.test.mjs` на `node:test` + `node:assert/strict`, запуск `npm test` = `node --test`.
- `npm run build` должен работать и на Windows (cmd.exe не раскрывает glob), и на ubuntu-latest. Поэтому CLI вызывается только через `node scripts/eraser.mjs`.
- CLI **не раскрывает glob сам** (проверено: `validate "d/*.json"` → `E_BAD_JSON ENOENT`). Файлы перечисляются явно.
- Формат документа: `{ "entities": [...], "connections": [...] }`. Теги с учётом регистра: `Group`, `Icon`, `Activity`, `Textbox`, `Relationship`.
- У всех сущностей обязательны `tag, id, x, y`. Координаты **абсолютные**, даже у детей с `containerId`. У `Textbox` обязателен `text`.
- Текст: `Icon`/`Activity` → `texts: [{ "text": "..." }]`; `Group` → `title: { "text": "...", "icon": "..." }`.
- Иконки: имя из `icons.txt`; неизвестное имя роняет сборку (`icons.onUnknown: "error"` + `failOnWarning: true`). Проверенные имена: `nginx, traefik, go, hono, postgres, docker, kubernetes, helm, github, github-actions, telegram, grafana, prometheus, tempo, opentelemetry, posthog, react, npm, storybook, playwright, ansible, pulumi, cloudflare, yandex, server, database, cloud, globe, monitor, bell, user, users, chrome, firefox, package, box, rocket, clock`. Отсутствуют: `caddy, loki, unleash, coolify, allure, reportportal, vk, onesignal, uptime-kuma, selectel` — для них общие `server, database, monitor, bell, package, rocket` и название в подписи.
- Размеры (замерены рендером): `Icon` занимает ячейку ~100×100 (иконка 50 px + подпись снизу), шаг 140 по горизонтали, 120 по вертикали. `Activity` задаём явно `width: 120, height: 60`, шаг 160 по горизонтали. У `Group` 40 сверху под заголовок, 20 по остальным сторонам. Сетка 20 px.
- `id` в kebab-case, уникальны внутри файла, осмысленны (`vps2-postgres`).
- Подписи короткие, URL только в `label` соединения. Хостнеймы-плейсхолдеры (`site.ru`) допустимы, реальные IP, токены и внутренние адреса запрещены: репозиторий публичный.
- Никаких `x-`-полей, цветов и стилей сверх необходимого.
- Один файл = одна диаграмма = одна страница на Pages. Схемы не сливать.
- Стрелки к Telegram: одна от группы (`GitHub`, `VPS 5 · k8s · ARC`), не от каждого шага «Send to tg». Соединение `Relationship` от `Group` к узлу работает (проверено рендером).
- Коммиты завершаются строкой `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Ничего не пушить и не менять настройки репозитория без явного запроса пользователя (Task 10 это оговаривает отдельно).

---

## File Structure

| Файл | Ответственность |
| --- | --- |
| `package.json`, `package-lock.json` | devDep на CLI, npm-скрипты |
| `.gitignore` | `node_modules/`, `dist/`, `.eraser/`, `.idea/` |
| `eraser-diagrams.config.json` | общий конфиг CLI: формат, `outDir`, иконки, шрифты, `failOnWarning` |
| `fonts.json` | inline-шрифты, чтобы HTML был автономен |
| `scripts/eraser.mjs` | обёртка: `node scripts/eraser.mjs <cmd> [opts]` → CLI с `diagrams/*.json` |
| `scripts/fetch-icons.mjs` | обход GCS JSON API, запись `icons.txt` |
| `scripts/build-index.mjs` | `dist/index.html` со ссылками и превью |
| `scripts/*.test.mjs` | тесты чистых функций трёх скриптов |
| `icons.txt` | снимок каталога иконок, одно имя на строку |
| `diagrams/deployment.json` | топология VPS, S3/CDN, клиент |
| `diagrams/ci.json` | GitHub-репозитории, CI-пайплайны, их цели |
| `diagrams/cd.json` | CD-пайплайны на VPS 5 / ARC и VPS 7 / Coolify |
| `diagrams/integrations.json` | внешние сервисы |
| `.claude/skills/eraser-diagrams/SKILL.md` | инструкция агенту |
| `.github/workflows/ci.yml` | PR и ветки: test + build + артефакт |
| `.github/workflows/pages.yml` | `main`: build + deploy на Pages |
| `README.md` | что это, ссылка на Pages, как править |

---

### Task 1: Каркас проекта, конфиг, обёртка над CLI

**Files:**
- Create: `package.json`, `.gitignore`, `eraser-diagrams.config.json`, `fonts.json`
- Create: `scripts/eraser.mjs`, `scripts/eraser.test.mjs`
- Create: `diagrams/deployment.json` (временный smoke-файл из приложения B спеки, заменяется в Task 4)

**Interfaces:**
- Produces: `npm run validate`, `npm run render`, `npm test`; модуль `scripts/eraser.mjs` экспортирует `listDiagrams(dir = "diagrams"): string[]`, `cliEntry(): string`, `buildArgs(command: string, files: string[], extra: string[]): string[]`.

- [ ] **Step 1: `.gitignore` и `package.json`**

`.gitignore`:

```
node_modules/
dist/
.eraser/
.idea/
```

`package.json`:

```json
{
  "name": "diagrams",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "test": "node --test",
    "validate": "node scripts/eraser.mjs validate",
    "render": "node scripts/eraser.mjs render -f html && node scripts/eraser.mjs render -f png",
    "index": "node scripts/build-index.mjs",
    "build": "npm run validate && npm run render && npm run index",
    "icons": "node scripts/fetch-icons.mjs"
  },
  "devDependencies": {
    "@eraserlabs/diagrams-cli": "0.1.0"
  }
}
```

Затем: `npm install`. Ожидание: появились `package-lock.json`, `node_modules/@eraserlabs/diagrams-cli/dist/cli.js` и `node_modules/@eraserlabs/diagrams/fonts/` с файлами `Inter.var.woff2`, `ShantellSans.var.woff2`, `JetBrainsMono-Regular.woff2`.

- [ ] **Step 2: конфиг и шрифты**

`eraser-diagrams.config.json`:

```json
{
  "format": "html",
  "outDir": "./dist",
  "deviceScaleFactor": 2,
  "icons": {
    "baseUrl": "https://storage.googleapis.com/eraser-public-assets/canvas-icons/",
    "cacheDir": "./.eraser/icons",
    "onUnknown": "error"
  },
  "fonts": "./fonts.json",
  "failOnWarning": true
}
```

`fonts.json`:

```json
{
  "roles": { "rough": "ShantellSans", "clean": "Inter", "mono": "JetBrainsMono" },
  "faces": [
    { "kind": "file", "family": "ShantellSans", "path": "./node_modules/@eraserlabs/diagrams/fonts/ShantellSans.var.woff2", "format": "woff2", "weight": "300 800", "inline": true },
    { "kind": "file", "family": "Inter", "path": "./node_modules/@eraserlabs/diagrams/fonts/Inter.var.woff2", "format": "woff2", "weight": "100 900", "inline": true },
    { "kind": "file", "family": "JetBrainsMono", "path": "./node_modules/@eraserlabs/diagrams/fonts/JetBrainsMono-Regular.woff2", "format": "woff2", "inline": true }
  ]
}
```

- [ ] **Step 3: падающий тест обёртки**

`scripts/eraser.test.mjs`:

```js
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
```

- [ ] **Step 4: убедиться, что тест падает**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../scripts/eraser.mjs'`.

- [ ] **Step 5: обёртка**

`scripts/eraser.mjs`:

```js
// Обёртка над eraser-diagrams CLI. Подставляет diagrams/*.json вместо glob,
// потому что cmd.exe на Windows glob не раскрывает, а CLI сам этого не делает.
// Использование: node scripts/eraser.mjs <command> [cli options...]
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

function main(argv) {
  const [command, ...extra] = argv;
  if (!command) {
    console.error("usage: node scripts/eraser.mjs <command> [cli options...]");
    return 2;
  }
  const files = listDiagrams();
  if (files.length === 0) {
    console.error(`no *.json files in ${DIAGRAMS_DIR}/`);
    return 2;
  }
  const result = spawnSync(process.execPath, [cliEntry(), ...buildArgs(command, files, extra)], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
```

- [ ] **Step 6: тест проходит**

Run: `npm test`
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 7: smoke-диаграмма и сквозной прогон**

`diagrams/deployment.json` (временно, из приложения B спеки):

```json
{
  "entities": [
    { "tag": "Group", "id": "vps2", "x": 0, "y": 0, "width": 420, "height": 200, "isContainer": true, "title": { "text": "VPS 2", "icon": "docker" } },
    { "tag": "Icon", "id": "vps2-caddy", "x": 20, "y": 60, "containerId": "vps2", "icon": "server", "texts": [{ "text": "Caddy" }] },
    { "tag": "Icon", "id": "vps2-go", "x": 160, "y": 60, "containerId": "vps2", "icon": "go", "texts": [{ "text": "Go API" }] },
    { "tag": "Icon", "id": "vps2-pg", "x": 300, "y": 60, "containerId": "vps2", "icon": "postgres", "texts": [{ "text": "Postgres" }] }
  ],
  "connections": [
    { "tag": "Relationship", "from": "vps2-caddy", "to": "vps2-go", "label": "proxy" },
    { "tag": "Relationship", "from": "vps2-go", "to": "vps2-pg" }
  ]
}
```

Run: `npm run validate`
Expected: `ok    diagrams\deployment.json` (на Linux с `/`).

Run: `npm run render`
Expected: две строки `ok ... → dist\deployment.html` и `dist\deployment.png`, строка `Using Chromium: ...` (автопоиск Chrome). Если Chrome не найден, задать `CHROMIUM_PATH` и повторить.

Run (Bash): `grep -c 'file://' dist/deployment.html; grep -oE 'https?://[^"]+' dist/deployment.html | sort -u`
Expected: `0` и единственная строка `http://www.w3.org/2000/svg`.

Открыть `dist/deployment.png` через Read: три иконки внутри группы «VPS 2» с иконкой docker в заголовке, две стрелки, подпись `proxy`. Ширина PNG около 900 px (масштаб 2 из конфига).

- [ ] **Step 8: коммит**

```bash
git add .gitignore package.json package-lock.json eraser-diagrams.config.json fonts.json scripts/eraser.mjs scripts/eraser.test.mjs diagrams/deployment.json
git commit -m "Scaffold eraser-diagrams pipeline: config, fonts, CLI wrapper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `scripts/fetch-icons.mjs` и `icons.txt`

**Files:**
- Create: `scripts/fetch-icons.mjs`, `scripts/fetch-icons.test.mjs`, `icons.txt`

**Interfaces:**
- Produces: `icons.txt` (используется Task 4–8 для выбора иконок); экспорт `namesFromPage(page): string[]`, `fetchAllIcons(fetchImpl = fetch): Promise<string[]>`, `formatIconsFile(names): string`.

- [ ] **Step 1: падающий тест**

`scripts/fetch-icons.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { namesFromPage, fetchAllIcons, formatIconsFile, LIST_URL } from "./fetch-icons.mjs";

test("namesFromPage strips prefix and .svg, drops the folder entry and non-svg", () => {
  const page = {
    items: [
      { name: "canvas-icons/" },
      { name: "canvas-icons/go.svg" },
      { name: "canvas-icons/readme.txt" },
      { name: "canvas-icons/postgres.svg" },
    ],
  };
  assert.deepEqual(namesFromPage(page), ["go", "postgres"]);
});

test("fetchAllIcons follows nextPageToken, dedupes and sorts", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    const page = url.includes("pageToken=tok1")
      ? { items: [{ name: "canvas-icons/aws.svg" }, { name: "canvas-icons/go.svg" }] }
      : { items: [{ name: "canvas-icons/go.svg" }, { name: "canvas-icons/zulu.svg" }], nextPageToken: "tok1" };
    return { ok: true, status: 200, json: async () => page };
  };
  const names = await fetchAllIcons(fakeFetch);
  assert.deepEqual(names, ["aws", "go", "zulu"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], LIST_URL);
  assert.ok(calls[1].endsWith("&pageToken=tok1"));
});

test("fetchAllIcons throws on non-2xx", async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => fetchAllIcons(fakeFetch), /GCS 503/);
});

test("formatIconsFile: one name per line, trailing newline", () => {
  assert.equal(formatIconsFile(["a", "b"]), "a\nb\n");
});
```

- [ ] **Step 2: убедиться, что падает**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../scripts/fetch-icons.mjs'`; тесты Task 1 проходят.

- [ ] **Step 3: скрипт**

`scripts/fetch-icons.mjs`:

```js
// Обновляет icons.txt: имена иконок публичного каталога Eraser
// (https://storage.googleapis.com/eraser-public-assets/canvas-icons/<name>.svg).
// Использование: node scripts/fetch-icons.mjs
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIST_URL =
  "https://storage.googleapis.com/storage/v1/b/eraser-public-assets/o" +
  "?prefix=canvas-icons/&maxResults=1000&fields=items(name),nextPageToken";
const PREFIX = "canvas-icons/";
const SUFFIX = ".svg";

export function namesFromPage(page) {
  return (page.items ?? [])
    .map((item) => item.name)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => name.slice(PREFIX.length, -SUFFIX.length));
}

export async function fetchAllIcons(fetchImpl = fetch) {
  const names = new Set();
  let pageToken;
  do {
    const url = pageToken ? `${LIST_URL}&pageToken=${encodeURIComponent(pageToken)}` : LIST_URL;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`GCS ${res.status} for ${url}`);
    const page = await res.json();
    for (const name of namesFromPage(page)) names.add(name);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...names].sort();
}

export function formatIconsFile(names) {
  return names.join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = await fetchAllIcons();
  writeFileSync("icons.txt", formatIconsFile(names));
  console.error(`icons.txt: ${names.length} names`);
}
```

Сортировка по умолчанию (`.sort()` без компаратора) выбрана намеренно: она не зависит от локали и даёт одинаковый файл на любой машине.

- [ ] **Step 4: тесты проходят**

Run: `npm test`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: сгенерировать `icons.txt` и проверить идемпотентность**

Run: `npm run icons`
Expected: stderr `icons.txt: 38xx names` (на 2026-09-12 было 3865).

Run (Bash): `wc -l icons.txt; grep -xc 'go' icons.txt; grep -xc 'telegram' icons.txt; grep -xc 'caddy' icons.txt`
Expected: около 3865, `1`, `1`, `0`.

Run (Bash): `git add icons.txt && npm run icons && git diff --stat icons.txt`
Expected: второй запуск даёт тот же файл, `git diff --stat` пуст.

- [ ] **Step 6: коммит**

```bash
git add scripts/fetch-icons.mjs scripts/fetch-icons.test.mjs icons.txt
git commit -m "Add fetch-icons script and icons.txt snapshot of the Eraser icon catalog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `scripts/build-index.mjs`

**Files:**
- Create: `scripts/build-index.mjs`, `scripts/build-index.test.mjs`

**Interfaces:**
- Consumes: `dist/<name>.html`, `dist/<name>.png` из `npm run render`.
- Produces: `dist/index.html`; экспорт `diagramNames(dir = "diagrams"): string[]`, `renderIndex(names: string[]): string`.

- [ ] **Step 1: падающий тест**

`scripts/build-index.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagramNames, renderIndex } from "./build-index.mjs";

test("diagramNames: basenames of *.json without extension, sorted", () => {
  const dir = mkdtempSync(join(tmpdir(), "index-"));
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
```

- [ ] **Step 2: убедиться, что падает**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../scripts/build-index.mjs'`.

- [ ] **Step 3: скрипт**

`scripts/build-index.mjs`:

```js
// Собирает dist/index.html: заголовок, ссылки на <name>.html и <name>.png,
// превью PNG. Один статичный файл, CSS встроен, зависимостей нет.
// Использование: node scripts/build-index.mjs
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function diagramNames(dir = "diagrams") {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => name.slice(0, -".json".length));
}

export function renderIndex(names) {
  const cards = names
    .map(
      (name) => `    <section class="card">
      <h2>${name}</h2>
      <p><a href="${name}.html">HTML</a> · <a href="${name}.png">PNG</a></p>
      <a href="${name}.html"><img src="${name}.png" alt="${name}"></a>
    </section>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Диаграммы</title>
  <style>
    body { margin: 0; padding: 24px; font: 16px/1.5 system-ui, sans-serif; background: #fafafa; color: #111; }
    h1 { margin: 0 0 24px; }
    .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .card h2 { margin: 0 0 8px; font-size: 20px; }
    .card img { display: block; max-width: 100%; height: auto; border: 1px solid #eee; }
  </style>
</head>
<body>
  <h1>Диаграммы</h1>
${cards}
</body>
</html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = "dist";
  mkdirSync(outDir, { recursive: true });
  const names = diagramNames();
  writeFileSync(join(outDir, "index.html"), renderIndex(names));
  console.error(`dist/index.html: ${names.length} diagrams`);
}
```

- [ ] **Step 4: тесты проходят**

Run: `npm test`
Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 5: полный `npm run build`**

Run: `npm run build`
Expected: `ok` для validate, две строки render, `dist/index.html: 1 diagrams`. В `dist/`: `index.html`, `deployment.html`, `deployment.png`.

Открыть `dist/index.html` в браузере не обязательно; достаточно `grep -c 'deployment.png' dist/index.html` → `2`.

- [ ] **Step 6: коммит**

```bash
git add scripts/build-index.mjs scripts/build-index.test.mjs
git commit -m "Add build-index script for dist/index.html

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `diagrams/deployment.json`

**Files:**
- Modify: `diagrams/deployment.json` (полная замена smoke-файла)

**Interfaces:**
- Consumes: `icons.txt`, `npm run validate`, `npm run render`.
- Produces: `dist/deployment.html`, `dist/deployment.png`.

Раскладка. `Selectel` в `(300, 0)`, размер `1660×720`. Внутри три ряда групп VPS: ряд 1 на `y=40` (VPS 1, 2, 3), ряд 2 на `y=340` (S3, CDN, домен как иконки, затем VPS 4, VPS 5), ряд 3 на `y=540` (VPS 6, 7, 8). Клиент слева снаружи на `(60, 340)`. Иконки внутри группы: первая на `x+20, y+40`, шаг 140.

- [ ] **Step 1: проверить имена иконок**

Run (Bash): `for i in server hono monitor go postgres grafana prometheus opentelemetry database tempo bell cloud globe github-actions chrome posthog rocket package kubernetes docker; do printf '%s ' $i; grep -xc "$i" icons.txt; done`
Expected: у каждого `1`. Если у какого-то `0`, заменить на ближайшее общее имя из Global Constraints и оставить название в подписи.

- [ ] **Step 2: записать диаграмму**

`diagrams/deployment.json`:

```json
{
  "entities": [
    { "tag": "Icon", "id": "client", "x": 60, "y": 340, "icon": "chrome", "texts": [{ "text": "Client (браузер)" }] },

    { "tag": "Group", "id": "selectel", "x": 300, "y": 0, "width": 1660, "height": 720, "isContainer": true, "title": { "text": "Selectel", "icon": "cloud" } },

    { "tag": "Group", "id": "vps1", "x": 320, "y": 40, "width": 420, "height": 160, "containerId": "selectel", "isContainer": true, "title": { "text": "VPS 1 · Docker Compose", "icon": "docker" } },
    { "tag": "Icon", "id": "vps1-caddy", "x": 340, "y": 80, "containerId": "vps1", "icon": "server", "texts": [{ "text": "Caddy" }] },
    { "tag": "Icon", "id": "vps1-bff", "x": 480, "y": 80, "containerId": "vps1", "icon": "hono", "texts": [{ "text": "BFF (Hono)" }] },
    { "tag": "Icon", "id": "vps1-node-exporter", "x": 620, "y": 80, "containerId": "vps1", "icon": "monitor", "texts": [{ "text": "Node Exporter" }] },

    { "tag": "Group", "id": "vps2", "x": 780, "y": 40, "width": 560, "height": 160, "containerId": "selectel", "isContainer": true, "title": { "text": "VPS 2 · Docker Compose", "icon": "docker" } },
    { "tag": "Icon", "id": "vps2-caddy", "x": 800, "y": 80, "containerId": "vps2", "icon": "server", "texts": [{ "text": "Caddy" }] },
    { "tag": "Icon", "id": "vps2-go", "x": 940, "y": 80, "containerId": "vps2", "icon": "go", "texts": [{ "text": "Go API" }] },
    { "tag": "Icon", "id": "vps2-postgres", "x": 1080, "y": 80, "containerId": "vps2", "icon": "postgres", "texts": [{ "text": "Postgres" }] },
    { "tag": "Icon", "id": "vps2-node-exporter", "x": 1220, "y": 80, "containerId": "vps2", "icon": "monitor", "texts": [{ "text": "Node Exporter" }] },

    { "tag": "Group", "id": "vps3", "x": 1380, "y": 40, "width": 560, "height": 280, "containerId": "selectel", "isContainer": true, "title": { "text": "VPS 3 · Docker Compose", "icon": "docker" } },
    { "tag": "Icon", "id": "vps3-caddy", "x": 1400, "y": 80, "containerId": "vps3", "icon": "server", "texts": [{ "text": "Caddy" }] },
    { "tag": "Icon", "id": "vps3-grafana", "x": 1540, "y": 80, "containerId": "vps3", "icon": "grafana", "texts": [{ "text": "Grafana" }] },
    { "tag": "Icon", "id": "vps3-prometheus", "x": 1680, "y": 80, "containerId": "vps3", "icon": "prometheus", "texts": [{ "text": "Prometheus" }] },
    { "tag": "Icon", "id": "vps3-alloy", "x": 1820, "y": 80, "containerId": "vps3", "icon": "opentelemetry", "texts": [{ "text": "Alloy" }] },
    { "tag": "Icon", "id": "vps3-loki", "x": 1400, "y": 200, "containerId": "vps3", "icon": "database", "texts": [{ "text": "Loki" }] },
    { "tag": "Icon", "id": "vps3-tempo", "x": 1540, "y": 200, "containerId": "vps3", "icon": "tempo", "texts": [{ "text": "Tempo" }] },
    { "tag": "Icon", "id": "vps3-alertmanager", "x": 1680, "y": 200, "containerId": "vps3", "icon": "bell", "texts": [{ "text": "Alert Manager" }] },

    { "tag": "Icon", "id": "s3", "x": 340, "y": 340, "containerId": "selectel", "icon": "database", "texts": [{ "text": "S3" }] },
    { "tag": "Icon", "id": "cdn", "x": 480, "y": 340, "containerId": "selectel", "icon": "cloud", "texts": [{ "text": "CDN" }] },
    { "tag": "Icon", "id": "domain", "x": 620, "y": 340, "containerId": "selectel", "icon": "globe", "texts": [{ "text": "site.ru" }] },

    { "tag": "Group", "id": "vps4", "x": 780, "y": 340, "width": 280, "height": 160, "containerId": "selectel", "isContainer": true, "title": { "text": "VPS 4 · Docker Compose", "icon": "docker" } },
    { "tag": "Icon", "id": "vps4-caddy", "x": 800, "y": 380, "containerId": "vps4", "icon": "server", "texts": [{ "text": "Caddy" }] },
    { "tag": "Icon", "id": "vps4-kuma", "x": 940, "y": 380, "containerId": "vps4", "icon": "monitor", "texts": [{ "text": "Uptime Kuma" }] },

    { "tag": "Group", "id": "vps5", "x": 1100, "y": 340, "width": 420, "height": 160, "containerId": "selectel", "isContainer": true, "title": { "text": "VPS 5 · k8s", "icon": "kubernetes" } },
    { "tag": "Icon", "id": "vps5-arc", "x": 1120, "y": 380, "containerId": "vps5", "icon": "github-actions", "texts": [{ "text": "ARC runners" }] },
    { "tag": "Icon", "id": "vps5-moon", "x": 1260, "y": 380, "containerId": "vps5", "icon": "chrome", "texts": [{ "text": "moon" }] },
    { "tag": "Icon", "id": "vps5-reportportal", "x": 1400, "y": 380, "containerId": "vps5", "icon": "monitor", "texts": [{ "text": "ReportPortal" }] },

    { "tag": "Group", "id": "vps6", "x": 320, "y": 540, "width": 260, "height": 160, "containerId": "selectel", "isContainer": true, "title": { "text": "VPS 6 · Docker Compose", "icon": "docker" } },
    { "tag": "Icon", "id": "vps6-posthog", "x": 340, "y": 580, "containerId": "vps6", "icon": "posthog", "texts": [{ "text": "PostHog" }] },

    { "tag": "Group", "id": "vps7", "x": 600, "y": 540, "width": 260, "height": 160, "containerId": "selectel", "isContainer": true, "title": { "text": "VPS 7 · Docker Compose", "icon": "docker" } },
    { "tag": "Icon", "id": "vps7-coolify", "x": 620, "y": 580, "containerId": "vps7", "icon": "rocket", "texts": [{ "text": "Coolify" }] },

    { "tag": "Group", "id": "vps8", "x": 880, "y": 540, "width": 260, "height": 160, "containerId": "selectel", "isContainer": true, "title": { "text": "VPS 8 · k8s", "icon": "kubernetes" } },
    { "tag": "Icon", "id": "vps8-unleash", "x": 900, "y": 580, "containerId": "vps8", "icon": "package", "texts": [{ "text": "unleash" }] }
  ],
  "connections": [
    { "tag": "Relationship", "from": "client", "to": "vps1-caddy", "label": "https://site.ru, /api" },
    { "tag": "Relationship", "from": "client", "to": "cdn", "label": "https://static.site.ru" },
    { "tag": "Relationship", "from": "client", "to": "vps3-caddy", "label": "grafana.site.ru" },
    { "tag": "Relationship", "from": "client", "to": "vps4-caddy", "label": "kuma.site.ru" },

    { "tag": "Relationship", "from": "vps1-caddy", "to": "vps1-bff" },
    { "tag": "Relationship", "from": "vps1-caddy", "to": "cdn", "label": "proxy pass static" },
    { "tag": "Relationship", "from": "vps1-bff", "to": "vps2-go", "label": "S2S, private network" },
    { "tag": "Relationship", "from": "vps1-bff", "to": "s3", "label": "index.html релиза" },
    { "tag": "Relationship", "from": "vps1-bff", "to": "vps8-unleash" },
    { "tag": "Relationship", "from": "s3", "to": "cdn", "label": "static" },

    { "tag": "Relationship", "from": "vps2-caddy", "to": "vps2-go" },
    { "tag": "Relationship", "from": "vps2-go", "to": "vps2-postgres" },
    { "tag": "Relationship", "from": "vps2-go", "to": "vps6-posthog" },

    { "tag": "Relationship", "from": "vps3-caddy", "to": "vps3-grafana" },
    { "tag": "Relationship", "from": "vps3-grafana", "to": "vps3-loki" },
    { "tag": "Relationship", "from": "vps3-grafana", "to": "vps3-tempo" },
    { "tag": "Relationship", "from": "vps3-grafana", "to": "vps3-alloy" },
    { "tag": "Relationship", "from": "vps3-prometheus", "to": "vps3-alertmanager" },
    { "tag": "Relationship", "from": "vps3-prometheus", "to": "vps1-node-exporter" },
    { "tag": "Relationship", "from": "vps3-prometheus", "to": "vps2-node-exporter" },

    { "tag": "Relationship", "from": "vps4-caddy", "to": "vps4-kuma" }
  ]
}
```

- [ ] **Step 3: validate**

Run: `npm run validate`
Expected: `ok    diagrams/deployment.json`. При `E_UNKNOWN_ICON` заменить имя по Step 1. При ошибке схемы прочитать поле в сообщении и `npx eraser-diagrams schema <Tag>`.

- [ ] **Step 4: render и осмотр**

Run: `npm run render`
Expected: `ok` для html и png без warning.

Открыть `dist/deployment.png` через Read. Проверить: все иконки внутри своих групп VPS, группы VPS внутри Selectel, подписи не наезжают друг на друга, заголовки групп не обрезаны, стрелки читаемы. Если что-то наложилось, сдвинуть координаты на кратное 20, увеличить `width`/`height` группы, повторить Step 3–4. Автораскладки узлов нет, только линии раскладываются сами.

- [ ] **Step 5: коммит**

```bash
git add diagrams/deployment.json
git commit -m "Add deployment diagram: VPS topology, S3/CDN, client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `diagrams/ci.json`

**Files:**
- Create: `diagrams/ci.json`

**Interfaces:**
- Consumes: `icons.txt`, `npm run validate`, `npm run render`.
- Produces: `dist/ci.html`, `dist/ci.png`.

Раскладка. Группа `GitHub` в `(0, 0)`, размер `1200×1540`, репозитории стопкой по `x=20`. Каждый пайплайн вложенная `Group` с заголовком, `Activity` `120×60`, шаг 160, первая на `x+20, y+40` от группы пайплайна. Цели в правой колонке на `x=1300`.

- [ ] **Step 1: проверить имена иконок**

Run (Bash): `for i in github react package storybook go box playwright pulumi server docker grafana ansible npm monitor database telegram; do printf '%s ' $i; grep -xc "$i" icons.txt; done`
Expected: у каждого `1`.

- [ ] **Step 2: записать диаграмму**

`diagrams/ci.json`:

```json
{
  "entities": [
    { "tag": "Group", "id": "github", "x": 0, "y": 0, "width": 1200, "height": 1540, "isContainer": true, "title": { "text": "GitHub", "icon": "github" } },

    { "tag": "Group", "id": "repo-react", "x": 20, "y": 40, "width": 840, "height": 180, "containerId": "github", "isContainer": true, "title": { "text": "React repo", "icon": "react" } },
    { "tag": "Group", "id": "react-release", "x": 40, "y": 80, "width": 800, "height": 120, "containerId": "repo-react", "isContainer": true, "title": { "text": "React release" } },
    { "tag": "Activity", "id": "react-install", "x": 60, "y": 120, "width": 120, "height": 60, "containerId": "react-release", "texts": [{ "text": "Install deps" }] },
    { "tag": "Activity", "id": "react-lint", "x": 220, "y": 120, "width": 120, "height": 60, "containerId": "react-release", "texts": [{ "text": "Lint" }] },
    { "tag": "Activity", "id": "react-build", "x": 380, "y": 120, "width": 120, "height": 60, "containerId": "react-release", "texts": [{ "text": "Build" }] },
    { "tag": "Activity", "id": "react-deploy-npm", "x": 540, "y": 120, "width": 120, "height": 60, "containerId": "react-release", "texts": [{ "text": "Deploy to NPM" }] },
    { "tag": "Activity", "id": "react-tg", "x": 700, "y": 120, "width": 120, "height": 60, "containerId": "react-release", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "repo-uikit", "x": 20, "y": 240, "width": 840, "height": 320, "containerId": "github", "isContainer": true, "title": { "text": "UI Kit repo", "icon": "package" } },
    { "tag": "Group", "id": "uikit-release", "x": 40, "y": 280, "width": 800, "height": 120, "containerId": "repo-uikit", "isContainer": true, "title": { "text": "UI Kit release" } },
    { "tag": "Activity", "id": "uikit-install", "x": 60, "y": 320, "width": 120, "height": 60, "containerId": "uikit-release", "texts": [{ "text": "Install deps" }] },
    { "tag": "Activity", "id": "uikit-lint", "x": 220, "y": 320, "width": 120, "height": 60, "containerId": "uikit-release", "texts": [{ "text": "Lint" }] },
    { "tag": "Activity", "id": "uikit-build", "x": 380, "y": 320, "width": 120, "height": 60, "containerId": "uikit-release", "texts": [{ "text": "Build" }] },
    { "tag": "Activity", "id": "uikit-deploy-npm", "x": 540, "y": 320, "width": 120, "height": 60, "containerId": "uikit-release", "texts": [{ "text": "Deploy to NPM" }] },
    { "tag": "Activity", "id": "uikit-tg", "x": 700, "y": 320, "width": 120, "height": 60, "containerId": "uikit-release", "texts": [{ "text": "Send to tg" }] },
    { "tag": "Group", "id": "sb-deploy", "x": 40, "y": 420, "width": 640, "height": 120, "containerId": "repo-uikit", "isContainer": true, "title": { "text": "Storybook deploy" } },
    { "tag": "Activity", "id": "sb-install", "x": 60, "y": 460, "width": 120, "height": 60, "containerId": "sb-deploy", "texts": [{ "text": "Install deps" }] },
    { "tag": "Activity", "id": "sb-build", "x": 220, "y": 460, "width": 120, "height": 60, "containerId": "sb-deploy", "texts": [{ "text": "Build" }] },
    { "tag": "Activity", "id": "sb-deploy-pages", "x": 380, "y": 460, "width": 120, "height": 60, "containerId": "sb-deploy", "texts": [{ "text": "Deploy to Pages" }] },
    { "tag": "Activity", "id": "sb-tg", "x": 540, "y": 460, "width": 120, "height": 60, "containerId": "sb-deploy", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "repo-frontend", "x": 20, "y": 580, "width": 1160, "height": 180, "containerId": "github", "isContainer": true, "title": { "text": "Frontend monorepo (client + BFF)", "icon": "react" } },
    { "tag": "Group", "id": "fe-ci", "x": 40, "y": 620, "width": 1120, "height": 120, "containerId": "repo-frontend", "isContainer": true, "title": { "text": "CI" } },
    { "tag": "Activity", "id": "fe-affected", "x": 60, "y": 660, "width": 120, "height": 60, "containerId": "fe-ci", "texts": [{ "text": "detect affected" }] },
    { "tag": "Activity", "id": "fe-install", "x": 220, "y": 660, "width": 120, "height": 60, "containerId": "fe-ci", "texts": [{ "text": "Install deps" }] },
    { "tag": "Activity", "id": "fe-lint", "x": 380, "y": 660, "width": 120, "height": 60, "containerId": "fe-ci", "texts": [{ "text": "Lint" }] },
    { "tag": "Activity", "id": "fe-units", "x": 540, "y": 660, "width": 120, "height": 60, "containerId": "fe-ci", "texts": [{ "text": "Units" }] },
    { "tag": "Activity", "id": "fe-build", "x": 700, "y": 660, "width": 120, "height": 60, "containerId": "fe-ci", "texts": [{ "text": "Build" }] },
    { "tag": "Activity", "id": "fe-bundle-stats", "x": 860, "y": 660, "width": 120, "height": 60, "containerId": "fe-ci", "texts": [{ "text": "Send bundle stats" }] },
    { "tag": "Activity", "id": "fe-tg", "x": 1020, "y": 660, "width": 120, "height": 60, "containerId": "fe-ci", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "repo-backend", "x": 20, "y": 780, "width": 840, "height": 180, "containerId": "github", "isContainer": true, "title": { "text": "Backend repo", "icon": "go" } },
    { "tag": "Group", "id": "be-ci", "x": 40, "y": 820, "width": 800, "height": 120, "containerId": "repo-backend", "isContainer": true, "title": { "text": "CI" } },
    { "tag": "Activity", "id": "be-build", "x": 60, "y": 860, "width": 120, "height": 60, "containerId": "be-ci", "texts": [{ "text": "Build" }] },
    { "tag": "Activity", "id": "be-units", "x": 220, "y": 860, "width": 120, "height": 60, "containerId": "be-ci", "texts": [{ "text": "Units" }] },
    { "tag": "Activity", "id": "be-lint", "x": 380, "y": 860, "width": 120, "height": 60, "containerId": "be-ci", "texts": [{ "text": "Lint" }] },
    { "tag": "Activity", "id": "be-build-image", "x": 540, "y": 860, "width": 120, "height": 60, "containerId": "be-ci", "texts": [{ "text": "Build image" }] },
    { "tag": "Activity", "id": "be-tg", "x": 700, "y": 860, "width": 120, "height": 60, "containerId": "be-ci", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "repo-static", "x": 20, "y": 980, "width": 360, "height": 180, "containerId": "github", "isContainer": true, "title": { "text": "Static repo", "icon": "box" } },
    { "tag": "Group", "id": "static-pipeline", "x": 40, "y": 1020, "width": 320, "height": 120, "containerId": "repo-static", "isContainer": true, "title": { "text": "Static" } },
    { "tag": "Activity", "id": "static-deploy-s3", "x": 60, "y": 1060, "width": 120, "height": 60, "containerId": "static-pipeline", "texts": [{ "text": "Deploy to s3" }] },
    { "tag": "Activity", "id": "static-tg", "x": 220, "y": 1060, "width": 120, "height": 60, "containerId": "static-pipeline", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "repo-e2e", "x": 20, "y": 1180, "width": 200, "height": 160, "containerId": "github", "isContainer": true, "title": { "text": "E2E repo", "icon": "playwright" } },
    { "tag": "Icon", "id": "e2e-tests", "x": 40, "y": 1220, "containerId": "repo-e2e", "icon": "playwright", "texts": [{ "text": "Playwright tests" }] },

    { "tag": "Group", "id": "repo-deployments", "x": 20, "y": 1360, "width": 880, "height": 160, "containerId": "github", "isContainer": true, "title": { "text": "Deployments repo", "icon": "pulumi" } },
    { "tag": "Icon", "id": "dep-pulumi", "x": 40, "y": 1400, "containerId": "repo-deployments", "icon": "pulumi", "texts": [{ "text": "Pulumi configs" }] },
    { "tag": "Icon", "id": "dep-caddy", "x": 180, "y": 1400, "containerId": "repo-deployments", "icon": "server", "texts": [{ "text": "caddy.conf" }] },
    { "tag": "Icon", "id": "dep-compose", "x": 320, "y": 1400, "containerId": "repo-deployments", "icon": "docker", "texts": [{ "text": "docker-compose.yml" }] },
    { "tag": "Icon", "id": "dep-monitoring", "x": 460, "y": 1400, "containerId": "repo-deployments", "icon": "grafana", "texts": [{ "text": "monitoring configuration" }] },
    { "tag": "Icon", "id": "dep-ansible", "x": 600, "y": 1400, "containerId": "repo-deployments", "icon": "ansible", "texts": [{ "text": "ansible roles / playbooks" }] },
    { "tag": "Icon", "id": "dep-vault", "x": 740, "y": 1400, "containerId": "repo-deployments", "icon": "ansible", "texts": [{ "text": "ansible vault" }] },

    { "tag": "Group", "id": "npm-registry", "x": 1300, "y": 40, "width": 280, "height": 160, "isContainer": true, "title": { "text": "NPM Registry", "icon": "npm" } },
    { "tag": "Icon", "id": "npm-react", "x": 1320, "y": 80, "containerId": "npm-registry", "icon": "npm", "texts": [{ "text": "@my/react" }] },
    { "tag": "Icon", "id": "npm-uikit", "x": 1460, "y": 80, "containerId": "npm-registry", "icon": "npm", "texts": [{ "text": "@my/ui-kit" }] },
    { "tag": "Icon", "id": "pages-storybook", "x": 1320, "y": 440, "icon": "storybook", "texts": [{ "text": "Storybook (GitHub Pages)" }] },
    { "tag": "Icon", "id": "relative-ci", "x": 1320, "y": 640, "icon": "monitor", "texts": [{ "text": "Relative CI" }] },
    { "tag": "Group", "id": "docker-registry", "x": 1300, "y": 800, "width": 280, "height": 160, "isContainer": true, "title": { "text": "Docker Registry", "icon": "docker" } },
    { "tag": "Icon", "id": "reg-bff", "x": 1320, "y": 840, "containerId": "docker-registry", "icon": "docker", "texts": [{ "text": "bff image" }] },
    { "tag": "Icon", "id": "reg-backend", "x": 1460, "y": 840, "containerId": "docker-registry", "icon": "docker", "texts": [{ "text": "backend image" }] },
    { "tag": "Icon", "id": "s3", "x": 1320, "y": 1040, "icon": "database", "texts": [{ "text": "S3" }] },
    { "tag": "Icon", "id": "telegram", "x": 1320, "y": 1300, "icon": "telegram", "texts": [{ "text": "Telegram" }] }
  ],
  "connections": [
    { "tag": "Relationship", "from": "react-install", "to": "react-lint" },
    { "tag": "Relationship", "from": "react-lint", "to": "react-build" },
    { "tag": "Relationship", "from": "react-build", "to": "react-deploy-npm" },
    { "tag": "Relationship", "from": "react-deploy-npm", "to": "react-tg" },

    { "tag": "Relationship", "from": "uikit-install", "to": "uikit-lint" },
    { "tag": "Relationship", "from": "uikit-lint", "to": "uikit-build" },
    { "tag": "Relationship", "from": "uikit-build", "to": "uikit-deploy-npm" },
    { "tag": "Relationship", "from": "uikit-deploy-npm", "to": "uikit-tg" },
    { "tag": "Relationship", "from": "sb-install", "to": "sb-build" },
    { "tag": "Relationship", "from": "sb-build", "to": "sb-deploy-pages" },
    { "tag": "Relationship", "from": "sb-deploy-pages", "to": "sb-tg" },

    { "tag": "Relationship", "from": "fe-affected", "to": "fe-install" },
    { "tag": "Relationship", "from": "fe-install", "to": "fe-lint" },
    { "tag": "Relationship", "from": "fe-lint", "to": "fe-units" },
    { "tag": "Relationship", "from": "fe-units", "to": "fe-build" },
    { "tag": "Relationship", "from": "fe-build", "to": "fe-bundle-stats" },
    { "tag": "Relationship", "from": "fe-bundle-stats", "to": "fe-tg" },

    { "tag": "Relationship", "from": "be-build", "to": "be-units" },
    { "tag": "Relationship", "from": "be-units", "to": "be-lint" },
    { "tag": "Relationship", "from": "be-lint", "to": "be-build-image" },
    { "tag": "Relationship", "from": "be-build-image", "to": "be-tg" },

    { "tag": "Relationship", "from": "static-deploy-s3", "to": "static-tg" },

    { "tag": "Relationship", "from": "react-deploy-npm", "to": "npm-react" },
    { "tag": "Relationship", "from": "uikit-deploy-npm", "to": "npm-uikit" },
    { "tag": "Relationship", "from": "npm-react", "to": "uikit-install", "label": "@my/react" },
    { "tag": "Relationship", "from": "npm-react", "to": "sb-install", "label": "@my/react" },
    { "tag": "Relationship", "from": "sb-deploy-pages", "to": "pages-storybook" },
    { "tag": "Relationship", "from": "fe-bundle-stats", "to": "relative-ci" },
    { "tag": "Relationship", "from": "be-build-image", "to": "reg-backend" },
    { "tag": "Relationship", "from": "static-deploy-s3", "to": "s3" },
    { "tag": "Relationship", "from": "github", "to": "telegram", "label": "Send to tg" }
  ]
}
```

- [ ] **Step 3: validate**

Run: `npm run validate`
Expected: `ok` для `deployment.json` и `ci.json`.

- [ ] **Step 4: render и осмотр**

Run: `npm run render`, затем открыть `dist/ci.png` через Read.

Проверить: заголовки репозиториев не обрезаны шириной группы (иначе увеличить `width`), длинные подписи `Activity` («Send bundle stats», «Deploy to Pages») помещаются в две строки внутри `120×60`, стрелки от `npm-react` к `uikit-install` и `sb-install` не проходят сквозь текст. Стрелка от группы `github` к `telegram` рисуется от правой границы группы. Правки координат кратны 20, повтор Step 3–4.

- [ ] **Step 5: коммит**

```bash
git add diagrams/ci.json
git commit -m "Add CI diagram: GitHub repos, pipelines and their targets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `diagrams/cd.json`

**Files:**
- Create: `diagrams/cd.json`

**Interfaces:**
- Consumes: `icons.txt`, `npm run validate`, `npm run render`.
- Produces: `dist/cd.html`, `dist/cd.png`.

Раскладка. `VPS 5 · k8s · ARC` в `(0, 0)`, размер `1480×800`, пайплайны стопкой. `VPS 7 · Coolify` в `(0, 860)`, размер `680×320`. Цели в колонке `x=1600`.

- [ ] **Step 1: проверить имена иконок**

Run (Bash): `for i in kubernetes docker chrome monitor database package telegram; do printf '%s ' $i; grep -xc "$i" icons.txt; done`
Expected: у каждого `1`.

- [ ] **Step 2: записать диаграмму**

`diagrams/cd.json`:

```json
{
  "entities": [
    { "tag": "Group", "id": "vps5", "x": 0, "y": 0, "width": 1480, "height": 800, "isContainer": true, "title": { "text": "VPS 5 · k8s · ARC", "icon": "kubernetes" } },

    { "tag": "Group", "id": "backend-cd", "x": 20, "y": 40, "width": 800, "height": 120, "containerId": "vps5", "isContainer": true, "title": { "text": "Backend CD" } },
    { "tag": "Activity", "id": "be-pull", "x": 40, "y": 80, "width": 120, "height": 60, "containerId": "backend-cd", "texts": [{ "text": "Pull image from registry" }] },
    { "tag": "Activity", "id": "be-migrate", "x": 200, "y": 80, "width": 120, "height": 60, "containerId": "backend-cd", "texts": [{ "text": "Run migrations" }] },
    { "tag": "Activity", "id": "be-deploy", "x": 360, "y": 80, "width": 120, "height": 60, "containerId": "backend-cd", "texts": [{ "text": "Deploy (compose up)" }] },
    { "tag": "Activity", "id": "be-health", "x": 520, "y": 80, "width": 120, "height": 60, "containerId": "backend-cd", "texts": [{ "text": "Health check" }] },
    { "tag": "Activity", "id": "be-tg", "x": 680, "y": 80, "width": 120, "height": 60, "containerId": "backend-cd", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "bff-cd", "x": 20, "y": 180, "width": 860, "height": 180, "containerId": "vps5", "isContainer": true, "title": { "text": "BFF CD" } },
    { "tag": "Activity", "id": "bff-ansible", "x": 40, "y": 240, "width": 120, "height": 60, "containerId": "bff-cd", "texts": [{ "text": "Run ansible playbook" }] },
    { "tag": "Group", "id": "ansible-playbook", "x": 200, "y": 200, "width": 320, "height": 120, "containerId": "bff-cd", "isContainer": true, "title": { "text": "Ansible playbook" } },
    { "tag": "Activity", "id": "bff-pull", "x": 220, "y": 240, "width": 120, "height": 60, "containerId": "ansible-playbook", "texts": [{ "text": "Pull image" }] },
    { "tag": "Activity", "id": "bff-compose", "x": 380, "y": 240, "width": 120, "height": 60, "containerId": "ansible-playbook", "texts": [{ "text": "Compose up" }] },
    { "tag": "Activity", "id": "bff-health", "x": 560, "y": 240, "width": 120, "height": 60, "containerId": "bff-cd", "texts": [{ "text": "Health check" }] },
    { "tag": "Activity", "id": "bff-tg", "x": 720, "y": 240, "width": 120, "height": 60, "containerId": "bff-cd", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "frontend-cd", "x": 20, "y": 380, "width": 1440, "height": 120, "containerId": "vps5", "isContainer": true, "title": { "text": "Frontend CD (канареечный релиз)" } },
    { "tag": "Activity", "id": "fe-build", "x": 40, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Build" }] },
    { "tag": "Activity", "id": "fe-stats", "x": 200, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Send bundle stats" }] },
    { "tag": "Activity", "id": "fe-deploy-s3", "x": 360, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Deploy to s3" }] },
    { "tag": "Activity", "id": "fe-canary", "x": 520, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Register as canary" }] },
    { "tag": "Activity", "id": "fe-health-canary", "x": 680, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Health check (canary)" }] },
    { "tag": "Activity", "id": "fe-observe", "x": 840, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Наблюдение" }] },
    { "tag": "Activity", "id": "fe-promote", "x": 1000, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Promote to stable" }] },
    { "tag": "Activity", "id": "fe-health", "x": 1160, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Health check" }] },
    { "tag": "Activity", "id": "fe-tg", "x": 1320, "y": 420, "width": 120, "height": 60, "containerId": "frontend-cd", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "frontend-rollback", "x": 20, "y": 520, "width": 480, "height": 120, "containerId": "vps5", "isContainer": true, "title": { "text": "Frontend Rollback" } },
    { "tag": "Activity", "id": "rb-switch", "x": 40, "y": 560, "width": 120, "height": 60, "containerId": "frontend-rollback", "texts": [{ "text": "Switch release pointer" }] },
    { "tag": "Activity", "id": "rb-health", "x": 200, "y": 560, "width": 120, "height": 60, "containerId": "frontend-rollback", "texts": [{ "text": "Health check" }] },
    { "tag": "Activity", "id": "rb-tg", "x": 360, "y": 560, "width": 120, "height": 60, "containerId": "frontend-rollback", "texts": [{ "text": "Send to tg" }] },

    { "tag": "Group", "id": "e2e", "x": 20, "y": 660, "width": 480, "height": 120, "containerId": "vps5", "isContainer": true, "title": { "text": "E2E" } },
    { "tag": "Activity", "id": "e2e-run", "x": 40, "y": 700, "width": 120, "height": 60, "containerId": "e2e", "texts": [{ "text": "Run e2e" }] },
    { "tag": "Activity", "id": "e2e-upload", "x": 200, "y": 700, "width": 120, "height": 60, "containerId": "e2e", "texts": [{ "text": "Upload to Allure TestOps" }] },
    { "tag": "Activity", "id": "e2e-tg", "x": 360, "y": 700, "width": 120, "height": 60, "containerId": "e2e", "texts": [{ "text": "Send to tg" }] },
    { "tag": "Icon", "id": "moon", "x": 560, "y": 680, "containerId": "vps5", "icon": "chrome", "texts": [{ "text": "moon" }] },
    { "tag": "Icon", "id": "reportportal", "x": 700, "y": 680, "containerId": "vps5", "icon": "monitor", "texts": [{ "text": "ReportPortal" }] },

    { "tag": "Group", "id": "vps7", "x": 0, "y": 860, "width": 680, "height": 320, "isContainer": true, "title": { "text": "VPS 7 · Coolify", "icon": "docker" } },
    { "tag": "Group", "id": "pr-open", "x": 20, "y": 900, "width": 640, "height": 120, "containerId": "vps7", "isContainer": true, "title": { "text": "PR фронта открыт" } },
    { "tag": "Activity", "id": "pr-clone", "x": 40, "y": 940, "width": 120, "height": 60, "containerId": "pr-open", "texts": [{ "text": "Clone branch" }] },
    { "tag": "Activity", "id": "pr-build", "x": 200, "y": 940, "width": 120, "height": 60, "containerId": "pr-open", "texts": [{ "text": "Build image" }] },
    { "tag": "Activity", "id": "pr-deploy", "x": 360, "y": 940, "width": 120, "height": 60, "containerId": "pr-open", "texts": [{ "text": "Deploy preview" }] },
    { "tag": "Activity", "id": "pr-domain", "x": 520, "y": 940, "width": 120, "height": 60, "containerId": "pr-open", "texts": [{ "text": "Assign subdomain + TLS" }] },
    { "tag": "Group", "id": "pr-closed", "x": 20, "y": 1040, "width": 320, "height": 120, "containerId": "vps7", "isContainer": true, "title": { "text": "PR фронта закрыт" } },
    { "tag": "Activity", "id": "pr-destroy", "x": 40, "y": 1080, "width": 120, "height": 60, "containerId": "pr-closed", "texts": [{ "text": "Destroy preview" }] },
    { "tag": "Activity", "id": "pr-release", "x": 200, "y": 1080, "width": 120, "height": 60, "containerId": "pr-closed", "texts": [{ "text": "Release subdomain / cert" }] },

    { "tag": "Icon", "id": "docker-registry", "x": 1600, "y": 80, "icon": "docker", "texts": [{ "text": "Docker Registry" }] },
    { "tag": "Icon", "id": "relative-ci", "x": 1600, "y": 300, "icon": "monitor", "texts": [{ "text": "Relative CI" }] },
    { "tag": "Icon", "id": "s3", "x": 1600, "y": 420, "icon": "database", "texts": [{ "text": "S3" }] },
    { "tag": "Icon", "id": "unleash", "x": 1600, "y": 560, "icon": "package", "texts": [{ "text": "unleash" }] },
    { "tag": "Icon", "id": "allure", "x": 1600, "y": 700, "icon": "monitor", "texts": [{ "text": "Allure TestOps" }] },
    { "tag": "Icon", "id": "telegram", "x": 1600, "y": 920, "icon": "telegram", "texts": [{ "text": "Telegram" }] }
  ],
  "connections": [
    { "tag": "Relationship", "from": "be-pull", "to": "be-migrate" },
    { "tag": "Relationship", "from": "be-migrate", "to": "be-deploy" },
    { "tag": "Relationship", "from": "be-deploy", "to": "be-health" },
    { "tag": "Relationship", "from": "be-health", "to": "be-tg" },

    { "tag": "Relationship", "from": "bff-ansible", "to": "bff-pull" },
    { "tag": "Relationship", "from": "bff-pull", "to": "bff-compose" },
    { "tag": "Relationship", "from": "bff-compose", "to": "bff-health" },
    { "tag": "Relationship", "from": "bff-health", "to": "bff-tg" },

    { "tag": "Relationship", "from": "fe-build", "to": "fe-stats" },
    { "tag": "Relationship", "from": "fe-stats", "to": "fe-deploy-s3" },
    { "tag": "Relationship", "from": "fe-deploy-s3", "to": "fe-canary" },
    { "tag": "Relationship", "from": "fe-canary", "to": "fe-health-canary" },
    { "tag": "Relationship", "from": "fe-health-canary", "to": "fe-observe" },
    { "tag": "Relationship", "from": "fe-observe", "to": "fe-promote" },
    { "tag": "Relationship", "from": "fe-promote", "to": "fe-health" },
    { "tag": "Relationship", "from": "fe-health", "to": "fe-tg" },

    { "tag": "Relationship", "from": "rb-switch", "to": "rb-health" },
    { "tag": "Relationship", "from": "rb-health", "to": "rb-tg" },

    { "tag": "Relationship", "from": "e2e-run", "to": "e2e-upload" },
    { "tag": "Relationship", "from": "e2e-upload", "to": "e2e-tg" },
    { "tag": "Relationship", "from": "e2e-run", "to": "moon", "label": "remote browsers" },
    { "tag": "Relationship", "from": "e2e-run", "to": "reportportal", "label": "live results" },

    { "tag": "Relationship", "from": "pr-clone", "to": "pr-build" },
    { "tag": "Relationship", "from": "pr-build", "to": "pr-deploy" },
    { "tag": "Relationship", "from": "pr-deploy", "to": "pr-domain" },
    { "tag": "Relationship", "from": "pr-destroy", "to": "pr-release" },

    { "tag": "Relationship", "from": "be-pull", "to": "docker-registry" },
    { "tag": "Relationship", "from": "bff-pull", "to": "docker-registry" },
    { "tag": "Relationship", "from": "fe-stats", "to": "relative-ci" },
    { "tag": "Relationship", "from": "fe-deploy-s3", "to": "s3", "label": "releases/<id>/" },
    { "tag": "Relationship", "from": "fe-promote", "to": "s3", "label": "current.json" },
    { "tag": "Relationship", "from": "rb-switch", "to": "s3", "label": "current.json" },
    { "tag": "Relationship", "from": "fe-canary", "to": "unleash" },
    { "tag": "Relationship", "from": "e2e-upload", "to": "allure" },
    { "tag": "Relationship", "from": "vps5", "to": "telegram", "label": "Send to tg" }
  ]
}
```

- [ ] **Step 3: validate**

Run: `npm run validate`
Expected: `ok` для трёх файлов.

- [ ] **Step 4: render и осмотр**

Run: `npm run render`, открыть `dist/cd.png` через Read.

Проверить: группа «Ansible playbook» внутри «BFF CD» не наезжает на заголовок, «Frontend CD» помещается в ширину VPS 5, три стрелки к `s3` не сливаются в одну (если сливаются, раздвинуть `s3`, `unleash`, `relative-ci` по вертикали на 140). Правки кратны 20, повтор Step 3–4.

- [ ] **Step 5: коммит**

```bash
git add diagrams/cd.json
git commit -m "Add CD diagram: ARC pipelines on VPS 5 and Coolify previews on VPS 7

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `diagrams/integrations.json`

**Files:**
- Create: `diagrams/integrations.json`

**Interfaces:**
- Consumes: `icons.txt`, `npm run validate`, `npm run render`.
- Produces: `dist/integrations.html`, `dist/integrations.png`.

Раскладка. Слева группа «Наша инфраструктура» `(0, 0)` `320×300` с четырьмя узлами в два ряда. В центре Client `(560, 120)`. Справа группы ЮMoney `(800, 0)` и VK Cloud `(800, 200)`. Нижний ряд одиночных внешних сервисов на `y=440`.

Cloudflare Turnstile, VK ID, VK Cloud Voice и Allure TestOps в исходной доске не имеют связей. Они остаются узлами без стрелок: это инвентарь внешних сервисов, связи не выдумываем.

- [ ] **Step 1: проверить имена иконок**

Run (Bash): `for i in cloud server go bell chrome globe monitor user telegram storybook posthog cloudflare; do printf '%s ' $i; grep -xc "$i" icons.txt; done`
Expected: у каждого `1`.

- [ ] **Step 2: записать диаграмму**

`diagrams/integrations.json`:

```json
{
  "entities": [
    { "tag": "Group", "id": "ours", "x": 0, "y": 0, "width": 320, "height": 300, "isContainer": true, "title": { "text": "Наша инфраструктура (Selectel)", "icon": "cloud" } },
    { "tag": "Icon", "id": "caddy-vps1", "x": 40, "y": 60, "containerId": "ours", "icon": "server", "texts": [{ "text": "Caddy (VPS 1)" }] },
    { "tag": "Icon", "id": "go-vps2", "x": 180, "y": 60, "containerId": "ours", "icon": "go", "texts": [{ "text": "Go API (VPS 2)" }] },
    { "tag": "Icon", "id": "caddy-vps3", "x": 40, "y": 180, "containerId": "ours", "icon": "server", "texts": [{ "text": "Caddy (VPS 3)" }] },
    { "tag": "Icon", "id": "alertmanager", "x": 180, "y": 180, "containerId": "ours", "icon": "bell", "texts": [{ "text": "Alert Manager (VPS 3)" }] },

    { "tag": "Icon", "id": "client", "x": 560, "y": 120, "icon": "chrome", "texts": [{ "text": "Client (браузер)" }] },

    { "tag": "Group", "id": "yoomoney", "x": 800, "y": 0, "width": 280, "height": 160, "isContainer": true, "title": { "text": "ЮMoney", "icon": "globe" } },
    { "tag": "Icon", "id": "yoomoney-api", "x": 820, "y": 40, "containerId": "yoomoney", "icon": "globe", "texts": [{ "text": "ЮMoney API" }] },
    { "tag": "Icon", "id": "yoomoney-page", "x": 960, "y": 40, "containerId": "yoomoney", "icon": "monitor", "texts": [{ "text": "Страница оплаты" }] },

    { "tag": "Group", "id": "vk-cloud", "x": 800, "y": 200, "width": 420, "height": 160, "isContainer": true, "title": { "text": "VK Cloud", "icon": "cloud" } },
    { "tag": "Icon", "id": "vk-id", "x": 820, "y": 240, "containerId": "vk-cloud", "icon": "user", "texts": [{ "text": "VK ID" }] },
    { "tag": "Icon", "id": "vk-voice", "x": 960, "y": 240, "containerId": "vk-cloud", "icon": "cloud", "texts": [{ "text": "VK Cloud Voice" }] },
    { "tag": "Icon", "id": "app-tracer", "x": 1100, "y": 240, "containerId": "vk-cloud", "icon": "monitor", "texts": [{ "text": "App Tracer" }] },

    { "tag": "Icon", "id": "telegram", "x": 300, "y": 440, "icon": "telegram", "texts": [{ "text": "Telegram" }] },
    { "tag": "Icon", "id": "storybook-pages", "x": 440, "y": 440, "icon": "storybook", "texts": [{ "text": "Storybook (Pages)" }] },
    { "tag": "Icon", "id": "allure", "x": 580, "y": 440, "icon": "monitor", "texts": [{ "text": "Allure TestOps" }] },
    { "tag": "Icon", "id": "posthog", "x": 720, "y": 440, "icon": "posthog", "texts": [{ "text": "PostHog" }] },
    { "tag": "Icon", "id": "one-signal", "x": 860, "y": 440, "icon": "bell", "texts": [{ "text": "One Signal" }] },
    { "tag": "Icon", "id": "relative-ci", "x": 1000, "y": 440, "icon": "monitor", "texts": [{ "text": "Relative CI" }] },
    { "tag": "Icon", "id": "cloudflare", "x": 1140, "y": 440, "icon": "cloudflare", "texts": [{ "text": "Cloudflare Turnstile" }] }
  ],
  "connections": [
    { "tag": "Relationship", "from": "client", "to": "caddy-vps1", "label": "https://site.ru, /api" },
    { "tag": "Relationship", "from": "client", "to": "caddy-vps3", "label": "grafana.site.ru, faro-метрики" },
    { "tag": "Relationship", "from": "client", "to": "yoomoney-page", "label": "оплата" },
    { "tag": "Relationship", "from": "yoomoney-page", "to": "yoomoney-api" },
    { "tag": "Relationship", "from": "yoomoney-api", "to": "caddy-vps1", "label": "/payment-callback" },
    { "tag": "Relationship", "from": "client", "to": "app-tracer" },
    { "tag": "Relationship", "from": "app-tracer", "to": "telegram", "label": "frontend alerts" },
    { "tag": "Relationship", "from": "alertmanager", "to": "telegram", "label": "backend alerts" },
    { "tag": "Relationship", "from": "client", "to": "storybook-pages", "label": "storybook.site.ru" },
    { "tag": "Relationship", "from": "client", "to": "posthog", "label": "posthog.site.ru" },
    { "tag": "Relationship", "from": "go-vps2", "to": "posthog" },
    { "tag": "Relationship", "from": "client", "to": "one-signal", "label": "sdk" },
    { "tag": "Relationship", "from": "go-vps2", "to": "one-signal" },
    { "tag": "Relationship", "from": "client", "to": "relative-ci", "label": "app.relative-ci.com" }
  ]
}
```

- [ ] **Step 3: validate**

Run: `npm run validate`
Expected: `ok` для четырёх файлов.

- [ ] **Step 4: render и осмотр**

Run: `npm run render`, открыть `dist/integrations.png` через Read.

Проверить: заголовок «Наша инфраструктура (Selectel)» помещается в 320 (иначе расширить группу до 380 и сдвинуть Client на `x=620`), подписи ряда `y=440` не наезжают друг на друга, много стрелок из `client` не сливаются. Правки кратны 20, повтор Step 3–4.

- [ ] **Step 5: полная сборка и коммит**

Run: `npm run build`
Expected: `dist/` содержит `index.html`, `deployment.html`, `ci.html`, `cd.html`, `integrations.html` и четыре `.png`. `dist/index.html: 4 diagrams`.

Run (Bash): `grep -c 'file://' dist/*.html; grep -ohE 'https?://[^"]+' dist/*.html | sort -u`
Expected: у каждого файла `0`; единственный URL `http://www.w3.org/2000/svg`.

```bash
git add diagrams/integrations.json
git commit -m "Add integrations diagram: external services and who talks to them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Скилл `.claude/skills/eraser-diagrams/SKILL.md`

**Files:**
- Create: `.claude/skills/eraser-diagrams/SKILL.md`

**Interfaces:**
- Consumes: `npm run validate`, `npm run render`, `icons.txt`, `npx eraser-diagrams schema <Tag>`.

- [ ] **Step 1: записать скилл**

```markdown
---
name: eraser-diagrams
description: Use when creating or editing diagrams/*.json (eraser-diagrams JSON) — required fields, absolute coordinates, icon lookup, validate → render → inspect loop
---

# Правка диаграмм eraser-diagrams

Применяй при любой правке `diagrams/*.json`. Один файл = одна диаграмма =
одна страница на GitHub Pages. Схемы не сливать.

## Формат, который принимает CLI 0.1.0

- Документ: `{ "entities": [...], "connections": [...] }`.
- Теги с учётом регистра: `Group`, `Icon`, `Activity`, `Textbox`, `Relationship`.
  `group` не распознаётся.
- У каждой сущности обязательны `tag`, `id`, `x`, `y`. У `Textbox` ещё `text`.
- **Координаты абсолютные, даже у детей с `containerId`.** `containerId`
  задаёт только логическую вложенность. Позицию узла внутри группы считай
  от левого верхнего угла группы сам: первый узел на `x+20, y+40`.
- Текст: `Icon`/`Activity` → `texts: [{ "text": "..." }]`;
  `Group` → `title: { "text": "...", "icon": "..." }`; `Textbox` → `text`.
- Стрелка: `{ "tag": "Relationship", "from": "<id>", "to": "<id>", "label": "..." }`.
  `from`/`to` могут указывать на `Group`.
- Автораскладки узлов нет, раскладываются только линии.

## Сетка и размеры

- Сетка 20 px. `Icon` занимает ячейку ~100×100 (иконка + подпись снизу),
  шаг 140 по горизонтали, 120 по вертикали.
- `Activity` задавай явно `"width": 120, "height": 60`, шаг 160.
- У `Group` 40 сверху под заголовок, 20 по остальным сторонам. Ширина под
  N иконок в ряд: `140·N`, под N `Activity`: `160·N`.

## Иконки

- Имя в `icon` берётся из `icons.txt`: `grep -xi '<имя>' icons.txt` или
  `grep -i '<слово>' icons.txt`. Неизвестное имя роняет сборку.
- Нет в каталоге (caddy, loki, unleash, coolify, allure, reportportal, vk,
  onesignal, uptime-kuma, selectel) — бери общую (`server`, `database`,
  `monitor`, `bell`, `package`, `rocket`, `cloud`, `globe`) и пиши название
  в подписи.
- Обновить снимок каталога: `npm run icons`.

## Поля тега

`npx eraser-diagrams schema <Tag>` печатает JSON Schema, например
`npx eraser-diagrams schema Activity`.

## Цикл правки

1. Измени JSON.
2. `npm run validate` — схема и иконки, без браузера.
3. `npm run render` — `dist/<name>.html` и `dist/<name>.png`.
4. Открой `dist/<name>.png` через Read и проверь глазами: узлы не
   накладываются, все узлы внутри своих групп, заголовки групп не обрезаны,
   подписи читаемы.
5. Поправь координаты (кратно 20), повтори с шага 2.

## Соглашения

- `id` в kebab-case, уникальны в файле, осмысленны: `vps2-postgres`, не `n17`.
- Подписи коротко, без URL внутри `texts`; URL только в `label` стрелки.
- Хостнеймы-плейсхолдеры (`site.ru`) допустимы. Реальные IP, токены,
  внутренние адреса запрещены: репозиторий публичный.
- Никаких `x-`-полей, цветов и стилей сверх необходимого.
- Стрелки к Telegram: одна от группы, не от каждого шага «Send to tg».
- Связи не выдумывать: только те, что есть в исходнике или в задаче.
```

- [ ] **Step 2: проверить, что скилл подхватывается**

Run (Bash): `head -4 .claude/skills/eraser-diagrams/SKILL.md`
Expected: frontmatter с `name: eraser-diagrams` и `description:`. Claude Code подхватывает `.claude/skills/*/SKILL.md` из репозитория автоматически при следующем старте сессии.

- [ ] **Step 3: коммит**

```bash
git add .claude/skills/eraser-diagrams/SKILL.md
git commit -m "Add eraser-diagrams skill for Claude Code

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: GitHub Actions: `ci.yml` и `pages.yml`

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run build`, `dist/`.

- [ ] **Step 1: `ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      CHROMIUM_PATH: /usr/bin/google-chrome
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: actions/cache@v4
        with:
          path: .eraser/icons
          key: icons-${{ hashFiles('diagrams/*.json') }}
          restore-keys: |
            icons-
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: diagrams
          path: dist
```

- [ ] **Step 2: `pages.yml`**

```yaml
name: Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      CHROMIUM_PATH: /usr/bin/google-chrome
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: actions/cache@v4
        with:
          path: .eraser/icons
          key: icons-${{ hashFiles('diagrams/*.json') }}
          restore-keys: |
            icons-
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: локальная проверка синтаксиса**

Run (Bash): `node -e "for (const f of ['ci','pages']) { const s=require('fs').readFileSync('.github/workflows/'+f+'.yml','utf8'); if(!/runs-on: ubuntu-latest/.test(s)) throw f }" && echo ok`
Expected: `ok`. Полноценная проверка происходит на GitHub в Task 10.

- [ ] **Step 4: коммит**

```bash
git add .github/workflows/ci.yml .github/workflows/pages.yml
git commit -m "Add GitHub Actions: CI build on PRs, Pages deploy from main

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: README, приёмка по §8 спеки, публикация

**Files:**
- Modify: `README.md`

Шаги 4–6 требуют `git push` и изменения настроек репозитория на GitHub. Это внешние действия: выполнять только после явного подтверждения пользователя.

- [ ] **Step 1: `README.md`**

````markdown
# diagrams

Архитектурные схемы как код. Исходники в `diagrams/*.json` в формате
[eraser-diagrams](https://github.com/eraserlabs/eraser-diagrams), рендер
в HTML и PNG, публикация на GitHub Pages:
**https://yarikmix.github.io/diagrams/**

| Схема | Что показывает |
| --- | --- |
| [deployment](https://yarikmix.github.io/diagrams/deployment.html) | VPS в Selectel, S3/CDN, клиент |
| [ci](https://yarikmix.github.io/diagrams/ci.html) | GitHub-репозитории, CI-пайплайны и их цели |
| [cd](https://yarikmix.github.io/diagrams/cd.html) | CD-пайплайны на VPS 5 / ARC и VPS 7 / Coolify |
| [integrations](https://yarikmix.github.io/diagrams/integrations.html) | Внешние сервисы и кто с ними говорит |

## Локально

Нужны Node ≥ 22.12 и Google Chrome (или другой Chromium; путь в
переменной `CHROMIUM_PATH`).

```bash
npm ci
npm run validate   # схема и иконки, без браузера
npm run render     # dist/<name>.html и dist/<name>.png
npm run build      # validate + render + dist/index.html
npm run icons      # обновить icons.txt из каталога иконок Eraser
npm test
```

## Как править

Диаграммы правит агент Claude Code по скиллу
`.claude/skills/eraser-diagrams/SKILL.md`: изменить JSON, `npm run validate`,
`npm run render`, посмотреть PNG, поправить координаты. Координаты
абсолютные, автораскладки узлов нет. Имена иконок в `icons.txt`.

CI на pull request валидирует и рендерит схемы, артефакт `diagrams`
содержит `dist/`. Push в `main` публикует `dist/` на Pages.

Дизайн: `docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md`.
````

- [ ] **Step 2: локальная приёмка**

Run: `npm test && npm run build`
Expected: тесты `# fail 0`; в `dist/` девять файлов: `index.html`, четыре `.html`, четыре `.png`.

Run (Bash): `grep -c 'file://' dist/*.html; grep -ohE 'https?://[^"]+' dist/*.html | sort -u; ls dist`
Expected: у каждого `.html` `0`; единственный URL `http://www.w3.org/2000/svg`.

Run: `npm run icons && git diff --stat icons.txt`
Expected: пустой diff.

Открыть четыре PNG через Read и убедиться, что критерии §8 спеки выполнены (узлы не накладываются, внутри групп, подписи читаемы).

- [ ] **Step 3: коммит**

```bash
git add README.md
git commit -m "Write README: Pages links, local workflow, how to edit diagrams

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: (после подтверждения пользователя) push и включение Pages**

```bash
git push origin main
```

Пользователь один раз вручную: Settings → Pages → Build and deployment → Source → **GitHub Actions**. После этого `workflow_dispatch` или следующий push в `main` запускает `pages.yml`.

Run: `gh run watch` (последний запуск `Pages`)
Expected: jobs `build` и `deploy` зелёные, `https://yarikmix.github.io/diagrams/` открывает `index.html` с четырьмя карточками, каждая ссылка `.html` открывается.

- [ ] **Step 5: (после подтверждения пользователя) негативный тест CI**

```bash
git checkout -b test/broken-icon
node -e "const f='diagrams/deployment.json';const fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('\"icon\": \"chrome\"','\"icon\": \"no-such-icon\"'))"
git commit -am "test: unknown icon must fail CI"
git push -u origin test/broken-icon
gh pr create --fill --title "test: unknown icon must fail CI" --body "Проверка §8 спеки: CI должен упасть на E_UNKNOWN_ICON.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh run watch
```

Expected: workflow `CI` красный, в логе шага `npm run build` строка с `E_UNKNOWN_ICON`.

Затем закрыть PR без merge и удалить ветку:

```bash
gh pr close --delete-branch test/broken-icon
git checkout main
git branch -D test/broken-icon
```

- [ ] **Step 6: итог**

Сообщить пользователю: ссылка на Pages, список четырёх схем, что CI падает на неизвестной иконке, и что `.eraser/icons` кэшируется по хэшу `diagrams/*.json`.
