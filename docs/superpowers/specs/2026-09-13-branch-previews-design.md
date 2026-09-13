# Превью веток на GitHub Pages

Дата: 2026-09-13. Репозиторий: `YarikMix/diagrams`, ветка `feature/bun-and-colors`.
Статус: на ревью. Опирается на
`docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md` §7 и
`docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` §3.
После утверждения план пишется скиллом `writing-plans`.

## 1. Цель

Схемы любой ветки можно открыть по ссылке до слияния. `main` по-прежнему
публикуется в корне `https://yarikmix.github.io/diagrams/`, каждая другая
ветка в `https://yarikmix.github.io/diagrams/branches/<slug>/`. Превью
удалённой ветки исчезает. Настройки репозитория и правило окружения
`github-pages` не меняются.

## 2. Проверенные факты

Проверено 2026-09-13 через GitHub API.

- Источник Pages: `build_type: "workflow"` (GitHub Actions). Другой источник
  ломает `actions/deploy-pages`; при «Deploy from a branch» GitHub собирает
  корень `main` через Jekyll и публикует README вместо схем.
- Окружение `github-pages`: `deployment_branch_policy.custom_branch_policies: true`,
  единственная политика `{ "name": "main", "type": "branch" }`. Деплой из
  запуска с другим ref отклоняется правилом окружения.
- `actions/deploy-pages` каждый раз заменяет сайт целиком, частичного
  обновления нет.
- Ветки на `origin` сейчас: `main`, `feature/eraser-pipeline` (слита, на npm,
  без `bun.lock`).
- Документация GitHub Actions:
  - события, созданные встроенным `GITHUB_TOKEN`, не запускают новые
    workflow, кроме `workflow_dispatch` и `repository_dispatch`;
  - запуск по событию `delete` идёт с `GITHUB_REF` основной ветки;
    `github.event.ref_type` равен `branch` или `tag`.

## 3. Триггеры и workflow

Меняется только `.github/workflows/pages.yml`. `ci.yml` без изменений.

### 3.1 События

| Событие | Job | Результат |
| --- | --- | --- |
| `push` в `main` | `build`, `deploy` | сборка всего сайта и деплой |
| `push` в другую ветку | `dispatch` | `gh workflow run pages.yml --ref main` |
| `delete` ветки | `build`, `deploy` | сборка без удалённой ветки и деплой |
| `delete` тега | нет | ничего |
| `workflow_dispatch` на `main` | `build`, `deploy` | сборка и деплой |

### 3.2 Файл

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
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.13
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - id: icons
        uses: actions/cache/restore@v4
        with:
          path: .eraser/icons
          key: icons-${{ hashFiles('diagrams/*.json') }}
          restore-keys: |
            icons-
      - run: bun install --frozen-lockfile
      - run: bun run test
      - run: bun run build
      - if: steps.icons.outputs.cache-hit != 'true'
        uses: actions/cache/save@v4
        with:
          path: .eraser/icons
          key: icons-${{ hashFiles('diagrams/*.json') }}
      - run: bun run site --main-built
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

Решения:

- Сборка и деплой идут только с ref `main`, поэтому правило окружения
  `github-pages` не меняется, а публикует всегда код workflow из `main`.
- `dispatch` не собирает ничего и имеет только `actions: write`.
  Условие `!github.event.deleted` защищает от push-события удаления ветки.
- Concurrency: запуски от `main` идут в группе `pages-main` без отмены
  запущенного, GitHub держит в очереди только последний ожидающий, и он
  пересобирает всё актуальное. Запуски `dispatch` получают уникальную группу
  и в очереди не стоят.
- `timeout-minutes` у `build` 45. Худший случай на ветку 10 минут
  (установка и сборка по 5), поэтому ветки ограничены общим бюджетом
  30 минут от начала `main()` (§4.1), и последняя начатая ветка
  укладывается в лимит job.
- `persist-credentials: false`: токен не остаётся в `.git/config`, общем
  для worktree веток.
- Кэш иконок восстанавливается до тестов и сохраняется сразу после
  сборки `main`, до запуска кода веток; `bun run site --main-built` не
  пересобирает `main`.
- Шаг `bun run build` в `build` заменяется на `bun run site`, который сам
  вызывает `bun run build` для `main`.

## 4. Скрипт `scripts/build-site.mjs`

Запуск: `bun run site` (`package.json`: `"site": "bun scripts/build-site.mjs"`).
Без зависимостей, ESM, только `node:*`.

### 4.1 Порядок

1. С флагом `--main-built` шаг `bun run build` пропускается: скрипт только
   проверяет, что `dist/index.html` уже есть, иначе печатает ошибку и
   выходит с кодом 1. Без флага `bun run build` запускается в текущем
   каталоге; код выхода не 0: скрипт печатает ошибку и выходит с кодом 1,
   ветки не собираются.
