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

Решения:

- Сборка и деплой идут только с ref `main`, поэтому правило окружения
  `github-pages` не меняется, а публикует всегда код workflow из `main`.
- `dispatch` не собирает ничего и имеет только `actions: write`.
  Условие `!github.event.deleted` защищает от push-события удаления ветки.
- Concurrency: запуски от `main` идут в группе `pages-main` без отмены
  запущенного, GitHub держит в очереди только последний ожидающий, и он
  пересобирает всё актуальное. Запуски `dispatch` получают уникальную группу
  и в очереди не стоят.
- `timeout-minutes` у `build` растёт с 15 до 45: сайт собирает все ветки,
  у каждой свой лимит 5 минут (§4).
- Шаг `bun run build` в `build` заменяется на `bun run site`, который сам
  вызывает `bun run build` для `main`.

## 4. Скрипт `scripts/build-site.mjs`

Запуск: `bun run site` (`package.json`: `"site": "bun scripts/build-site.mjs"`).
Без зависимостей, ESM, только `node:*`.

### 4.1 Порядок

1. `bun run build` в текущем каталоге. Код выхода не 0: скрипт печатает
   ошибку и выходит с кодом 1, ветки не собираются.
2. `git fetch --depth=1 --no-tags origin +refs/heads/*:refs/remotes/origin/*`.
   Ошибка fetch: выход 1.
3. Список веток: `git for-each-ref --format=%(refname:strip=3) %(objectname) refs/remotes/origin`,
   без `HEAD` и `main`. Слаги по §4.2.
4. Для каждой ветки по алфавиту:
   1. `git worktree add --detach <tmp>/<slug> <sha>`, где `<tmp>` это
      `mkdtempSync(join(tmpdir(), "diagrams-previews-"))`.
   2. В каталоге ветки `bun install --frozen-lockfile`, затем `bun run build`.
      У каждой команды `timeout` 5 минут в `spawnSync`, `stdio: "inherit"`,
      переменные окружения наследуются.
   3. Успех, если обе команды вышли с кодом 0 и есть `dist/index.html`.
      Тогда `dist/` ветки копируется в `dist/branches/<slug>/` основного
      каталога.
   4. Иначе статус `failed` и имя шага: `worktree`, `bun install`,
      `bun run build` или `dist`.
   5. `git worktree remove --force <tmp>/<slug>` в любом случае.
5. `dist/branches/index.html` по §5.
6. `dist/index.html` перезаписывается `renderIndex(diagramNames(), { previewsHref: "branches/" })`.
7. Если задана `GITHUB_STEP_SUMMARY`, в неё дописывается список веток со
   статусами.
8. Выход 0, даже если какие-то ветки `failed`.

### 4.2 Экспортируемые функции

- `branchSlug(name: string): string`: символы вне `[A-Za-z0-9._-]` заменяются
  на `-`, подряд идущие `-` схлопываются, `-` по краям убираются; пустой
  результат даёт `branch`.
- `assignSlugs(branches: { name: string, sha: string }[]): { name, sha, slug }[]`:
  сортирует по `name`; если slug уже занят, второй ветке даётся
  `<slug>-<первые 7 символов sha>`.
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
- Ветка, собранная скриптами до миграции на bun (нет `bun.lock`), получает
  статус `failed` на шаге `bun install`. Поддержки npm нет, слитые ветки
  удаляются.

## 6. Тесты

- `scripts/build-site.test.mjs`:
  - `branchSlug`: `feature/bun-and-colors` → `feature-bun-and-colors`;
    `fix//a b` → `fix-a-b`; `схемы/новые` → `branch`; `-a-` → `a`;
    `v1.2_rc` без изменений.
  - `assignSlugs`: ветки `a/b` и `a-b` с разными sha. После сортировки по
    имени первой идёт `a-b` (код `-` меньше кода `/`), она получает slug
    `a-b`; ветка `a/b` получает `a-b-<первые 7 символов её sha>`.
  - `escapeHtml` на всех пяти символах.
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
- `bun run site` на Windows: `dist/index.html` содержит ссылку
  `branches/`; `dist/branches/index.html` есть и содержит
  `feature/eraser-pipeline` со статусом `не собралась: bun install`;
  выход 0; во временной папке не осталось worktree (`git worktree list`
  показывает только основной и уже существующие).
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
- Общий кэш иконок для веток: каждая ветка скачивает иконки в свой
  `.eraser/icons`.
- Отдельные домены или окружения на ветку.

## 10. Риски

- **Время деплоя растёт с числом веток.** Порядка полминуты на ветку плюс
  установка зависимостей. Слитые ветки нужно удалять.
- **Код веток выполняется в job сборки.** У токена там только
  `contents: read`, права на Pages только у job деплоя. Превью ветки
  публикуется на том же домене, что и `main`; писать в ветки могут только
  участники репозитория.
- **Лимит в 45 минут.** При девяти и более ветках, упирающихся в пятиминутный
  лимит, job упадёт; тогда лимит поднимается или ветки чистятся.
- **Сбой GCS или сети при сборке ветки** даёт `failed` у ветки, а не падение
  деплоя.
