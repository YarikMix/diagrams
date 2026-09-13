# Diagram Color Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Группы на схемах красятся по зоне владения, стрелки по типу потока, на каждой схеме есть легенда, а скрипт в сборке ловит любое отклонение от конвенции.

**Architecture:** Правила живут в одном модуле `scripts/colors.mjs` (зоны, типы стрелок, ожидаемая легенда). `scripts/check-colors.mjs` проверяет все `diagrams/*.json` по этим правилам и встаёт в `bun run build` после `validate`. Четыре схемы перекрашиваются одноразовым скриптом, который правит строки точечно и сам сверяет результат с проверкой. Скилл и README описывают конвенцию для агента.

**Tech Stack:** bun 1.3.13 (скрипты и `bun test` на `node:test`), `@eraserlabs/diagrams-cli@0.1.0`, рендерер под Node ≥ 22.12.

**Spec:** `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`, часть B (§2.2, §4, §6). Контекст: `docs/superpowers/specs/2026-09-12-eraser-diagrams-pipeline-design.md`.

**Prerequisite:** план `docs/superpowers/plans/2026-09-13-bun-migration.md` выполнен и слит: в `package.json` скрипты на bun, `bun run test` даёт `10 pass`.

## Global Constraints

- Зоны, `color` верхней группы: наша инфраструктура `blue`, GitHub `purple`, внешние сервисы `green`. Вложенная группа: `color` родителя и `"styleMode": "plain"`. У верхней группы `styleMode` нет.
- У `Icon`, `Activity`, `Textbox` и других элементов, кроме `Group` и `Legend`, поля `color` нет.
- Тип стрелки по концам, сверху вниз: `to === "telegram"` → `red` + `dotted`; `from === "client"` → `orange` + `solid`; ровно один конец `tag: "Activity"` → `black` + `dashed`; иначе `color` и `lineStyle` отсутствуют.
- Легенда: ровно один `{ "tag": "Legend", "id": "legend", "x", "y", "width" }` без `color`, `containerId`, `styleMode`; `entries` это `{ "text", "color" }` с hex-цветом.
- Тексты и hex легенды точно: `Наша инфраструктура` `#2866c4`; `GitHub` `#c43dcf`; `Внешние сервисы` `#30a050`; `Пользовательский трафик` `#c38424`; `Пайплайн и внешние системы, пунктир` `#3a3a3a`; `Алерты и уведомления, точки` `#bd413a`; `Прочие связи` `#1c1c1c`. Порядок: зоны в порядке выше, потом потоки в порядке выше.
- Никаких runtime-зависимостей. Скрипты ESM `*.mjs` только на `node:*`, тесты на `node:test` + `node:assert/strict`, запуск `bun test`.
- Одноразовый скрипт перекраски не коммитится и лежит вне репозитория.
- В `dist/*.html` по-прежнему нет `file://` и внешних `src`, `<link>`, `@import`, `url()`.
- Коммит-сообщения пишутся в файл через Bash heredoc и коммитятся `git commit -F <файл>`; PowerShell here-strings не использовать. Каждое сообщение заканчивается строкой `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ничего не пушить и не менять настройки репозитория без явного запроса пользователя (Task 5 оговаривает это отдельно).

---

## File Structure

| Файл | Ответственность |
| --- | --- |
| `scripts/colors.mjs` | таблицы зон и потоков, `flowOf`, `expectedLegend`, `indexById` |
| `scripts/colors.test.mjs` | тесты правил и сверка палитры с движком |
| `scripts/check-colors.mjs` | `checkDiagram(doc)` и CLI проверки всех схем |
| `scripts/check-colors.test.mjs` | корректная фикстура и по фикстуре на нарушение |
| `package.json` | скрипт `check`, `check` в `build` |
| `diagrams/{deployment,ci,cd,integrations}.json` | цвета групп и стрелок, легенда |
| `.claude/skills/eraser-diagrams/SKILL.md` | раздел «Цвета», шаг `check` в цикле правки |
| `README.md` | команда `bun run check` |

---

### Task 1: Модуль правил `scripts/colors.mjs`

**Files:**
- Create: `scripts/colors.mjs`
- Test: `scripts/colors.test.mjs`

**Interfaces:**
- Produces:
  - `PALETTE_HEX: { blue, purple, green, orange, red, black }` (строки hex)
  - `DEFAULT_EDGE_HEX: "#1c1c1c"`
  - `ZONES: { key: string, color: string, legendText: string, hex: string }[]`, ключи `ours`, `github`, `external`
  - `FLOWS: { key: string, color?: string, lineStyle?: string, legendText: string, hex: string }[]`, ключи по порядку `user`, `pipeline`, `alerts`, `other`
  - `indexById(doc): Record<string, entity>`
  - `flowOf(connection: { from: string, to: string }, entitiesById: Record<string, { tag: string }>): "user" | "pipeline" | "alerts" | "other"`
  - `expectedLegend(doc: { entities, connections }): { text: string, color: string }[]`

- [ ] **Step 1: падающие тесты**

Создать `scripts/colors.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { FLOWS, PALETTE_HEX, ZONES, expectedLegend, flowOf } from "./colors.mjs";