2. `shallow` — вывод `git rev-parse --is-shallow-repository` равен
   `"true"`. Дальше `fetchArgs(shallow)` (§4.2): `--depth=1` только для
   неглубокого клона, `--no-tags` и `--prune` всегда. Ошибка fetch: выход 1.
3. Список веток: `git for-each-ref --format=%(refname:strip=3) %(objectname) refs/remotes/origin`,
   без `HEAD` и `main`. Слаги по §4.2.
4. Для каждой ветки по алфавиту:
   0. Если с начала `main()` прошло больше `SITE_BRANCH_BUDGET_MS`
      (30 минут), ветка получает статус `failed` и шаг `time budget` без
      попытки сборки.
   1. `git worktree add --detach <tmp>/<slug> <sha>`, где `<tmp>` это
      `mkdtempSync(join(tmpdir(), "diagrams-previews-"))`.
   2. В каталоге ветки `bun install --frozen-lockfile`. Затем, если в
      основном каталоге есть `.eraser/icons`, он копируется в
      `.eraser/icons` ветки, чтобы ветка не качала заново те же иконки.
      Затем `bun run build`. У `bun install` и `bun run build` `timeout`
      5 минут в `spawnSync`, `killSignal: "SIGKILL"`, `stdio: "inherit"`,
      переменные окружения наследуются.
   3. Успех, если обе команды вышли с кодом 0 и есть `dist/index.html`.
      Тогда `dist/` ветки копируется в `dist/branches/<slug>/` основного
      каталога.
   4. Иначе статус `failed` и имя шага: `worktree`, `bun install`,
      `bun run build`, `dist` или `copy`; шаг, упавший по таймауту,
      получает суффикс `(timeout)` (например `bun install (timeout)`).
      Ошибка копирования кэша иконок не роняет ветку, скрипт пишет
      предупреждение и продолжает.
   5. `git worktree remove --force <tmp>/<slug>` в любом случае.
5. После цикла: `git worktree prune`, затем удаление `<tmp>` через
   `rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 3 })` в
   `try/catch` — ошибка удаления только логируется, скрипт не падает.
6. `dist/branches/index.html` по §5.
7. `dist/index.html` перезаписывается `renderIndex(diagramNames(), { previewsHref: "branches/" })`.
8. Если задана `GITHUB_STEP_SUMMARY`, в неё дописывается список веток со
   статусами.
9. Выход 0, даже если какие-то ветки `failed`.

### 4.2 Экспортируемые функции

- `branchSlug(name: string): string`: символы вне `[A-Za-z0-9._-]` заменяются
  на `-`, подряд идущие `-` схлопываются, `-` по краям убираются; пустой
  результат или результат из одних точек даёт `branch`.
- `fetchArgs(shallow: boolean): string[]`: аргументы `git fetch` — `--depth=1`
  только для неглубокого клона, `--no-tags` и `--prune` всегда.
- `assignSlugs(branches: { name: string, sha: string }[]): { name, sha, slug }[]`:
  сортирует по `name`; если slug уже занят, второй ветке даётся
  `<slug>-<первые 7 символов sha>`. Slug `index.html` считается занятым
  заранее: там лежит список превью.
- `parseBranches(output: string): { name, sha }[]`: разбирает вывод
  `git for-each-ref` из §4.1, отбрасывает `HEAD` и `main`.
- `renderSummary(entries): string`: markdown для `GITHUB_STEP_SUMMARY`,
  строка на ветку с путём превью или шагом, на котором она упала.
- `escapeHtml(text: string): string`: `&`, `<`, `>`, `"`, `'`.
- `renderPreviewsIndex(entries: { name, slug, sha, status: "ok" | "failed", failedStep?: string }[]): string`:
  один статичный HTML со встроенным CSS в стиле `build-index.mjs`, без
  `<script>` и `<link>`. Строка на ветку: экранированное имя, первые 7
  символов SHA, для `ok` ссылка `<slug>/`, для `failed` текст
  `не собралась: <failedStep>`. Пустой список даёт строку `Других веток нет.`
  Ссылка назад на `../`.

### 4.3 `scripts/build-index.mjs`

`renderIndex(names, options = {})`: если задан `options.previewsHref`,
после списка схем добавляется `<p><a href="<previewsHref>">Превью веток</a></p>`.
Без опции вывод прежний.

## 5. Страница превью

- Адрес: `https://yarikmix.github.io/diagrams/branches/`.
- Превью ветки: `https://yarikmix.github.io/diagrams/branches/<slug>/`, внутри
  тот же `index.html` со ссылками на HTML и PNG схем этой ветки.
- Ветка из эпохи npm с `package-lock.json` собирается: проверено
  2026-09-13, `bun install --frozen-lockfile` переносит lockfile, а её
  `bun run build` вызывает npm-скрипты, npm на раннере есть. Ветка без
  скрипта `build` получает `failed` на шаге `bun run build`. Отдельной
  поддержки npm нет, слитые ветки удаляются.

