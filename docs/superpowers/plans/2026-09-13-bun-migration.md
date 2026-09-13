# Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Установка зависимостей, запуск наших скриптов, тесты и CI переходят с npm/node на bun; рендерер eraser-diagrams остаётся на node.

**Architecture:** `bun install` и `bun.lock` заменяют `npm ci` и `package-lock.json`. Все npm-скрипты вызывают `bun`. Обёртка `scripts/eraser.mjs` запускает CLI рендерера через `node` из PATH, потому что под bun запуск Chrome зависает. Тесты остаются на `node:test` и выполняются `bun test`. Оба workflow ставят bun и node.

**Tech Stack:** bun 1.3.13, Node ≥ 22.12 (только рендерер), `@eraserlabs/diagrams-cli@0.1.0`, GitHub Actions (`oven-sh/setup-bun@v2`, `actions/setup-node@v4`).

**Spec:** `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`, часть A (§2.1, §3, §6). Контекст: `docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md`.

## Global Constraints

- bun `1.3.13` в CI (`bun-version: 1.3.13`), локально bun ≥ 1.3. Node ≥ 22.12 нужен только рендереру.
- `package.json` `engines`: `{ "node": ">=22.12", "bun": ">=1.3" }`. `devDependencies` без изменений: `"@eraserlabs/diagrams-cli": "0.1.0"`, без `^`.
- `bun.lock` коммитится, `package-lock.json` удаляется.
- Никаких runtime-зависимостей. Скрипты только на `node:*` и глобальном `fetch`, ESM `*.mjs`.
- Тесты остаются на `node:test` и `node:assert/strict`, запуск `bun test`. На `bun:test` не переписывать.
- CLI рендерера всегда запускается через `node`, никогда через `process.execPath`: под bun `process.execPath` это `bun.exe`, и рендер зависает на запуске Chrome.
- После плана `grep -rnwE 'npm|npx' package.json README.md .github .claude/skills` ничего не находит.
- Кэш иконок, артефакты, деплой Pages, права токена и concurrency в workflow не меняются.
- Коммит-сообщения пишутся в файл через Bash heredoc и коммитятся `git commit -F <файл>`; PowerShell here-strings не использовать. Каждое сообщение заканчивается строкой `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ничего не пушить и не менять настройки репозитория без явного запроса пользователя (Task 4 оговаривает это отдельно).

---

## File Structure

| Файл | Изменение |
| --- | --- |
| `package.json` | `engines`, скрипты на bun |
| `bun.lock` | создаётся `bun install` |
| `package-lock.json` | удаляется |
| `scripts/eraser.mjs` | `rendererCommand`, запуск через `node`, ошибка ENOENT |
| `scripts/eraser.test.mjs` | тест `rendererCommand` |
| `scripts/build-index.mjs`, `scripts/fetch-icons.mjs` | строка «Использование» в шапке |
| `.github/workflows/ci.yml`, `.github/workflows/pages.yml` | setup-bun, bun install, bun run |
| `README.md` | требования и команды на bun |
| `.claude/skills/eraser-diagrams/SKILL.md` | команды на bun |

---

### Task 1: bun как пакетный менеджер и раннер, рендерер под node

**Files:**
- Modify: `package.json`
- Create: `bun.lock` (генерирует `bun install`)
- Delete: `package-lock.json`
- Modify: `scripts/eraser.mjs`
- Modify: `scripts/eraser.test.mjs`
- Modify: `scripts/build-index.mjs:3`, `scripts/fetch-icons.mjs:3`

**Interfaces:**
- Consumes: существующие экспорты `scripts/eraser.mjs`: `listDiagrams(dir = "diagrams"): string[]`, `cliEntry(): string`, `buildArgs(command: string, files: string[], extra: string[]): string[]`.
- Produces: `rendererCommand(command: string, files: string[], extra: string[]): { cmd: string, args: string[] }`; npm-скрипты `test`, `validate`, `render`, `index`, `build`, `icons`, вызываемые через `bun run <script>`.

- [ ] **Step 1: `package.json` на bun**

Заменить содержимое `package.json` целиком:

```json
{
  "name": "diagrams",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12", "bun": ">=1.3" },
  "scripts": {
    "test": "bun test",
    "validate": "bun scripts/eraser.mjs validate",
    "render": "bun scripts/eraser.mjs render -f html && bun scripts/eraser.mjs render -f png",
    "index": "bun scripts/build-index.mjs",
    "build": "bun run validate && bun run render && bun run index",
    "icons": "bun scripts/fetch-icons.mjs"
  },
  "devDependencies": {
    "@eraserlabs/diagrams-cli": "0.1.0"
  }
}
```

- [ ] **Step 2: lockfile**

Run (Bash):

```bash
bun install
git rm -q package-lock.json
bun install --frozen-lockfile
ls bun.lock node_modules/@eraserlabs/diagrams/fonts/Inter.var.woff2
```

Expected: `bun install` сообщает об установке, `+ @eraserlabs/diagrams-cli@0.1.0`; второй запуск с `--frozen-lockfile` завершается без ошибки; `ls` показывает оба пути. Если `bun install` предложит мигрировать `package-lock.json`, это нормально, итоговая версия CLI должна остаться `0.1.0`: `node -e "console.log(require('./node_modules/@eraserlabs/diagrams-cli/package.json').version)"` печатает `0.1.0`.

- [ ] **Step 3: базовый прогон тестов под bun**

Run: `bun run test`
Expected: `9 pass`, `0 fail`, `Ran 9 tests across 3 files`.

- [ ] **Step 4: падающий тест `rendererCommand`**

В `scripts/eraser.test.mjs` заменить строку импорта

```js
import { listDiagrams, buildArgs, cliEntry } from "./eraser.mjs";
```

на

```js
import { listDiagrams, buildArgs, cliEntry, rendererCommand } from "./eraser.mjs";
```

и добавить в конец файла:

```js
test("rendererCommand runs the CLI under node, not under the current runtime", () => {
  const { cmd, args } = rendererCommand("render", ["diagrams/a.json"], ["-f", "html"]);
  assert.equal(cmd, "node");
  assert.equal(args[0], cliEntry());
  assert.deepEqual(args.slice(1), ["render", "diagrams/a.json", "-f", "html"]);
});
```

- [ ] **Step 5: убедиться, что тест падает**

Run: `bun test scripts/eraser.test.mjs`
Expected: FAIL, `SyntaxError: Export named 'rendererCommand' not found in module`.

- [ ] **Step 6: реализация в `scripts/eraser.mjs`**

Заменить шапку файла (строки 1–3)

```js
// Обёртка над eraser-diagrams CLI. Подставляет diagrams/*.json вместо glob,
// потому что cmd.exe на Windows glob не раскрывает, а CLI сам этого не делает.
// Использование: node scripts/eraser.mjs <command> [cli options...]
```

на

```js
// Обёртка над eraser-diagrams CLI. Подставляет diagrams/*.json вместо glob,
// потому что cmd.exe на Windows glob не раскрывает, а CLI сам этого не делает.
// CLI запускается под node: под bun запуск Chrome зависает
// (docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md §2.1).
// Использование: bun scripts/eraser.mjs <command> [cli options...]
```

После функции `buildArgs` добавить:

```js
export function rendererCommand(command, files, extra) {
  return { cmd: "node", args: [cliEntry(), ...buildArgs(command, files, extra)] };
}
```

Заменить функцию `main` целиком на:

```js
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
```

- [ ] **Step 7: тест проходит**

Run: `bun run test`
Expected: `10 pass`, `0 fail`.

- [ ] **Step 8: шапки остальных скриптов**

В `scripts/build-index.mjs` строка 3: `// Использование: node scripts/build-index.mjs` заменить на `// Использование: bun scripts/build-index.mjs`.
В `scripts/fetch-icons.mjs` строка 3: `// Использование: node scripts/fetch-icons.mjs` заменить на `// Использование: bun scripts/fetch-icons.mjs`.