const byId = {
  client: { tag: "Icon", id: "client" },
  telegram: { tag: "Icon", id: "telegram" },
  api: { tag: "Icon", id: "api" },
  db: { tag: "Icon", id: "db" },
  build: { tag: "Activity", id: "build" },
  deploy: { tag: "Activity", id: "deploy" },
  pipeline: { tag: "Group", id: "pipeline" },
};

test("flowOf: an arrow into telegram is alerts", () => {
  assert.equal(flowOf({ from: "pipeline", to: "telegram" }, byId), "alerts");
});

test("flowOf: the telegram rule wins over the client rule", () => {
  assert.equal(flowOf({ from: "client", to: "telegram" }, byId), "alerts");
});

test("flowOf: an arrow from client is user traffic", () => {
  assert.equal(flowOf({ from: "client", to: "api" }, byId), "user");
});

test("flowOf: exactly one Activity end is pipeline, in both directions", () => {
  assert.equal(flowOf({ from: "deploy", to: "db" }, byId), "pipeline");
  assert.equal(flowOf({ from: "db", to: "build" }, byId), "pipeline");
});

test("flowOf: Activity to Activity and Icon to Icon are other", () => {
  assert.equal(flowOf({ from: "build", to: "deploy" }, byId), "other");
  assert.equal(flowOf({ from: "api", to: "db" }, byId), "other");
});

test("expectedLegend: top-level zones in table order, then present flows in legend order", () => {
  const doc = {
    entities: [
      { tag: "Group", id: "vendor", color: "green" },
      { tag: "Group", id: "ours", color: "blue" },
      { tag: "Group", id: "vps", color: "purple", containerId: "ours" },
      { tag: "Icon", id: "client" },
      { tag: "Icon", id: "api", containerId: "vps" },
      { tag: "Icon", id: "db", containerId: "vps" },
    ],
    connections: [
      { from: "api", to: "db" },
      { from: "client", to: "api" },
    ],
  };
  assert.deepEqual(expectedLegend(doc), [
    { text: "Наша инфраструктура", color: "#2866c4" },
    { text: "Внешние сервисы", color: "#30a050" },
    { text: "Пользовательский трафик", color: "#c38424" },
    { text: "Прочие связи", color: "#1c1c1c" },
  ]);
});

test("every zone and colored flow uses a palette color with its palette hex", () => {
  for (const item of [...ZONES, ...FLOWS.filter((f) => f.color)]) {
    assert.equal(item.hex, PALETTE_HEX[item.color], item.key);
  }
});

test("PALETTE_HEX matches the palette of the installed eraser-diagrams engine", async () => {
  const paletteUrl = new URL(
    "../node_modules/@eraserlabs/diagrams/dist/library/schema/palette.js",
    import.meta.url,
  );
  const { STOCK_PALETTE } = await import(paletteUrl.href);
  for (const [name, hex] of Object.entries(PALETTE_HEX)) {
    assert.equal(STOCK_PALETTE[name], hex, name);
  }
});
```

- [ ] **Step 2: убедиться, что тесты падают**

Run: `bun test scripts/colors.test.mjs`
Expected: FAIL, ошибка `Cannot find module` с упоминанием `./colors.mjs`.

- [ ] **Step 3: реализация**

Создать `scripts/colors.mjs`:

```js
// Цветовая конвенция диаграмм: цвета зон для групп, типы стрелок, ожидаемая легенда.
// Спека: docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md §4.

export const PALETTE_HEX = {
  blue: "#2866c4",
  purple: "#c43dcf",
  green: "#30a050",
  orange: "#c38424",
  red: "#bd413a",
  black: "#3a3a3a",
};

// Цвет стрелки без поля color в CLI 0.1.0.
export const DEFAULT_EDGE_HEX = "#1c1c1c";

export const ZONES = [
  { key: "ours", color: "blue", legendText: "Наша инфраструктура", hex: PALETTE_HEX.blue },
  { key: "github", color: "purple", legendText: "GitHub", hex: PALETTE_HEX.purple },
  { key: "external", color: "green", legendText: "Внешние сервисы", hex: PALETTE_HEX.green },
];

