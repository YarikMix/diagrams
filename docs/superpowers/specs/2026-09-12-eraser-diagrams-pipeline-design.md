# Архитектурные схемы как код: eraser-diagrams + Claude Code + GitHub Pages

Дата: 2026-09-12. Репозиторий: `YarikMix/diagrams` (public, ветка `main`).
Статус: реализовано, PR #1. Дополнено спекой `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`:
миграция на bun (§2, §4, §6, §7) и цветовая конвенция (§5.6, §6).

## 1. Цель

Держать архитектурные схемы стартапа в этом репозитории как JSON в формате
[eraser-diagrams](https://github.com/eraserlabs/eraser-diagrams) (MIT), править их
агентом Claude Code, а не мышкой, и публиковать отрендеренный результат на
GitHub Pages, чтобы схему можно было открыть по ссылке.

Минимальный вариант. Никакого визуального редактора, никакого облака Eraser,
никакого MCP-сервера. Агент + CLI + GitHub Actions.

## 2. Проверенные факты об инструменте

> Дополнено: `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` §2. Рендерер по-прежнему требует Node,
> остальной тулинг на bun.

Всё ниже проверено вживую 2026-09-12 на `@eraserlabs/diagrams-cli@0.1.0`,
Node 24, Windows + Chrome. Реализующий агент должен опираться на эти факты,
а не на README, в README часть из них отсутствует.

- **Требования.** Node ≥ 22.12 и Chromium-совместимый браузер на машине,
  в пакет он не входит. Путь ищется так: флаг `--chromium-path`, потом
  переменная `CHROMIUM_PATH`, потом `chromiumPath` в конфиге, потом автопоиск.
  Автопоиск нашёл установленный Google Chrome на Windows.
- **Команды CLI.** `render <input...>` (нужен браузер), `validate <input...>`
  (браузер не нужен), `registry`, `schema <tag>`, `init`, глобальный
  `--print-config`. Точный вывод `--help` см. в приложении A.
- **Реестр тегов** стокового профиля: сущности `Shape, Icon, Activity, Event,
  Gateway, Textbox, Group, Lane, Pool, Divider, DatabaseTable, Legend`,
  соединения `Relationship, DatabaseRelationship`. Регистр важен: `group` не
  распознаётся, только `Group`.
- **Формат документа.** `{ "entities": [...], "connections": [...] }` или
  `{ "elements": [...] }`. Голый массив отвергается с `E_ENVELOPE`.
- **Координаты обязательны.** У `Icon`, `Group`, `Textbox` поля `x` и `y`
  в `required`. Автораскладки узлов нет, раскладываются только линии.
- **Координаты абсолютные, даже внутри контейнера.** `containerId` задаёт
  только логическую вложенность. Проверено: `Group` в `(400,300)` и ребёнок
  с `containerId` и `x:20, y:60` рендерится в `(20,60)`, то есть вне группы.
  В экспорте FigJam координаты, наоборот, относительны родителя, при миграции
  их надо складывать по цепочке родителей.
- **Текст.** У `Icon` подпись в `texts: [{ "text": "..." }]`, у `Textbox`
  в поле `text`, у `Group` в `title: { "text": "..." }`. `text` у `Textbox`
  обязателен.
- **Иконки.** Поле `icon` у `Icon` и `title.icon` у `Group` это имя из
  публичного каталога Eraser: `https://storage.googleapis.com/eraser-public-assets/canvas-icons/<name>.svg`.
  Каталог листается через GCS JSON API
  `https://storage.googleapis.com/storage/v1/b/eraser-public-assets/o?prefix=canvas-icons/&maxResults=1000&fields=items(name),nextPageToken`
  с пагинацией по `nextPageToken`, на момент проверки 3865 имён.
  Неизвестное имя по умолчанию даёт placeholder-глиф и warning, с
  `--unknown-icon error` падает с `E_UNKNOWN_ICON`. Кэш иконок включается
  через `--icon-cache-dir` или `icons.cacheDir` в конфиге.
  Из нужных нам имён есть: `nginx, traefik, go, hono, postgres, docker,
  kubernetes, helm, github, github-actions, telegram, grafana, prometheus,
  tempo, opentelemetry, posthog, react, npm, storybook, playwright, ansible,
  pulumi, cloudflare, yandex, server, database, cloud, globe, monitor, bell,
  user, users, chrome, firefox, package, box, rocket, clock`.
  Нет: `caddy, loki, unleash, coolify, allure, reportportal, vk, onesignal,
  uptime-kuma, selectel`. Для них брать ближайшую общую иконку
  (`server`, `database`, `monitor`, `bell`) и писать название в подписи.
- **Шрифты в HTML.** Без конфига шрифтов HTML-вывод ссылается на woff2 по
  `file:///.../node_modules/...`, на Pages такие ссылки мертвы. Нужен
  `fonts.json` с `"inline": true` у каждой face, тогда шрифты вшиваются
  base64 и HTML полностью автономен (проверено: 714 КБ, ни одной внешней
  ссылки). Формат:

  ```json
  {
    "roles": { "rough": "ShantellSans", "clean": "Inter", "mono": "JetBrainsMono" },
    "faces": [
      { "kind": "file", "family": "ShantellSans", "path": "./node_modules/@eraserlabs/diagrams/fonts/ShantellSans.var.woff2", "format": "woff2", "weight": "300 800", "inline": true },
      { "kind": "file", "family": "Inter",        "path": "./node_modules/@eraserlabs/diagrams/fonts/Inter.var.woff2",        "format": "woff2", "weight": "100 900", "inline": true },
      { "kind": "file", "family": "JetBrainsMono","path": "./node_modules/@eraserlabs/diagrams/fonts/JetBrainsMono-Regular.woff2", "format": "woff2", "inline": true }
    ]
  }
  ```

  Пути в `fonts.json` резолвятся относительно самого файла. Если шрифт не
  найден, CLI печатает `warning degraded fonts: ...` и с `--fail-on-warning`
  падает, это желаемое поведение в CI.
- **Конфиг.** `eraser-diagrams.config.json` ищется вверх от cwd до первой
  директории с `.git`. Ключи: `chromiumPath, format, outDir,
  deviceScaleFactor, pages, icons{baseUrl,cacheDir,timeoutMs,cacheTtlMs,onUnknown},
  fonts, library, overrides, failOnWarning`. Неизвестные ключи отвергаются.
  Относительные пути резолвятся относительно файла конфига.
- **`--pages <n>`** это размер пула вкладок Chromium для параллельного
  рендера, а не разбиение на страницы.
- **PNG.** `--scale 2` даёт retina-плотность. HTML масштаб игнорирует,
  он векторный.
- **Отчёт.** `--json` печатает машинный отчёт в stdout, статусы идут в stderr.

## 3. Структура репозитория

```
diagrams/
  README.md                          что это, ссылка на Pages, как править
  package.json                       devDeps: @eraserlabs/diagrams-cli; scripts см. §4
  package-lock.json
  .gitignore                         node_modules/, dist/, .eraser/
  eraser-diagrams.config.json        общий конфиг, без chromiumPath
  fonts.json                         inline-шрифты, см. §2
  icons.txt                          снимок каталога иконок, одно имя на строку
  diagrams/
    deployment.json                  топология: VPS, S3/CDN, клиент
    ci.json                          GitHub-репозитории, CI-пайплайны и их цели
    cd.json                          CD-пайплайны на VPS 5 / ARC и VPS 7 / Coolify
    integrations.json                внешние сервисы и кто с ними говорит
  scripts/
    fetch-icons.mjs                  обновляет icons.txt из GCS
    build-index.mjs                  собирает dist/index.html
  .claude/skills/eraser-diagrams/
    SKILL.md                         инструкция агенту, см. §6
  .github/workflows/
    ci.yml                           PR и push: validate + render, артефакт
    pages.yml                        push в main: render + deploy на Pages
  docs/
    reference/figjam-architecture-v3.xml   экспорт исходной доски FigJam
    superpowers/specs/...                  эта спека
    superpowers/plans/...                  план реализации
```

Одна диаграмма = один файл в `diagrams/`. Имя файла = имя страницы на Pages.

## 4. Конфигурация и скрипты

> Изменено: скрипты и lockfile на bun, команда `check`, см. `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`
> §3.1 и §4.5. Таблица ниже описывает исходное состояние.

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

`chromiumPath` в конфиг не пишем: у каждого разработчика он свой, а в CI
задаётся через `CHROMIUM_PATH`. Локально работает автопоиск, если Chrome
установлен; иначе разработчик ставит `CHROMIUM_PATH` сам.

`package.json` scripts:

| script | команда | назначение |
| --- | --- | --- |
| `validate` | `eraser-diagrams validate diagrams/*.json` | быстрая проверка без браузера |
| `render` | `eraser-diagrams render diagrams/*.json -f html && eraser-diagrams render diagrams/*.json -f png` | HTML и PNG в `dist/` |
| `index` | `node scripts/build-index.mjs` | `dist/index.html` |
| `build` | `npm run validate && npm run render && npm run index` | всё, что делает CI |
| `icons` | `node scripts/fetch-icons.mjs` | обновить `icons.txt` |

Glob `diagrams/*.json` в Windows-шелле не раскроется сам, поэтому в
скриптах перечислять файлы через `node -e` или использовать пакет `glob`.
Решение оставить реализующему агенту, критерий: `npm run build` работает и
на Windows, и на ubuntu-latest.

`scripts/fetch-icons.mjs`: обходит GCS JSON API с пагинацией, пишет
отсортированные имена без `canvas-icons/` и `.svg` в `icons.txt`. Без
зависимостей, только `fetch`.

`scripts/build-index.mjs`: читает `diagrams/*.json`, для каждого пишет в
`dist/index.html` заголовок (имя файла), ссылку на `<name>.html`, ссылку на
`<name>.png` и `<img src="<name>.png">` как превью. Один статичный HTML со
встроенным CSS, без зависимостей. Ничего больше.

## 5. Диаграммы

Четыре файла, содержимое мигрируется из `docs/reference/figjam-architecture-v3.xml`.
Скрытые (`hidden="true"`) элементы доски не переносятся.

### 5.1 `deployment.json`, топология

- `Group` «Selectel» и внутри одна `Group` на каждый VPS 1–8, без вложенной
  группы под рантайм: «Docker Compose» или «k8s» идёт в заголовок
  (`VPS 1 · Docker Compose`) и в `title.icon` (`docker` или `kubernetes`).
  Содержимое:
  - VPS 1: Caddy, BFF (Hono), Node Exporter
  - VPS 2: Caddy, Go, Postgres, Node Exporter
  - VPS 3: Caddy, Grafana, Prometheus, Alloy, Loki, Tempo, Alert Manager
  - VPS 4: Caddy, Uptime Kuma
  - VPS 5: k8s: ARC runners, moon, ReportPortal
  - VPS 6: posthog
  - VPS 7: Coolify
  - VPS 8: k8s: unleash
- Отдельно в Selectel: S3, CDN, домен site.ru.
- Снаружи: Client (браузер).
- Связи: Caddy VPS1 → BFF, BFF → Go VPS2 (S2S, private network), Go → Postgres,
  BFF → S3 (index.html релиза), Caddy VPS1 → CDN (proxy pass static),
  S3 → CDN (static), Prometheus → Node Exporter VPS1 и VPS2, Go → posthog,
  BFF → unleash, Client → Caddy VPS1 (`https://site.ru`, `/api`),
  Client → CDN (`https://static.site.ru`), Client → Caddy VPS3 (`grafana.site.ru`),
  Client → Caddy VPS4 (`kuma.site.ru`).

### 5.2 `ci.json`, GitHub-репозитории и CI

- `Group` «GitHub» с `Group` на каждый репозиторий: React, UI Kit, Frontend
  monorepo (client + BFF), Backend, E2E, Static, Deployments.
- Внутри каждого репозитория пайплайны как цепочки `Activity` со стрелками,
  содержание цепочек взято из комментариев в XML-экспорте:
  - React release: Install deps → Lint → Build → Deploy to NPM → Send to tg.
  - UI Kit release: Install deps → Lint → Build → Deploy to NPM → Send to tg.
  - UI Kit Storybook deploy: Install deps → Build → Deploy to Pages → Send to tg.
  - Frontend monorepo CI: detect affected → Install deps → Lint → Units →
    Build → Send bundle stats → Send to tg.
  - Backend CI: Build → Units → Lint → Build image → Send to tg. В экспорте
    второй шаг тоже назван «Build», трактуем его как сборку образа.
  - Static: Deploy to s3 → Send to tg.
  - E2E repo: в экспорте пайплайна нет, только пустая секция. Рисуем группу
    с одним узлом «Playwright tests» без цепочки; сам прогон E2E живёт в
    `cd.json`.
  - Deployments repo: не пайплайн, а шесть артефактов без стрелок:
    Pulumi configs, caddy.conf, docker-compose.yml, monitoring configuration,
    ansible roles / playbooks, ansible vault.
- Цели как отдельные узлы вне «GitHub»: NPM Registry (`@my/react`,
  `@my/ui-kit`), Docker Registry (bff image, backend image), GitHub Pages
  (Storybook), Relative CI, S3 (для Static), Telegram.
- Связи: Deploy to NPM → соответствующий пакет, Storybook deploy и UI Kit
  release потребляют `@my/react` из NPM, Deploy to Pages → Storybook,
  Send bundle stats → Relative CI, Build image → образ в Docker Registry,
  Static Deploy to s3 → S3.

### 5.3 `cd.json`, CD-пайплайны

- `Group` «VPS 5 / k8s / ARC» с пайплайнами как цепочками `Activity`:
  - Backend CD: Pull image from registry → Run migrations →
    Deploy (compose up) → Health check → Send to tg.
  - BFF CD: Run ansible playbook → [`Group` «Ansible playbook»: Pull image →
    Compose up] → Health check → Send to tg.
  - Frontend CD: Build → Send bundle stats → Deploy to s3 → Register as
    canary → Health check (canary) → наблюдение → Promote to stable →
    Health check → Send to tg.
  - Frontend Rollback: Switch release pointer → Health check → Send to tg.
  - E2E: Run e2e → Upload to Allure TestOps → Send to tg.
- В той же группе VPS 5 узлы moon и ReportPortal, связи `Run e2e → moon`
  («remote browsers») и `Run e2e → ReportPortal` («live results»).
- `Group` «VPS 7 / Coolify»: два сценария как цепочки `Activity`:
  - PR фронта открыт: Clone branch → Build image → Deploy preview →
    Assign subdomain + TLS.
  - PR фронта закрыт: Destroy preview → Release subdomain / cert.
- Цели как отдельные узлы: Docker Registry, S3, unleash, Allure TestOps,
  Relative CI, Telegram.
- Связи: Pull image → Docker Registry, Deploy to s3 → S3 («releases/<id>/»),
  Promote to stable → S3 и Switch release pointer → S3 («current.json»),
  Register as canary → unleash, Upload to Allure TestOps → Allure,
  Send bundle stats → Relative CI.

### 5.4 Правило для «Send to tg»

Шаг «Send to tg» встречается в каждом пайплайне. Стрелки от каждого такого
шага к узлу Telegram не рисуем, иначе схема превращается в паутину. Telegram
остаётся одним узлом-целью, к нему идёт одна стрелка от каждой группы
(«GitHub», «VPS 5 / k8s / ARC»), а не от каждого шага. Если и это мешает
читаемости, стрелок к Telegram нет вовсе, узел остаётся как легенда.

### 5.5 `integrations.json`, внешние сервисы

- Узлы: Client, Caddy VPS1, Go VPS2, Alert Manager, App Tracer, ЮMoney API,
  ЮMoney страница оплаты, Cloudflare Turnstile, VK Cloud (VK ID, Voice,
  App Tracer), One Signal, PostHog, Relative CI, Allure TestOps, Telegram,
  Storybook Pages.
- Связи с подписями-URL из экспорта: payment-callback, posthog.site.ru,
  backend alerts и frontend alerts в Telegram, One Signal sdk, faro-метрики.

### 5.6 Соглашения для всех диаграмм

- `id` в kebab-case, уникальны внутри файла, осмысленны: `vps2-postgres`,
  а не `n17`.
- Сетка 20 px. Стандартный `Icon` занимает примерно 100×100 с подписью,
  шаг между иконками по горизонтали 140, по вертикали 120. Внутренний
  отступ `Group` 40 сверху под заголовок, 20 по остальным сторонам.
- Координаты абсолютные (§2). Агент при вставке узла в группу считает
  позицию от левого верхнего угла группы сам.
- Подписи коротко, без URL внутри `texts`, URL только в `label` соединения.
- Хостнеймы `site.ru` и подобные плейсхолдеры допустимы. Реальные IP,
  токены, внутренние адреса не допускаются, репозиторий публичный.
- Никаких `x-`-полей и стилей сверх необходимого. Цвета только по конвенции
  `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` §4.

## 6. Скилл для Claude Code

> Изменено: команды на bun и раздел «Цвета», см. `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` §3.5 и §4.8.

`.claude/skills/eraser-diagrams/SKILL.md` подхватывается Claude Code в этом
репозитории автоматически. Содержание:

1. Когда применять: любая правка `diagrams/*.json`.
2. Факты из §2 в сжатом виде: обязательные `x/y`, абсолютные координаты,
   `texts` против `text` против `title.text`, регистр тегов.
3. Как найти иконку: `grep -i <слово> icons.txt`; нет в каталоге, брать
   общую и подписывать.
4. Как узнать поля тега: `npx eraser-diagrams schema <Tag>`.
5. Цикл правки: изменить JSON → `npm run validate` → `npm run render` →
   открыть `dist/<name>.png` через Read и глазами проверить, что ничего не
   наложилось и не вылезло за группу → поправить координаты → повторить.
6. Соглашения из §5.6 и правило про «Send to tg» из §5.4.
7. Правило: одна диаграмма на файл, не сливать схемы в одну.

## 7. CI/CD

> Изменено: `oven-sh/setup-bun@v2`, `bun install --frozen-lockfile`, `bun run build`,
> см. `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` §3.4.

### 7.1 `ci.yml`

Триггеры: `pull_request`, `push` в любую ветку кроме `main`.
Раннер `ubuntu-latest` (Google Chrome предустановлен в `/usr/bin/google-chrome`).

Шаги: checkout → `actions/setup-node@v4` с Node 22 и кэшем npm → `npm ci` →
`npm run build` с `CHROMIUM_PATH=/usr/bin/google-chrome` →
`actions/upload-artifact@v4` папки `dist/` под именем `diagrams`.

Падает при ошибке схемы, неизвестной иконке, деградировавшем шрифте
(`failOnWarning: true` в конфиге). Это и есть тест диаграмм.

### 7.2 `pages.yml`

Триггер: `push` в `main` и `workflow_dispatch`.
Permissions: `contents: read`, `pages: write`, `id-token: write`.
Concurrency group `pages`, `cancel-in-progress: true`.

Job `build`: те же шаги, что в ci, затем `actions/upload-pages-artifact@v3`
с `path: dist`.
Job `deploy`: `needs: build`, environment `github-pages`,
`actions/deploy-pages@v4`.

Одноразовый ручной шаг: в настройках репозитория Pages → Source →
GitHub Actions. Результат: `https://yarikmix.github.io/diagrams/`,
диаграммы по `.../deployment.html`, `.../ci.html`, `.../cd.html`,
`.../integrations.html`,
PNG рядом.

Кэш иконок `.eraser/icons` в CI кэшируется через `actions/cache` по хэшу
`diagrams/*.json`, чтобы не ходить в GCS каждый прогон. Если GCS недоступен,
сборка падает, это приемлемо.

## 8. Тестирование и критерии приёмки

- `npm run validate` проходит на четырёх диаграммах.
- `npm run build` локально на Windows и в CI на ubuntu даёт `dist/` с
  `index.html`, четырьмя `.html`, четырьмя `.png`.
- Каждый `.html` автономен: `grep -c 'file://' dist/*.html` даёт 0,
  `grep -oE 'https?://[^"]+' dist/*.html` не находит ничего кроме
  `www.w3.org`.
- Каждый PNG открыт и осмотрен агентом: узлы не накладываются, все узлы
  внутри своих групп, подписи читаемы.
- В PR намеренно сломанный JSON (неизвестная иконка) роняет `ci.yml`.
- После merge в `main` страница Pages открывается и показывает четыре схемы.
- `icons.txt` в репозитории, `npm run icons` его пересоздаёт без диффа.

## 9. Вне scope

- Визуальный редактор, drag-and-drop, совместное редактирование.
- MCP-сервер, облако Eraser, API-ключи Eraser.
- Кастомная библиотека компонентов (`library` / `overrides` в конфиге).
- Автоматическая раскладка узлов.
- Публикация в S3 или CDN проекта.
- Синхронизация обратно в FigJam.

## 10. Риски

- **Версия 0.1.0.** Формат и CLI могут поменяться. Версия зафиксирована
  в `package-lock.json`, обновлять осознанно.
- **Каталог иконок принадлежит Eraser.** Он публичный, но без гарантий.
  Кэш в CI смягчает, снимок в `icons.txt` даёт список для агента. Если
  каталог исчезнет, иконки придётся замирроить, это отдельная задача.
- **Ручные координаты.** Крупная перестановка узлов агентом дороже, чем в
  инструменте с автораскладкой. Принято осознанно ради вида диаграмм.
- **Публичный репозиторий.** Схема инфраструктуры видна всем. Соглашение
  §5.6 запрещает реальные адреса и секреты.

## Приложение A. Вывод `eraser-diagrams render --help` (0.1.0)

```
Usage: eraser-diagrams render <input...> [options]

Options:
  -o, --out <path>            Output file for a single input ("-" writes bytes to stdout)
      --out-dir <dir>         Output directory (default: current directory); files are named <input>.<format>
  -f, --format png|html       Output format (default: png)
      --scale <n>             Pixel density for PNG (deviceScaleFactor, default: 1)
      --pages <n>             Warm Chromium page pool size (default: 1)
      --chromium-path <path>  Chromium executable (default: $CHROMIUM_PATH, config, then auto-detect)
      --fonts <path>          Fonts config JSON file
      --icon-base-url <url>   Icon host base URL
      --icon-cache-dir <dir>  On-disk icon cache directory
      --unknown-icon placeholder|error
                              Unknown icon policy (default: placeholder)
      --json                  Machine-readable report on stdout
      --fail-on-warning       Exit 1 when any warning is reported
  -q, --quiet                 No per-input status lines
      --debug                 Stage timings and provenance on stderr
```

## Приложение B. Минимальный рабочий пример

Проверен рендером 2026-09-12.

```json
{
  "entities": [
    { "tag": "Group", "id": "vps2", "x": 0, "y": 0, "width": 420, "height": 200, "isContainer": true, "title": { "text": "VPS 2" } },
    { "tag": "Icon", "id": "vps2-caddy", "x": 20,  "y": 60, "containerId": "vps2", "icon": "nginx",    "texts": [{ "text": "Caddy" }] },
    { "tag": "Icon", "id": "vps2-go",    "x": 160, "y": 60, "containerId": "vps2", "icon": "go",       "texts": [{ "text": "Go API" }] },
    { "tag": "Icon", "id": "vps2-pg",    "x": 300, "y": 60, "containerId": "vps2", "icon": "postgres", "texts": [{ "text": "Postgres" }] }
  ],
  "connections": [
    { "tag": "Relationship", "from": "vps2-caddy", "to": "vps2-go", "label": "proxy" },
    { "tag": "Relationship", "from": "vps2-go",    "to": "vps2-pg" }
  ]
}
```
