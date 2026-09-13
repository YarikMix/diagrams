# Цветовая конвенция диаграмм и миграция на bun

Дата: 2026-09-13. Репозиторий: `YarikMix/diagrams`, ветка `main`.
Статус: на ревью. Дополняет и частично заменяет
`docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md`
(дальше «исходная спека»). После утверждения план пишется скиллом
`writing-plans`.

## 1. Цель

Две независимые доработки пайплайна схем.

- **Часть A. Миграция на bun.** Установка зависимостей, запуск наших
  скриптов и тесты переходят с npm/node на bun ради скорости и удобства.
  Рендерер остаётся на node, см. §2.1.
- **Часть B. Цветовая конвенция.** Группы красятся по зоне владения,
  стрелки по типу потока, иконки остаются монохромными, на каждой схеме
  есть легенда. Конвенция проверяется скриптом в сборке, чтобы агент не
  красил каждый раз по-разному.

Части делаются в порядке A, потом B: так новая команда `check` и скилл
сразу пишутся с bun-командами. По коду части независимы и могут
откладываться по отдельности.

## 2. Проверенные факты

Проверено 2026-09-13 на Windows 11, bun 1.3.13, Node 24.8,
`@eraserlabs/diagrams-cli@0.1.0`, Google Chrome.

### 2.1 bun

| Проверка | node | bun |
| --- | --- | --- |
| `validate` четырёх схем | ok | ok |
| `render` через Chrome | ok, около 1 с | зависает на запуске Chrome |
| тесты на `node:test` | 9/9 (`node --test`) | 9/9 (`bun test`) |
| `bun install` из текущего `package.json` | | 35 пакетов, `bun.lock`, CLI 0.1.0 |

- Рендер под `bun --bun .../cli.js render` остановлен по таймауту после 40
  и после 180 секунд. Вывод `--debug` обрывается после строки
  `debug chromium: ...`, до `boot (chromium + pages + fonts)`. Под node
  этот этап занимает 0,3 с. CLI запускает Chrome через `playwright-core`;
  под bun на Windows запуск не завершается. На ubuntu-latest не проверялось.
- После `bun install` шрифты лежат по прежнему пути
  `node_modules/@eraserlabs/diagrams/fonts/`, `fonts.json` менять не нужно.
- Проверка точки входа в наших скриптах
  (`resolve(process.argv[1]) === fileURLToPath(import.meta.url)`) под bun
  работает: `bun scripts/build-index.mjs` пишет `dist/index.html`.
- Под bun `process.execPath` указывает на `bun.exe`. Текущая обёртка
  `scripts/eraser.mjs` запускает CLI через `process.execPath`, поэтому
  `bun scripts/eraser.mjs render` запустит рендерер под bun и зависнет.

### 2.2 Цвета в движке

- Поле `color` есть у `Group`, `Icon`, `Activity`, `Relationship`, `Legend`.
  Значение берётся из палитры (`x-palette`). Стоковая палитра 0.1.0,
  файл `node_modules/@eraserlabs/diagrams/dist/library/schema/palette.js`:

  | имя | hex |
  | --- | --- |
  | blue | `#2866c4` |
  | purple | `#c43dcf` |
  | green | `#30a050` |
  | orange | `#c38424` |
  | red | `#bd413a` |
  | black | `#3a3a3a` |
  | yellow | `#d3d61e` |
  | white | `#242424` |

- `Group.color` красит рамку и плашку заголовка, заливка группы бледного
  оттенка того же цвета. `Group.styleMode`: `plain`, `shadow` (по
  умолчанию), `watercolor`.
- `Relationship.lineStyle`: `solid`, `dashed`, `dotted`. Стрелка без
  `color` рисуется цветом `#1c1c1c`.
- `Legend.entries`: массив `{ "text", "color" }`, где `color` это CSS-цвет
  (hex), а не имя палитры. Легенда рисует цветной квадрат и текст, линий
  в ней нет. Высота считается автоматически, ширина задаётся.
- Тёмной темы в пакете нет.
- Проверено рендером: вложенная группа с тем же `color` и
  `styleMode: "plain"` читается как часть родителя; легенда с hex-цветами
  рендерится без предупреждений под `--fail-on-warning`.
- Подписи стрелок с `https://` CLI превращает в ссылки, в PNG они синего
  цвета ссылки.

## 3. Часть A. Миграция на bun

### 3.1 Зависимости

- `bun install` создаёт `bun.lock`, он коммитится. `package-lock.json`
  удаляется.