// Порядок массива задаёт порядок пунктов в легенде.
export const FLOWS = [
  { key: "user", color: "orange", lineStyle: "solid", legendText: "Пользовательский трафик", hex: PALETTE_HEX.orange },
  { key: "pipeline", color: "black", lineStyle: "dashed", legendText: "Пайплайн и внешние системы, пунктир", hex: PALETTE_HEX.black },
  { key: "alerts", color: "red", lineStyle: "dotted", legendText: "Алерты и уведомления, точки", hex: PALETTE_HEX.red },
  { key: "other", color: undefined, lineStyle: undefined, legendText: "Прочие связи", hex: DEFAULT_EDGE_HEX },
];

export function indexById(doc) {
  return Object.fromEntries(doc.entities.map((entity) => [entity.id, entity]));
}

// Тип стрелки по её концам, правила §4.2 проверяются сверху вниз.
export function flowOf(connection, entitiesById) {
  if (connection.to === "telegram") return "alerts";
  if (connection.from === "client") return "user";
  const fromActivity = entitiesById[connection.from]?.tag === "Activity";
  const toActivity = entitiesById[connection.to]?.tag === "Activity";
  if (fromActivity !== toActivity) return "pipeline";
  return "other";
}

export function expectedLegend(doc) {
  const topGroupColors = new Set(
    doc.entities.filter((e) => e.tag === "Group" && !e.containerId).map((g) => g.color),
  );
  const byId = indexById(doc);
  const presentFlows = new Set(doc.connections.map((c) => flowOf(c, byId)));
  return [
    ...ZONES.filter((z) => topGroupColors.has(z.color)).map((z) => ({ text: z.legendText, color: z.hex })),
    ...FLOWS.filter((f) => presentFlows.has(f.key)).map((f) => ({ text: f.legendText, color: f.hex })),
  ];
}
```

- [ ] **Step 4: тесты проходят**

Run: `bun test scripts/colors.test.mjs`
Expected: `8 pass`, `0 fail`.

Run: `bun run test`
Expected: `18 pass`, `0 fail`.

- [ ] **Step 5: коммит**

```bash
git add scripts/colors.mjs scripts/colors.test.mjs
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Add color convention rules module for diagrams

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 2: Проверка `scripts/check-colors.mjs`

**Files:**
- Create: `scripts/check-colors.mjs`
- Test: `scripts/check-colors.test.mjs`
- Modify: `package.json` (скрипт `check`)

**Interfaces:**
- Consumes: `FLOWS`, `ZONES`, `expectedLegend`, `flowOf`, `indexById` из `scripts/colors.mjs` (Task 1).
- Produces: `checkDiagram(doc): string[]`, строки вида `<id>: <сообщение>`, для стрелок `<from>-><to>: <сообщение>`; скрипт `bun run check`, выход 0 и строка `colors ok: <N> diagrams` или выход 1 и строки `diagrams/<file>.json <нарушение>` в stderr.

- [ ] **Step 1: падающие тесты**

Создать `scripts/check-colors.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { checkDiagram } from "./check-colors.mjs";

function validDoc() {
  return {
    entities: [
      { tag: "Group", id: "ours", x: 0, y: 0, width: 400, height: 300, isContainer: true, color: "blue", title: { text: "Ours" } },
      { tag: "Group", id: "vps", x: 20, y: 40, width: 360, height: 240, containerId: "ours", isContainer: true, color: "blue", styleMode: "plain", title: { text: "VPS" } },
      { tag: "Icon", id: "api", x: 40, y: 80, containerId: "vps", icon: "server", texts: [{ text: "API" }] },
      { tag: "Icon", id: "db", x: 180, y: 80, containerId: "vps", icon: "database", texts: [{ text: "DB" }] },
      { tag: "Icon", id: "client", x: 500, y: 80, icon: "chrome", texts: [{ text: "Client" }] },
      {
        tag: "Legend", id: "legend", x: 700, y: 0, width: 340,
        entries: [
          { text: "Наша инфраструктура", color: "#2866c4" },
          { text: "Пользовательский трафик", color: "#c38424" },
          { text: "Прочие связи", color: "#1c1c1c" },
        ],
      },
    ],
    connections: [
      { tag: "Relationship", from: "client", to: "api", color: "orange", lineStyle: "solid" },
      { tag: "Relationship", from: "api", to: "db" },
    ],
  };
}

const entity = (doc, id) => doc.entities.find((e) => e.id === id);
const linesFor = (doc, id) => checkDiagram(doc).filter((line) => line.startsWith(`${id}:`));

test("a diagram that follows the convention has no problems", () => {
  assert.deepEqual(checkDiagram(validDoc()), []);
});

const violations = [
  ["top-level group without a zone color", "ours", (d) => { delete entity(d, "ours").color; }],
  ["top-level group with styleMode", "ours", (d) => { entity(d, "ours").styleMode = "plain"; }],
  ["nested group with a different color", "vps", (d) => { entity(d, "vps").color = "green"; }],
  ["nested group without styleMode plain", "vps", (d) => { delete entity(d, "vps").styleMode; }],
  ["icon with a color", "api", (d) => { entity(d, "api").color = "red"; }],
  ["user traffic arrow without color", "client->api", (d) => { delete d.connections[0].color; }],
  ["other arrow with a lineStyle", "api->db", (d) => { d.connections[1].lineStyle = "dashed"; }],
  ["no legend", "legend", (d) => { d.entities = d.entities.filter((e) => e.tag !== "Legend"); }],
  ["two legends", "legend", (d) => { d.entities.push({ ...entity(d, "legend"), id: "legend-2" }); }],
  ["legend with a wrong id", "key", (d) => { entity(d, "legend").id = "key"; }],
  ["legend with a color", "legend", (d) => { entity(d, "legend").color = "blue"; }],
  ["legend entries in a wrong order", "legend", (d) => { entity(d, "legend").entries.reverse(); }],
];

for (const [name, id, mutate] of violations) {
  test(`reports ${name} exactly once under id ${id}`, () => {
    const doc = validDoc();
    mutate(doc);
    assert.equal(linesFor(doc, id).length, 1, checkDiagram(doc).join("\n"));
  });
}
```