- [ ] **Step 9: сквозная сборка**

Run (Bash):

```bash
bun scripts/eraser.mjs; echo "exit=$?"
bun run build
ls dist
grep -c 'file://' dist/*.html
```

Expected: первая команда печатает `usage: bun scripts/eraser.mjs <command> [cli options...]` и `exit=2`. `bun run build` печатает `ok` для четырёх схем в `validate`, по четыре строки `ok ... → dist\<name>.html` и `→ dist\<name>.png`, затем `dist/index.html: 4 diagrams`, и завершается без зависания (порядка 30 секунд). `ls dist` показывает `cd.html cd.png ci.html ci.png deployment.html deployment.png index.html integrations.html integrations.png`. Каждый счётчик `file://` равен `0`.

- [ ] **Step 10: коммит**

```bash
git add package.json bun.lock scripts/eraser.mjs scripts/eraser.test.mjs scripts/build-index.mjs scripts/fetch-icons.mjs
git status --short
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Switch package manager, scripts and tests to bun; keep the renderer on node

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
git log -1 --format=%B | cat -A | grep -c '^@'
```

Expected: `git status --short` перед коммитом показывает `M package.json`, `A bun.lock`, `D package-lock.json` и три `M scripts/...`; последняя команда печатает `0`.

---

### Task 2: CI на bun

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `bun.lock`, скрипты `test` и `build` из Task 1.
- Produces: workflow, которые ставят bun `1.3.13` и Node 22 и запускают `bun install --frozen-lockfile`, `bun run test`, `bun run build`.