- `package.json`:
  - `engines`: `{ "node": ">=22.12", "bun": ">=1.3" }`.
  - `devDependencies` без изменений: `"@eraserlabs/diagrams-cli": "0.1.0"`.
  - `scripts` после части A:

    | script | команда |
    | --- | --- |
    | `test` | `bun test` |
    | `validate` | `bun scripts/eraser.mjs validate` |
    | `render` | `bun scripts/eraser.mjs render -f html && bun scripts/eraser.mjs render -f png` |
    | `index` | `bun scripts/build-index.mjs` |
    | `build` | `bun run validate && bun run render && bun run index` |
    | `icons` | `bun scripts/fetch-icons.mjs` |

### 3.2 Обёртка `scripts/eraser.mjs`

- CLI запускается через `node` из PATH, а не через `process.execPath`.
- Новая экспортируемая функция
  `rendererCommand(command: string, files: string[], extra: string[]): { cmd: string, args: string[] }`
  возвращает `{ cmd: "node", args: [cliEntry(), ...buildArgs(command, files, extra)] }`.
  `main` вызывает `spawnSync(cmd, args, { stdio: "inherit" })`.
- Если `result.error?.code === "ENOENT"`, в stderr печатается
  `node not found on PATH: the eraser-diagrams renderer needs Node >= 22.12`
  и выход с кодом 2. Любая другая ошибка запуска печатает
  `result.error.message` и выходит с кодом 1, как сейчас.
- Дополнено по финальному ревью: перед запуском CLI обёртка вызывает
  `node -e` и проверяет `process.versions.bun`. `bun run` без Node кладёт
  в PATH свой shim `node`, и без этой проверки рендер запустился бы под
  bun и завис. Shim и отсутствие node дают выход 2 с сообщением, прочие
  сбои пробы выход 1.
- Тест в `scripts/eraser.test.mjs`:
  `rendererCommand("render", ["diagrams/a.json"], ["-f", "html"])` даёт
  `cmd === "node"`, `args[0]` равен `cliEntry()`, остаток равен
  `["render", "diagrams/a.json", "-f", "html"]`.
- Остальные экспорты (`listDiagrams`, `cliEntry`, `buildArgs`) не меняются.

### 3.3 Тесты

Тестовые файлы остаются на `node:test` и `node:assert/strict`, запуск
`bun test`. Переписывать на `bun:test` не нужно.

### 3.4 CI

Оба workflow, `ci.yml` и job `build` в `pages.yml`, получают одинаковые шаги:

1. `actions/checkout@v4`
2. `oven-sh/setup-bun@v2` с `bun-version: 1.3.13`
3. `actions/setup-node@v4` с `node-version: 22`, без `cache: npm`
4. `actions/cache@v4` для `.eraser/icons`, без изменений
5. `bun install --frozen-lockfile`
6. `bun run test`
7. `bun run build` с `CHROMIUM_PATH=/usr/bin/google-chrome`, без изменений

Дополнено по финальному ревью: у job `build` в обоих workflow
`timeout-minutes: 15`, чтобы зависание рендера не держало раннер до
шестичасового лимита.

Дальше без изменений: `upload-artifact` в `ci.yml`, `upload-pages-artifact`
и job `deploy` в `pages.yml`, права токена, concurrency.

### 3.5 Документы

- `README.md`: требования bun ≥ 1.3, Node ≥ 22.12 для рендера и Chrome;
  все команды через `bun install` и `bun run ...`.
- `.claude/skills/eraser-diagrams/SKILL.md`: команды через `bun run ...`,
  поля тега через `bunx eraser-diagrams schema <Tag>`; в цикле правки
  упомянуть, что рендер идёт под node.
- Исходная спека: в §2, §4, §6 и §7 ссылка на этот документ.

### 3.6 Приёмка части A

- В репозитории нет `package-lock.json`, есть `bun.lock`.
- `grep -rnwE 'npm|npx' package.json README.md .github .claude/skills`
  ничего не находит.
- `bun install --frozen-lockfile && bun run test && bun run build` на
  Windows: тесты зелёные, `dist/` содержит `index.html`, 4 HTML, 4 PNG.
- PR на GitHub: `ci.yml` зелёный.

## 4. Часть B. Цветовая конвенция

### 4.1 Зоны

Цвет получает только группа.

| Зона | `color` | Текст в легенде | hex в легенде |
| --- | --- | --- | --- |
| Наша инфраструктура | `blue` | `Наша инфраструктура` | `#2866c4` |
| GitHub | `purple` | `GitHub` | `#c43dcf` |
| Внешние сервисы | `green` | `Внешние сервисы` | `#30a050` |

Верхние группы текущих схем:

| Схема | Группа | Зона |
| --- | --- | --- |
| deployment | `selectel` | blue |
| ci | `github` | purple |
| ci | `npm-registry`, `docker-registry` | green |
| cd | `vps5`, `vps7` | blue |
| integrations | `ours` | blue |
| integrations | `yoomoney`, `vk-cloud` | green |

Правила:

- Верхняя группа (без `containerId`) имеет `color` из таблицы зон и не
  имеет `styleMode`.
- Вложенная группа имеет `color` родителя и `"styleMode": "plain"`.
- У `Icon`, `Activity`, `Textbox` и других элементов, кроме `Group` и
  `Legend`, поля `color` нет. Узел вне групп всегда нейтральный.
- Новая верхняя группа относится к зоне по смыслу: наши серверы и сервисы
  в Selectel синие, всё внутри GitHub фиолетовое, чужие SaaS и реестры
  зелёные. Если группа не подходит ни в одну зону, это изменение этой
  спеки, а не решение агента.

### 4.2 Потоки

Тип стрелки определяется только по её концам. Правила проверяются
сверху вниз, срабатывает первое.

| # | Условие | Тип | `color` | `lineStyle` | Текст в легенде | hex в легенде |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `to === "telegram"` | Алерты и уведомления | `red` | `dotted` | `Алерты и уведомления, точки` | `#bd413a` |
| 2 | `from === "client"` | Пользовательский трафик | `orange` | `solid` | `Пользовательский трафик` | `#c38424` |
| 3 | ровно один конец имеет `tag: "Activity"` | Пайплайн и внешние системы | `black` | `dashed` | `Пайплайн и внешние системы, пунктир` | `#3a3a3a` |
| 4 | всё остальное | Прочие связи | нет | нет | `Прочие связи` | `#1c1c1c` |

- Для типа 4 поля `color` и `lineStyle` отсутствуют.
- Конвенция имён: узел пользователя имеет `id: "client"`, узел Telegram
  имеет `id: "telegram"`. Это уже так на всех схемах.
- Тип 3 назван «Пайплайн и внешние системы», а не «Артефакты и деплой»:
  под правило попадают также `e2e-run → moon`, `e2e-run → reportportal`
  и `fe-canary → unleash`.
- Раскладка текущих 101 стрелки по правилам:

  | Схема | Алерты | Трафик | Пайплайн | Прочие |
  | --- | --- | --- | --- | --- |
  | deployment | 0 | 4 | 0 | 17 |
  | ci | 1 | 0 | 8 | 22 |
  | cd | 1 | 0 | 10 | 24 |
  | integrations | 2 | 8 | 0 | 4 |

### 4.3 Легенда

- На каждой схеме ровно один элемент `{ "tag": "Legend", "id": "legend", ... }`
  с явными `x`, `y`, `width`, без `color`, `containerId` и `styleMode`.
- `entries` содержат только зоны, которые есть среди верхних групп схемы,
  и только типы потоков, которые есть среди её стрелок. Порядок: зоны в
  порядке таблицы §4.1, потом потоки в порядке: пользовательский трафик,
  пайплайн и внешние системы, алерты и уведомления, прочие связи. Текст и
  hex точно из таблиц.
- Ожидаемые легенды текущих схем:
  - deployment: Наша инфраструктура; Пользовательский трафик; Прочие связи.
  - ci: GitHub; Внешние сервисы; Пайплайн и внешние системы, пунктир;
    Алерты и уведомления, точки; Прочие связи.
  - cd: Наша инфраструктура; Пайплайн и внешние системы, пунктир;
    Алерты и уведомления, точки; Прочие связи.
  - integrations: Наша инфраструктура; Внешние сервисы; Пользовательский
    трафик; Алерты и уведомления, точки; Прочие связи.
- Легенда ставится на свободное место, предпочтительно справа вверху,
  по сетке 20 px. Она не перекрывает ни один элемент и ни одну стрелку.
  Если места нет, холст расширяется вправо или вниз, остальные координаты
  не меняются.

### 4.4 Модуль `scripts/colors.mjs`

Единственный источник правил в коде, без зависимостей.

- `ZONES`: массив `{ key, color, legendText, hex }` в порядке §4.1.
- `FLOWS`: массив `{ key, color, lineStyle, legendText, hex }` в порядке
  легенды §4.3: `user`, `pipeline`, `alerts`, `other`; у `other` поля
  `color` и `lineStyle` равны `undefined`.
- `PALETTE_HEX`: `{ blue, purple, green, orange, red, black }` со
  значениями из §2.2.
- `flowOf(connection, entitiesById): string` возвращает `key` потока по
  правилам §4.2.
- `expectedLegend(doc): { text, color }[]` строит ожидаемые пункты
  легенды для документа по §4.3.

### 4.5 Скрипт `scripts/check-colors.mjs`