Нарушение может потянуть за собой строку про легенду под id `legend` (например, у верхней группы пропал цвет, и ожидаемая легенда изменилась). Поэтому тест считает строки только под id изменённого элемента.

- [ ] **Step 2: убедиться, что тесты падают**

Run: `bun test scripts/check-colors.test.mjs`
Expected: FAIL, ошибка `Cannot find module` с упоминанием `./check-colors.mjs`.

- [ ] **Step 3: реализация**

Создать `scripts/check-colors.mjs`:

```js
// Проверяет цветовую конвенцию во всех diagrams/*.json.
// Спека: docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md §4.5.
// Использование: bun scripts/check-colors.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { FLOWS, ZONES, expectedLegend, flowOf, indexById } from "./colors.mjs";

const ZONE_COLORS = ZONES.map((z) => z.color);
const FLOW_BY_KEY = Object.fromEntries(FLOWS.map((f) => [f.key, f]));
const show = (value) => (value === undefined ? "none" : String(value));

function checkGroup(group, byId, problems) {
  if (!group.containerId) {
    if (!ZONE_COLORS.includes(group.color)) {
      problems.push(`${group.id}: top-level group color must be one of ${ZONE_COLORS.join(", ")}, got ${show(group.color)}`);
    }
    if (group.styleMode !== undefined) {
      problems.push(`${group.id}: top-level group must not set styleMode, got ${group.styleMode}`);
    }
    return;
  }
  const parentColor = byId[group.containerId]?.color;
  if (group.color !== parentColor) {
    problems.push(`${group.id}: nested group color must equal ${group.containerId} color ${show(parentColor)}, got ${show(group.color)}`);
  }
  if (group.styleMode !== "plain") {
    problems.push(`${group.id}: nested group styleMode must be plain, got ${show(group.styleMode)}`);
  }
}

function checkLegend(doc, problems) {
  const legends = doc.entities.filter((e) => e.tag === "Legend");
  if (legends.length !== 1) {
    problems.push(`legend: expected exactly one Legend, found ${legends.length}`);
    return;
  }
  const [legend] = legends;
  if (legend.id !== "legend") {
    problems.push(`${legend.id}: Legend id must be "legend"`);
  }
  for (const field of ["color", "containerId", "styleMode"]) {
    if (legend[field] !== undefined) {
      problems.push(`${legend.id}: Legend must not set ${field}`);
    }
  }
  const expected = expectedLegend(doc);
  if (!isDeepStrictEqual(legend.entries, expected)) {
    problems.push(`${legend.id}: entries must be ${JSON.stringify(expected)}`);
  }
}

export function checkDiagram(doc) {
  const problems = [];
  const byId = indexById(doc);
  for (const entity of doc.entities) {
    if (entity.tag === "Group") {
      checkGroup(entity, byId, problems);
    } else if (entity.tag !== "Legend" && entity.color !== undefined) {
      problems.push(`${entity.id}: ${entity.tag} must not set color`);
    }
  }
  for (const connection of doc.connections) {
    const flow = FLOW_BY_KEY[flowOf(connection, byId)];
    if (connection.color !== flow.color || connection.lineStyle !== flow.lineStyle) {
      problems.push(
        `${connection.from}->${connection.to}: ${flow.key} arrow needs color ${show(flow.color)} and lineStyle ${show(flow.lineStyle)}, ` +
          `got ${show(connection.color)} and ${show(connection.lineStyle)}`,
      );
    }
  }
  checkLegend(doc, problems);
  return problems;
}

function main() {
  const names = readdirSync("diagrams").filter((name) => name.endsWith(".json")).sort();
  let failures = 0;
  for (const name of names) {
    const doc = JSON.parse(readFileSync(join("diagrams", name), "utf8"));
    for (const problem of checkDiagram(doc)) {
      console.error(`diagrams/${name} ${problem}`);
      failures += 1;
    }
  }
  if (failures > 0) return 1;
  console.log(`colors ok: ${names.length} diagrams`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
```