- [ ] **Step 1: `ci.yml`**

Заменить содержимое `.github/workflows/ci.yml` целиком:

```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore:
      - main

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
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
      - run: bun run build
      - uses: actions/upload-artifact@v4
        with:
          name: diagrams
          path: dist
```

- [ ] **Step 2: `pages.yml`**

Заменить содержимое `.github/workflows/pages.yml` целиком:

```yaml
name: Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
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
      - run: bun run build
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

- [ ] **Step 3: локальная проверка**

Run (Bash):

```bash
grep -nE 'npm|setup-bun|bun-version|setup-node|node-version|frozen-lockfile|bun run' .github/workflows/ci.yml .github/workflows/pages.yml
grep -c $'\t' .github/workflows/ci.yml .github/workflows/pages.yml
git diff --check
```

Expected: в первом выводе нет строк с `npm`; в каждом файле есть `oven-sh/setup-bun@v2`, `bun-version: 1.3.13`, `actions/setup-node@v4`, `node-version: 22`, `bun install --frozen-lockfile`, `bun run test`, `bun run build`. Счётчики табов `0`. `git diff --check` пуст.

- [ ] **Step 4: коммит**

```bash
git add .github/workflows/ci.yml .github/workflows/pages.yml
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Run CI and Pages builds with bun, keep Node 22 for the renderer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 3: README и скилл на bun

**Files:**
- Modify: `README.md`
- Modify: `.claude/skills/eraser-diagrams/SKILL.md`

**Interfaces:**
- Consumes: скрипты из Task 1.
- Produces: тексты README и SKILL.md, на которые опирается план цветовой конвенции (`docs/superpowers/plans/2026-09-13-diagram-colors.md`, Task 4 правит их точечными заменами, поэтому формулировки ниже переносить дословно).

- [ ] **Step 1: `README.md`**

Заменить содержимое `README.md` целиком:

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

Таблица ведётся вручную: добавил файл в `diagrams/`, добавь строку сюда.
`dist/index.html` собирается автоматически.

## Локально

Нужны bun ≥ 1.3, Node ≥ 22.12 и Google Chrome (или другой Chromium; путь в
переменной `CHROMIUM_PATH`). bun ставит зависимости и запускает скрипты и
тесты. Рендерер eraser-diagrams запускается под Node: под bun он зависает
на запуске Chrome.

```bash
bun install
bun run validate   # схема и иконки, без браузера
bun run render     # dist/<name>.html и dist/<name>.png
bun run build      # validate + render + dist/index.html
bun run icons      # обновить icons.txt из каталога иконок Eraser
bun run test
```

## Как править

Диаграммы правит агент Claude Code по скиллу
`.claude/skills/eraser-diagrams/SKILL.md`: изменить JSON, `bun run validate`,
`bun run render`, посмотреть PNG, поправить координаты. Координаты
абсолютные, автораскладки узлов нет. Имена иконок в `icons.txt`.
Рендер автономен: в `dist/*.html` нет `file://` и внешних `src`,
`<link>`, `@import`, `url()`; ссылки `https://…` допустимы только внутри
`<a href>` (CLI делает их из подписей стрелок).

CI на pull request валидирует и рендерит схемы, артефакт `diagrams`
содержит `dist/`. Push в `main` публикует `dist/` на Pages. Один раз
вручную: Settings → Pages → Build and deployment → Source → GitHub
Actions, иначе job `deploy` падает с «Get Pages site failed».

Дизайн: `docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md`,
`docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`.
````

- [ ] **Step 2: `SKILL.md`, точечные замены**