## 6. Тесты

- `scripts/build-site.test.mjs`:
  - `branchSlug`: `feature/bun-and-colors` → `feature-bun-and-colors`;
    `fix//a b` → `fix-a-b`; `схемы/новые` → `branch`; `-a-` → `a`;
    `v1.2_rc` без изменений.
  - `assignSlugs`: ветки `a/b` и `a-b` с разными sha. После сортировки по
    имени первой идёт `a-b` (код `-` меньше кода `/`), она получает slug
    `a-b`; ветка `a/b` получает `a-b-<первые 7 символов её sha>`.
  - `assignSlugs`: ветка `index.html` получает `index.html-<sha7>`.
  - `parseBranches`: `HEAD` и `main` отброшены, имя со слешем сохранено,
    строки с `\r\n` разбираются.
  - `escapeHtml` на всех пяти символах.
  - `renderSummary`: путь превью для `ok`, шаг для `failed`.
  - `renderPreviewsIndex`: ссылка `feature-x/` для `ok`; текст
    `не собралась: bun install` для `failed`; имя `a<b>` выводится как
    `a&lt;b&gt;`; пустой список даёт `Других веток нет.`; нет `<script>`
    и `<link>`.
- `scripts/build-index.test.mjs`: новый тест, что `renderIndex(["ci"], { previewsHref: "branches/" })`
  содержит `href="branches/"`; прежние тесты без изменений.
- Запуск git и bun в `main()` тестами не покрыт, он проверяется прогоном
  `bun run site` (§8).

## 7. Документация

- `README.md`: раздел «Превью веток» после абзаца про CI: адрес превью,
  что оно обновляется после push в ветку через запуск Pages на `main`,
  что после удаления ветки превью исчезает при следующем запуске, что
  ветка без bun показывается как «не собралась».
- `.claude/skills/eraser-diagrams/SKILL.md`: в «Цикл правки» после шага
  «Перед коммитом» одна строка: после push ветки превью появится по адресу
  `https://yarikmix.github.io/diagrams/branches/<slug>/`, где slug это имя
  ветки с `/` и прочими символами, заменёнными на `-`; ссылку можно дать в PR.

## 8. Приёмка

До слияния:

- `bun run test` зелёный.
- `bun run site` на Windows против временного bare-репозитория в роли
  `origin` с ветками текущей работы, веткой на коммите эпохи npm и веткой
  без `package.json`: выход 0; `dist/index.html` содержит ссылку
  `branches/`; в `dist/branches/index.html` первые две ветки со ссылками,
  третья `не собралась: bun run build`; `git worktree list` показывает
  только основной каталог.
- В `dist/**/*.html` нет `file://` и внешних `src`, `<link>`, `@import`, `url()`.
- CI в PR зелёный.

После слияния в `main`, с подтверждения пользователя:

- запуск Pages от push в `main` зелёный, `https://yarikmix.github.io/diagrams/branches/` открывается;
- push тестовой ветки: запуск `dispatch` зелёный, следом запуск от `main`
  зелёный, `https://yarikmix.github.io/diagrams/branches/<slug>/` открывается;
- удаление тестовой ветки: запуск по `delete` зелёный, превью исчезло.

## 9. Вне scope

- Поддержка веток на npm.
- Превью для PR из форков.
- Общий кэш иконок с записью обратно: ветка получает копию кэша основной
  сборки, новые иконки ветки в него не возвращаются.
- Отдельные домены или окружения на ветку.

## 10. Риски

- **Время деплоя растёт с числом веток.** Порядка полминуты на ветку плюс
  установка зависимостей. Слитые ветки нужно удалять.
- **Код веток выполняется в job, который публикует сайт.** Ветка (её
  скрипты, lifecycle-скрипты зависимостей) может изменить весь `dist/` и
  тем самым опубликованный сайт до следующего деплоя из `main`, а с
  усилием дотянуться до токена кэша раннера. Смягчения:
  `persist-credentials: false`, кэш иконок сохраняется до кода веток.
  Полная изоляция (отдельный job или запуски на ref ветки с кэшем в её
  области и передачей артефактов) не сделана и остаётся отдельной задачей.
  Писать ветки могут только участники с правом push.
- **Время.** Бюджет веток 30 минут; ветки, не начатые вовремя, помечаются
  `time budget`. Деплой `main` не блокируется.
- **Сбой GCS или сети при сборке ветки** даёт `failed` у ветки, а не падение
  деплоя. Проверено 2026-09-13: сборка ветки с пустым кэшем однажды упала с
  `E_UNKNOWN_ICON` на существующей иконке `monitor`, повтор прошёл. Копия
  кэша основной сборки уменьшает число загрузок; сбой на `main` по-прежнему
  роняет деплой.