- [ ] **Step 4: тесты проходят**

Run: `bun test scripts/check-colors.test.mjs`
Expected: `13 pass`, `0 fail`.

Run: `bun run test`
Expected: `31 pass`, `0 fail`.

- [ ] **Step 5: скрипт `check` в `package.json`**

В `package.json` после строки

```json
    "validate": "bun scripts/eraser.mjs validate",
```

добавить строку

```json
    "check": "bun scripts/check-colors.mjs",
```

`build` в этой задаче не менять: схемы ещё не перекрашены, и сборка упала бы.

- [ ] **Step 6: проверка на текущих схемах**

Run (Bash): `bun run check; echo "exit=$?"`
Expected: много строк в stderr, среди них `diagrams/deployment.json selectel: top-level group color must be one of blue, purple, green, got none` и `diagrams/integrations.json legend: expected exactly one Legend, found 0`; в конце `exit=1`. Это ожидаемо до Task 3.

- [ ] **Step 7: коммит**

```bash
git add scripts/check-colors.mjs scripts/check-colors.test.mjs package.json
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Add check-colors script that enforces the diagram color convention

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 3: Перекраска четырёх схем и `check` в сборке

**Files:**
- Modify: `diagrams/deployment.json`, `diagrams/ci.json`, `diagrams/cd.json`, `diagrams/integrations.json`
- Modify: `package.json` (скрипт `build`)
- Temporary, не коммитится: `recolor.mjs` вне репозитория

**Interfaces:**
- Consumes: `FLOWS`, `expectedLegend`, `flowOf`, `indexById` из `scripts/colors.mjs`; `checkDiagram` из `scripts/check-colors.mjs`; скрипты `validate`, `check`, `render`.
- Produces: четыре схемы, для которых `bun run check` печатает `colors ok: 4 diagrams`; `build` = `bun run validate && bun run check && bun run render && bun run index`.

Раскладка по спеке. Зоны верхних групп: `selectel` blue; `github` purple; `npm-registry`, `docker-registry` green; `vps5`, `vps7` blue; `ours` blue; `yoomoney`, `vk-cloud` green. Стрелки: deployment 4 трафик и 17 прочих; ci 8 пайплайн, 1 алерт, 22 прочих; cd 10 пайплайн, 1 алерт, 24 прочих; integrations 8 трафик, 2 алерта, 4 прочих. Легенда ставится справа от содержимого на `y: 0` с `width: 340`: deployment `x: 2020`, ci `x: 1640`, cd `x: 1760`, integrations `x: 1440` (правый край содержимого плюс 60).

- [ ] **Step 1: одноразовый скрипт перекраски**

Сохранить файл `recolor.mjs` вне репозитория, например в системной временной папке. Содержимое:

```js
// Одноразовая перекраска diagrams/*.json по конвенции. Не коммитится.
// Запуск из корня репозитория: bun <путь>/recolor.mjs
// Правит строки точечно, чтобы сохранить формат «один объект на строку».
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const load = (path) => import(pathToFileURL(resolve(path)).href);
const { FLOWS, expectedLegend, flowOf, indexById } = await load("scripts/colors.mjs");
const { checkDiagram } = await load("scripts/check-colors.mjs");

const ZONE_OF_TOP_GROUP = {
  selectel: "blue",
  github: "purple",
  "npm-registry": "green",
  "docker-registry": "green",
  vps5: "blue",
  vps7: "blue",
  ours: "blue",
  yoomoney: "green",
  "vk-cloud": "green",
};
const LEGEND_AT = {
  deployment: { x: 2020, y: 0 },
  ci: { x: 1640, y: 0 },
  cd: { x: 1760, y: 0 },
  integrations: { x: 1440, y: 0 },
};
const LEGEND_WIDTH = 340;
const FLOW_BY_KEY = Object.fromEntries(FLOWS.map((f) => [f.key, f]));

const strip = (doc) => ({
  entities: doc.entities
    .filter((e) => e.tag !== "Legend")
    .map(({ color, styleMode, ...rest }) => rest),
  connections: doc.connections.map(({ color, lineStyle, ...rest }) => rest),
});