- `checkDiagram(doc): string[]` возвращает нарушения вида
  `<id>: <что не так>`, пустой массив для корректной схемы. Проверяет:
  1. верхняя группа: `color` из `ZONES`, `styleMode` отсутствует;
  2. вложенная группа: `color` равен цвету родителя, `styleMode === "plain"`;
  3. остальные элементы, кроме `Group` и `Legend`: `color` отсутствует;
  4. каждая стрелка: `color` и `lineStyle` равны значениям потока
     `flowOf`, для `other` оба отсутствуют;
  5. `Legend` ровно один, `id === "legend"`, у него нет `color`,
     `containerId` и `styleMode`, `entries` глубоко равны
     `expectedLegend(doc)`.
- Дополнено по финальному ревью: элемент с `icon: "telegram"` обязан иметь
  `id: "telegram"`; сравнение цвета вложенной группы пропускается, если
  цвет родителя не цвет зоны, а сравнение `entries` легенды пропускается
  при ошибках групп, чтобы одна ошибка не порождала ложные советы; при
  отсутствии легенды сообщение содержит ожидаемые `entries`.
- CLI: `bun scripts/check-colors.mjs` проверяет все `diagrams/*.json`,
  печатает в stderr строки `diagrams/<file>.json <нарушение>`, выход 1
  при любом нарушении; иначе выход 0 и строка `colors ok: <N> diagrams`.
- `package.json`: `"check": "bun scripts/check-colors.mjs"`,
  `"build": "bun run validate && bun run check && bun run render && bun run index"`.

### 4.6 Тесты части B

- `scripts/colors.test.mjs`: `flowOf` на каждом из четырёх правил и на
  приоритете правила 1 над правилом 2; `expectedLegend` на документе с
  одной зоной и двумя потоками; `PALETTE_HEX` совпадает со
  `STOCK_PALETTE` из установленного пакета
  `node_modules/@eraserlabs/diagrams/dist/library/schema/palette.js`.
- `scripts/check-colors.test.mjs`: корректная фикстура даёт `[]`; по
  одной фикстуре на каждое нарушение из §4.5 даёт ровно одну строку с
  нужным `id`.

### 4.7 Перекраска схем

Все четыре схемы приводятся к §4.1–4.3. После каждой: `bun run validate`,
`bun run check`, `bun run render`, осмотр PNG через Read.

### 4.8 Документы

- Исходная спека §5.6: пункт «Никаких `x-`-полей, цветов и стилей сверх
  необходимого» заменяется на «Никаких `x-`-полей и стилей сверх
  необходимого. Цвета только по конвенции
  `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` §4».
- `SKILL.md`: раздел «Цвета» с таблицами §4.1 и §4.2, правилами легенды
  и указанием, что источник истины в коде `scripts/colors.mjs`; цикл
  правки: JSON, `bun run validate`, `bun run check`, `bun run render`,
  осмотр PNG. Пункт про запрет цветов в соглашениях заменяется ссылкой на
  раздел «Цвета».
- `README.md`: в списке команд `bun run check`.

### 4.9 Приёмка части B

- `bun run test` зелёный, включая новые тесты.
- `bun run check` печатает `colors ok: 4 diagrams`.
- Намеренно испорченная схема (например, вложенная группа другого цвета)
  роняет `bun run check` и `bun run build` с кодом 1.
- Каждый PNG осмотрен: цвета зон различимы, пунктир и точки видны,
  легенда ничего не перекрывает, подписи читаемы.
- В `dist/*.html` по-прежнему нет `file://` и внешних `src`, `<link>`,
  `@import`, `url()`.

## 5. Вне scope

- Полный переход рендерера на bun, см. §6.
- Цвет иконок, тёмная тема, собственная палитра через `library`/`overrides`.
- Перекомпоновка схем сверх места под легенду.
- Автоматическая раскладка легенды.

## 6. Риски

- **Рендерер под bun.** Зависание запуска Chrome под bun на Windows
  (§2.1). Node остаётся требованием. Условие возврата к полному переходу:
  `bun --bun node_modules/@eraserlabs/diagrams-cli/dist/cli.js render`
  завершается на Windows и на ubuntu-latest; тогда `rendererCommand`
  переключается на `process.execPath`, а Node убирается из `engines`,
  README и CI.
- **Совместимость `node:test` под bun.** Сейчас 9/9. Если будущий тест
  упрётся в неподдержанное API, он пишется на подмножестве, работающем в
  `bun test`, а не возвращает запуск на node.
- **Синие ссылки.** Подписи с `https://` рендерятся синим цветом ссылки и
  визуально совпадают с зоной «Наша инфраструктура». Принято: ссылка
  читается как подпись на линии, а не как рамка группы.
- **Структурные правила потоков.** Тип стрелки выводится из концов, а не
  из смысла. Стрелка, которая по смыслу не подходит под свой тип, это
  повод поменять правило в этой спеке, а не красить вручную.
- **Смена палитры при обновлении CLI.** Ловится тестом `PALETTE_HEX`.