В `.claude/skills/eraser-diagrams/SKILL.md` сделать ровно эти замены (каждая строка-источник встречается в файле один раз):

1. Строку

   ```
   - Обновить снимок каталога: `npm run icons`.
   ```

   заменить на

   ```
   - Обновить снимок каталога: `bun run icons`.
   ```

2. Две строки

   ```
   `npx eraser-diagrams schema <Tag>` печатает JSON Schema, например
   `npx eraser-diagrams schema Activity`.
   ```

   заменить на

   ```
   `bunx eraser-diagrams schema <Tag>` печатает JSON Schema, например
   `bunx eraser-diagrams schema Activity`.
   ```

3. Строку

   ```
   2. `npm run validate` — схема и иконки, без браузера.
   ```

   заменить на

   ```
   2. `bun run validate` — схема и иконки, без браузера.
   ```

4. Три строки

   ```
   3. `npm run render` — `dist/<name>.html` и `dist/<name>.png`; нужен Chrome или
      другой Chromium; если автопоиск не находит его, задай переменную
      `CHROMIUM_PATH`.
   ```

   заменить на

   ```
   3. `bun run render` — `dist/<name>.html` и `dist/<name>.png`; рендерер
      запускается под Node ≥ 22.12 из PATH (под bun Chrome не стартует); нужен
      Chrome или другой Chromium; если автопоиск не находит его, задай
      переменную `CHROMIUM_PATH`.
   ```

5. Строку

   ```
   6. Перед коммитом: `npm test` и `npm run build` (то же, что делает CI).
   ```

   заменить на

   ```
   6. Перед коммитом: `bun run test` и `bun run build` (то же, что делает CI).
   ```

- [ ] **Step 3: проверка**

Run (Bash):

```bash
grep -rnwE 'npm|npx' package.json README.md .github .claude/skills; echo "exit=$?"
head -4 .claude/skills/eraser-diagrams/SKILL.md
grep -n 'bun run\|bunx\|Node ≥ 22.12' .claude/skills/eraser-diagrams/SKILL.md README.md
git diff --check
```

Expected: первая команда ничего не печатает, `exit=1`. Frontmatter начинается с `---`, `name: eraser-diagrams`. Во втором grep есть строки с `bun run icons`, `bunx eraser-diagrams schema`, `bun run validate`, `bun run render`, `bun run test`, `bun run build` в SKILL.md и `Node ≥ 22.12` в обоих файлах. `git diff --check` пуст.

- [ ] **Step 4: коммит**

```bash
git add README.md .claude/skills/eraser-diagrams/SKILL.md
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Docs: bun commands in README and the eraser-diagrams skill

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 4: Приёмка части A в CI

Шаги 2–3 пушат ветку и создают PR на GitHub. Это внешние действия: выполнять только после явного подтверждения пользователя.

**Files:** нет изменений.

- [ ] **Step 1: локальная приёмка по §3.6 спеки**

Run (Bash):

```bash
test ! -e package-lock.json && test -e bun.lock && echo lock-ok
grep -rnwE 'npm|npx' package.json README.md .github .claude/skills; echo "grep-exit=$?"
rm -rf node_modules dist
bun install --frozen-lockfile && bun run test && bun run build
ls dist | wc -l
git status --short
```

Expected: `lock-ok`; `grep-exit=1`; тесты `10 pass`, `0 fail`; сборка без ошибок; `9` файлов в `dist`; `git status --short` пуст.

- [ ] **Step 2: (после подтверждения пользователя) push и PR**

```bash
git push -u origin HEAD
BODY="$(mktemp)"
cat > "$BODY" <<'EOF'
Миграция на bun по `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`, часть A.

- `bun install` и `bun.lock` вместо npm, скрипты и тесты через bun
- рендерер eraser-diagrams запускается под node: под bun запуск Chrome зависает (§2.1 спеки)
- CI и Pages: `oven-sh/setup-bun@v2` 1.3.13 плюс Node 22

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --base main --title "Migrate tooling to bun, keep the renderer on node" --body-file "$BODY"
```

- [ ] **Step 3: (после подтверждения пользователя) CI зелёный**

Run: `gh run watch --exit-status` для последнего запуска `CI` на ветке.
Expected: job `build` зелёный; в логе шага `bun run test` строка `10 pass`; в логе `bun run build` строка `dist/index.html: 4 diagrams`.