for (const [name, at] of Object.entries(LEGEND_AT)) {
  const path = `diagrams/${name}.json`;
  const original = readFileSync(path, "utf8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const doc = JSON.parse(original);
  const byId = indexById(doc);
  const zoneOf = (id) => (byId[id].containerId ? zoneOf(byId[id].containerId) : ZONE_OF_TOP_GROUP[id]);

  const lines = original.split(/\r?\n/).map((line) => {
    if (!line.includes('"tag":')) return line;
    const obj = JSON.parse(line.trim().replace(/,$/, ""));
    if (obj.tag === "Group") {
      const color = zoneOf(obj.id);
      assert.ok(color, `${name}: no zone for group ${obj.id}`);
      const anchor = `"id": "${obj.id}", `;
      assert.equal(line.split(anchor).length, 2, `${name}: anchor for ${obj.id}`);
      const extra = obj.containerId ? `"color": "${color}", "styleMode": "plain", ` : `"color": "${color}", `;
      return line.replace(anchor, anchor + extra);
    }
    if (obj.tag === "Relationship") {
      const flow = FLOW_BY_KEY[flowOf(obj, byId)];
      if (!flow.color) return line;
      assert.match(line, / \},?$/, `${name}: line end for ${obj.from}->${obj.to}`);
      return line.replace(/ \}(,?)$/, `, "color": "${flow.color}", "lineStyle": "${flow.lineStyle}" }$1`);
    }
    return line;
  });

  const entries = expectedLegend(JSON.parse(lines.join("\n")));
  const closeEntities = lines.findIndex((line) => /^\s*\],\s*$/.test(line));
  let lastEntity = closeEntities - 1;
  while (!lines[lastEntity].trim()) lastEntity -= 1;
  if (!lines[lastEntity].trimEnd().endsWith(",")) lines[lastEntity] = `${lines[lastEntity].trimEnd()},`;
  const entriesText = entries.map((e) => `{ "text": ${JSON.stringify(e.text)}, "color": "${e.color}" }`).join(", ");
  const legendLine = `    { "tag": "Legend", "id": "legend", "x": ${at.x}, "y": ${at.y}, "width": ${LEGEND_WIDTH}, "entries": [${entriesText}] }`;
  lines.splice(lastEntity + 1, 0, legendLine);

  const result = lines.join(eol);
  const recolored = JSON.parse(result);
  assert.deepEqual(checkDiagram(recolored), [], `${name}: convention`);
  assert.deepEqual(strip(recolored), strip(doc), `${name}: only color fields and the legend changed`);
  writeFileSync(path, result);
  console.log(`${name}: recolored, legend ${entries.map((e) => e.text).join("; ")}`);
}
```

Скрипт падает до записи файла, если результат нарушает конвенцию или меняет что-то кроме `color`, `styleMode`, `lineStyle` и легенды. Повторный запуск на уже перекрашенных схемах тоже падает (`deployment: convention`), это защита от двойной правки.

- [ ] **Step 2: запуск**

Run (Bash, из корня репозитория): `bun <путь>/recolor.mjs`
Expected, ровно четыре строки:

```
deployment: recolored, legend Наша инфраструктура; Пользовательский трафик; Прочие связи
ci: recolored, legend GitHub; Внешние сервисы; Пайплайн и внешние системы, пунктир; Алерты и уведомления, точки; Прочие связи
cd: recolored, legend Наша инфраструктура; Пайплайн и внешние системы, пунктир; Алерты и уведомления, точки; Прочие связи
integrations: recolored, legend Наша инфраструктура; Внешние сервисы; Пользовательский трафик; Алерты и уведомления, точки; Прочие связи
```

Run (Bash): `git diff --stat -- diagrams`
Expected: изменены 4 файла, около `80 insertions(+), 76 deletions(-)`.

- [ ] **Step 3: `check` в сборке**

В `package.json` строку

```json
    "build": "bun run validate && bun run render && bun run index",
```

заменить на

```json
    "build": "bun run validate && bun run check && bun run render && bun run index",
```

- [ ] **Step 4: validate, check, render**

Run (Bash):

```bash
bun run validate
bun run check; echo "exit=$?"
bun run build
grep -c 'file://' dist/*.html
grep -oE '<link[^>]*https?://|@import[^;]*https?://|url\(["'"'"']?https?://|src="https?://' dist/*.html | head -3
```

Expected: `validate` печатает `ok` для четырёх схем; `check` печатает `colors ok: 4 diagrams` и `exit=0`; `build` завершается строкой `dist/index.html: 4 diagrams`; все счётчики `file://` равны `0`; последний grep ничего не печатает.

- [ ] **Step 5: осмотр PNG**

Открыть через Read `dist/deployment.png`, `dist/ci.png`, `dist/cd.png`, `dist/integrations.png`. Проверить по каждой:

- рамки и плашки заголовков групп окрашены: Selectel, VPS, VPS 5 · k8s · ARC, VPS 7 · Coolify и «Наша инфраструктура» синие; GitHub и репозитории фиолетовые; NPM Registry, Docker Registry, ЮMoney, VK Cloud зелёные; вложенные группы без тени;
- стрелки от Client оранжевые сплошные; стрелки между шагами пайплайна и внешними узлами чёрные пунктирные; стрелки в Telegram красные из точек; остальные стрелки чёрные сплошные;
- легенда справа вверху, текст читается, легенда не перекрывает ни один узел и ни одну стрелку;
- иконки остались монохромными, подписи читаемы.

Если легенда перекрывает стрелку, сдвинуть её `x` вправо на 40 в JSON, повторить Step 4 и осмотр. Других правок координат в этой задаче нет.

- [ ] **Step 6: коммит**

```bash
git add diagrams/deployment.json diagrams/ci.json diagrams/cd.json diagrams/integrations.json package.json
git status --short
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Color diagrams by zone and flow type, add legends, run check in build

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

Expected: `git status --short` перед коммитом показывает ровно пять `M`-файлов; `recolor.mjs` в репозитории не появился.

- [ ] **Step 7: негативная проверка**

Run (Bash):

```bash
sed -i 's/"id": "vps1", "color": "blue"/"id": "vps1", "color": "green"/' diagrams/deployment.json
bun run check; echo "check-exit=$?"
bun run build > /dev/null 2>&1; echo "build-exit=$?"
git checkout -- diagrams/deployment.json
bun run check
```

Expected: `diagrams/deployment.json vps1: nested group color must equal selectel color blue, got green`, `check-exit=1`, `build-exit=1`; после отката `colors ok: 4 diagrams`.

---

### Task 4: Скилл и README

**Files:**
- Modify: `.claude/skills/eraser-diagrams/SKILL.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: команда `bun run check` (Task 2), таблицы `scripts/colors.mjs` (Task 1), тексты SKILL.md и README после плана миграции на bun.

- [ ] **Step 1: frontmatter скилла**

В `.claude/skills/eraser-diagrams/SKILL.md` строку

```
description: Use when creating or editing diagrams/*.json (eraser-diagrams JSON) — required fields, absolute coordinates, icon lookup, validate → render → inspect loop
```

заменить на

```
description: Use when creating or editing diagrams/*.json (eraser-diagrams JSON) — required fields, absolute coordinates, icon lookup, color convention and legend, validate → check → render → inspect loop
```

- [ ] **Step 2: цикл правки**

Раздел целиком, от строки `## Цикл правки` до строки перед `## Соглашения`:

```
## Цикл правки

1. Измени JSON.
2. `bun run validate` — схема и иконки, без браузера.
3. `bun run render` — `dist/<name>.html` и `dist/<name>.png`; рендерер
   запускается под Node ≥ 22.12 из PATH (под bun Chrome не стартует); нужен
   Chrome или другой Chromium; если автопоиск не находит его, задай
   переменную `CHROMIUM_PATH`.
4. Открой `dist/<name>.png` через Read и проверь глазами: узлы не
   накладываются, все узлы внутри своих групп, заголовки групп не обрезаны,
   подписи читаемы.
5. Поправь координаты (кратно 20), повтори с шага 2.
6. Перед коммитом: `bun run test` и `bun run build` (то же, что делает CI).
```

заменить на

```
## Цикл правки

1. Измени JSON. Новые группы и стрелки сразу крась по разделу «Цвета».
2. `bun run validate` — схема и иконки, без браузера.
3. `bun run check` — цветовая конвенция и легенда, без браузера. Сообщение
   называет id элемента и нужные значения.
4. `bun run render` — `dist/<name>.html` и `dist/<name>.png`; рендерер
   запускается под Node ≥ 22.12 из PATH (под bun Chrome не стартует); нужен
   Chrome или другой Chromium; если автопоиск не находит его, задай
   переменную `CHROMIUM_PATH`.
5. Открой `dist/<name>.png` через Read и проверь глазами: узлы не
   накладываются, все узлы внутри своих групп, заголовки групп не обрезаны,
   подписи читаемы, легенда ничего не перекрывает.
6. Поправь координаты (кратно 20), повтори с шага 2.
7. Перед коммитом: `bun run test` и `bun run build` (то же, что делает CI).
```

- [ ] **Step 3: раздел «Цвета»**

Перед строкой `## Соглашения` вставить:

```
## Цвета

Источник истины: `scripts/colors.mjs`, проверка: `bun run check`.
Спека: `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md` §4.

Группы красятся по зоне владения:

| Зона | `color` верхней группы |
| --- | --- |
| Наша инфраструктура: серверы и сервисы в Selectel | `blue` |
| GitHub: репозитории и их пайплайны | `purple` |
| Внешние сервисы: чужие SaaS и реестры | `green` |

- Вложенная группа: `color` родителя и `"styleMode": "plain"`. У верхней
  группы `styleMode` не задавай.
- У иконок, шагов `Activity` и остальных элементов `color` не бывает, узлы
  вне групп нейтральные.
- Группа не подходит ни в одну зону: не выдумывай цвет, это правка спеки.

Тип стрелки определяется только по её концам, правила сверху вниз:

| Условие | `color` | `lineStyle` |
| --- | --- | --- |
| `to` это `telegram` | `red` | `dotted` |
| `from` это `client` | `orange` | `solid` |
| ровно один конец `Activity` | `black` | `dashed` |
| всё остальное | не задавать | не задавать |

Легенда: ровно один элемент `"tag": "Legend"` с `"id": "legend"`, явными
`x`, `y` и `"width": 340`, без `color`, `containerId`, `styleMode`. Ставь её
справа от содержимого на `y: 0`. Пункты: только зоны верхних групп и типы
стрелок, которые есть на схеме, с текстом и hex из `scripts/colors.mjs`.
Если правка поменяла состав зон или типов стрелок, `bun run check`
напечатает нужный массив `entries`; скопируй его в легенду.

```

- [ ] **Step 4: соглашения и ловушки**

Строку

```
- Никаких `x-`-полей, цветов и стилей сверх необходимого.
```

заменить на

```
- Никаких `x-`-полей и стилей сверх необходимого. Цвета только по разделу «Цвета».
```

В конец раздела `## Известные ловушки` добавить:

```
- Подписи с `https://` CLI рисует синим цветом ссылки. С синей зоной
  «Наша инфраструктура» это не связано, цвет подписи не трогай.
```

- [ ] **Step 5: README**

В `README.md` две строки

```
bun run validate   # схема и иконки, без браузера
bun run render     # dist/<name>.html и dist/<name>.png
bun run build      # validate + render + dist/index.html
```

заменить на

```
bun run validate   # схема и иконки, без браузера
bun run check      # цветовая конвенция и легенды, без браузера
bun run render     # dist/<name>.html и dist/<name>.png
bun run build      # validate + check + render + dist/index.html
```

и фрагмент

```
`.claude/skills/eraser-diagrams/SKILL.md`: изменить JSON, `bun run validate`,
`bun run render`, посмотреть PNG, поправить координаты. Координаты
```

заменить на

```
`.claude/skills/eraser-diagrams/SKILL.md`: изменить JSON, `bun run validate`,
`bun run check`, `bun run render`, посмотреть PNG, поправить координаты.
Цвета групп и стрелок задаёт конвенция, её проверяет `bun run check`. Координаты
```

- [ ] **Step 6: проверка**

Run (Bash):

```bash
head -4 .claude/skills/eraser-diagrams/SKILL.md
grep -n '## Цвета\|bun run check\|styleMode": "plain"\|цветов и стилей' .claude/skills/eraser-diagrams/SKILL.md README.md
git diff --check
```

Expected: frontmatter с `name: eraser-diagrams` и новой `description`; в SKILL.md есть `## Цвета`, `bun run check`, `"styleMode": "plain"`; в README есть `bun run check`; строки `цветов и стилей` нет ни в одном файле; `git diff --check` пуст.

- [ ] **Step 7: коммит**

```bash
git add .claude/skills/eraser-diagrams/SKILL.md README.md
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Docs: color convention in the eraser-diagrams skill and README

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 5: Приёмка части B в CI

Шаги 2–3 пушат ветку и создают PR на GitHub. Это внешние действия: выполнять только после явного подтверждения пользователя.

**Files:** нет изменений.

- [ ] **Step 1: локальная приёмка по §4.9 спеки**

Run (Bash):

```bash
rm -rf dist
bun run test && bun run build
bun run check
ls dist | wc -l
git status --short
```

Expected: `31 pass`, `0 fail`; сборка без ошибок; `colors ok: 4 diagrams`; `9` файлов в `dist`; `git status --short` пуст.

- [ ] **Step 2: (после подтверждения пользователя) push и PR**

```bash
git push -u origin HEAD
BODY="$(mktemp)"
cat > "$BODY" <<'EOF'
Цветовая конвенция по `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`, часть B.

- группы по зоне владения: наша инфраструктура синяя, GitHub фиолетовый, внешние сервисы зелёные
- стрелки по типу: трафик клиента оранжевый, пайплайн и внешние системы пунктир, алерты красные точки
- легенда на каждой схеме, `bun run check` в сборке ловит отклонения

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --base main --title "Color diagrams by zone and flow type" --body-file "$BODY"
```

- [ ] **Step 3: (после подтверждения пользователя) CI зелёный**

Run: `gh run watch --exit-status` для последнего запуска `CI` на ветке.
Expected: job `build` зелёный; в логе `bun run test` строка `31 pass`; в логе `bun run build` строки `colors ok: 4 diagrams` и `dist/index.html: 4 diagrams`.
