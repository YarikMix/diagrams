# TypeScript Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Скрипты `scripts/*.mjs` и их тесты переходят на TypeScript и идиоматичные API bun без изменения поведения, со строгой проверкой типов в CI.

**Architecture:** Модули переводятся по одному от листьев к корню: типы документа и правила цветов, проверка цветов, индекс, каталог иконок, обёртка CLI, сборка сайта. Каждый шаг переименовывает модуль и его тест в `.ts`, переводит на `Bun.*` и `bun:test`, обновляет импорт в ещё не переведённом соседе и строку в `package.json`, так что после каждого шага `bun run typecheck`, `bun run test` и сборка работают. Последние задачи добавляют проверку типов в CI и обновляют документацию.

**Tech Stack:** bun 1.3.13 (CI) / ≥ 1.3 локально, TypeScript 7.0.2 (`tsc`), `@types/bun` 1.4.2, `bun:test`, `@eraserlabs/diagrams-cli@0.1.0` (рендерер под Node ≥ 22.12).

**Spec:** `docs/superpowers/specs/2026-09-14-typescript-design.md`. Контекст: `docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md`, `docs/superpowers/specs/2026-09-13-branch-previews-design.md`.

## Global Constraints

- `devDependencies`: `"@eraserlabs/diagrams-cli": "0.1.0"`, `"@types/bun": "1.4.2"`, `"typescript": "7.0.2"`, без `^`. Runtime-зависимостей нет.
- `package.json` скрипт `"typecheck": "tsc"`; `tsconfig.json` ровно как в Task 1 (strict, noUncheckedIndexedAccess, noEmit, types bun).
- Импорты между скриптами пишутся с расширением `.ts`. Точка входа: `if (import.meta.main)`.
- API bun: `Bun.Glob`, `Bun.file`, `Bun.write`, `Bun.spawnSync`, `Bun.resolveSync`, `Bun.deepEquals`, `bun:test`. `node:fs` только для `cpSync`, `rmSync`, `mkdtempSync`, `existsSync` и `appendFileSync`; `node:path` и `node:os` разрешены.
- Поведение не меняется: те же экспортируемые имена (кроме асинхронных `cliEntry` и `rendererCommand`, входа `nodeProbeVerdict`, новых `FLOW_BY_KEY` и `spawnError`), тексты сообщений, коды выхода, порядок шагов `build-site`.
- Тестов всегда 52: сценарии и имена сохраняются, меняются синтаксис проверок и фикстуры под типы.
- После каждой задачи: `bun run typecheck` без ошибок, `bun run test` 52 pass.
- Коммит-сообщения пишутся в файл через Bash heredoc и коммитятся `git commit -F <файл>`; PowerShell here-strings не использовать. Каждое сообщение заканчивается строкой `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ничего не пушить и не менять настройки репозитория без явного запроса пользователя (Task 8 оговаривает это отдельно). SSH-ключ в этой среде не работает; push выполняется через HTTPS с учётными данными `gh`.

---

## File Structure

| Файл | Ответственность |
| --- | --- |
| `package.json`, `bun.lock` | dev-зависимости TypeScript, скрипт `typecheck`, пути скриптов `.ts` |
| `tsconfig.json` | строгая проверка типов без выпуска файлов |
| `scripts/diagram.ts` | типы документа диаграммы |
| `scripts/colors.ts`, `scripts/colors.test.ts` | правила цветовой конвенции |
| `scripts/check-colors.ts`, `scripts/check-colors.test.ts` | проверка конвенции во всех схемах |
| `scripts/build-index.ts`, `scripts/build-index.test.ts` | `dist/index.html` |
| `scripts/fetch-icons.ts`, `scripts/fetch-icons.test.ts` | `icons.txt` |
| `scripts/eraser.ts`, `scripts/eraser.test.ts` | обёртка CLI рендерера под node |
| `scripts/build-site.ts`, `scripts/build-site.test.ts` | сборка сайта с превью веток |
| `.github/workflows/ci.yml`, `.github/workflows/pages.yml` | шаг `bun run typecheck` |
| `README.md`, `.claude/skills/eraser-diagrams/SKILL.md` | команды и пути `.ts` |

---

### Task 1: Инструменты, типы документа, `colors.ts`

**Files:**
- Modify: `package.json`, `bun.lock` (через `bun install`)
- Create: `tsconfig.json`, `scripts/diagram.ts`, `scripts/colors.ts`, `scripts/colors.test.ts`
- Delete: `scripts/colors.mjs`, `scripts/colors.test.mjs`
- Modify: `scripts/check-colors.mjs` (строка импорта)

**Interfaces:**
- Produces:
  - `scripts/diagram.ts`: типы `PaletteColor`, `ZoneColor`, `LineStyle`, `StyleMode`, `EntityBase`, `GroupEntity`, `IconEntity`, `ActivityEntity`, `TextboxEntity`, `LegendEntry`, `LegendEntity`, `Entity`, `Relationship`, `DiagramDoc`.
  - `scripts/colors.ts`: `PaletteName`, `PALETTE_HEX: Readonly<Record<PaletteName, string>>`, `DEFAULT_EDGE_HEX`, `Zone`, `FlowKey`, `Flow`, `ZONES: readonly Zone[]`, `FLOWS: readonly Flow[]`, `FLOW_BY_KEY: Readonly<Record<FlowKey, Flow>>`, `TaggedNode`, `Endpoints`, `LegendSource`, `indexById<T extends { id: string }>(doc: { entities: readonly T[] }): Record<string, T>`, `flowOf(connection: Endpoints, entitiesById: Readonly<Record<string, TaggedNode>>): FlowKey`, `expectedLegend(doc: LegendSource): LegendEntry[]`.
  - `bun run typecheck`.

- [ ] **Step 1: `package.json` и зависимости**

Заменить `package.json` целиком:

```json
{
  "name": "diagrams",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12", "bun": ">=1.3" },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc",
    "validate": "bun scripts/eraser.mjs validate",
    "check": "bun scripts/check-colors.mjs",
    "render": "bun scripts/eraser.mjs render -f html && bun scripts/eraser.mjs render -f png",
    "index": "bun scripts/build-index.mjs",
    "build": "bun run validate && bun run check && bun run render && bun run index",
    "site": "bun scripts/build-site.mjs",
    "icons": "bun scripts/fetch-icons.mjs"
  },
  "devDependencies": {
    "@eraserlabs/diagrams-cli": "0.1.0",
    "@types/bun": "1.4.2",
    "typescript": "7.0.2"
  }
}
```

Run (Bash):

```bash
bun install
bun install --frozen-lockfile
grep -E '"(typescript|@types/bun)"' package.json
git diff --stat bun.lock
```

Expected: оба `bun install` без ошибок; в `package.json` `"@types/bun": "1.4.2"` и `"typescript": "7.0.2"`; `bun.lock` изменён.

- [ ] **Step 2: `tsconfig.json`**

Создать `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["scripts/**/*.ts"]
}
```

- [ ] **Step 3: типы документа**

Создать `scripts/diagram.ts`:

```ts
// Типы документа диаграммы: только поля, которые читают наши скрипты.
// Схему целиком проверяет `bun run validate`, здесь её не повторяем.
// Спека: docs/superpowers/specs/2026-09-14-typescript-design.md §4.

export type PaletteColor = "blue" | "purple" | "green" | "orange" | "red" | "black" | "yellow" | "white";
export type ZoneColor = "blue" | "purple" | "green";
export type LineStyle = "solid" | "dashed" | "dotted";
export type StyleMode = "plain" | "shadow" | "watercolor";

export interface EntityBase {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  containerId?: string;
  color?: PaletteColor;
  [prop: string]: unknown;
}

export interface GroupEntity extends EntityBase {
  tag: "Group";
  styleMode?: StyleMode;
  title?: { text: string; icon?: string };
  isContainer?: boolean;
}

export interface IconEntity extends EntityBase {
  tag: "Icon";
  icon: string;
  texts?: { text: string }[];
}

export interface ActivityEntity extends EntityBase {
  tag: "Activity";
  texts?: { text: string }[];
}

export interface TextboxEntity extends EntityBase {
  tag: "Textbox";
  text: string;
}

export interface LegendEntry {
  text: string;
  color: string;
}

export interface LegendEntity extends EntityBase {
  tag: "Legend";
  entries: LegendEntry[];
  styleMode?: StyleMode;
}

export type Entity = GroupEntity | IconEntity | ActivityEntity | TextboxEntity | LegendEntity;

export interface Relationship {
  tag?: "Relationship";
  from: string;
  to: string;
  label?: string;
  color?: PaletteColor;
  lineStyle?: LineStyle;
  [prop: string]: unknown;
}

export interface DiagramDoc {
  entities: Entity[];
  connections: Relationship[];
}
```

- [ ] **Step 4: падающий тест `colors.test.ts`**

Создать `scripts/colors.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  DEFAULT_EDGE_HEX,
  FLOWS,
  PALETTE_HEX,
  ZONES,
  expectedLegend,
  flowOf,
  type LegendSource,
  type TaggedNode,
} from "./colors.ts";

const byId: Record<string, TaggedNode> = {
  client: { tag: "Icon" },
  telegram: { tag: "Icon" },
  api: { tag: "Icon" },
  db: { tag: "Icon" },
  build: { tag: "Activity" },
  deploy: { tag: "Activity" },
  pipeline: { tag: "Group" },
};

test("flowOf: an arrow into telegram is alerts", () => {
  expect(flowOf({ from: "pipeline", to: "telegram" }, byId)).toBe("alerts");
});

test("flowOf: the telegram rule wins over the client rule", () => {
  expect(flowOf({ from: "client", to: "telegram" }, byId)).toBe("alerts");
});

test("flowOf: an arrow from client is user traffic", () => {
  expect(flowOf({ from: "client", to: "api" }, byId)).toBe("user");
});

test("flowOf: exactly one Activity end is pipeline, in both directions", () => {
  expect(flowOf({ from: "deploy", to: "db" }, byId)).toBe("pipeline");
  expect(flowOf({ from: "db", to: "build" }, byId)).toBe("pipeline");
});

test("flowOf: Activity to Activity and Icon to Icon are other", () => {
  expect(flowOf({ from: "build", to: "deploy" }, byId)).toBe("other");
  expect(flowOf({ from: "api", to: "db" }, byId)).toBe("other");
});

test("expectedLegend: top-level zones in table order, then present flows in legend order", () => {
  const doc: LegendSource = {
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
  expect(expectedLegend(doc)).toEqual([
    { text: "Наша инфраструктура", color: "#2866c4" },
    { text: "Внешние сервисы", color: "#30a050" },
    { text: "Пользовательский трафик", color: "#c38424" },
    { text: "Прочие связи", color: "#1c1c1c" },
  ]);
});

test("every zone and colored flow uses a palette color with its palette hex", () => {
  for (const item of [...ZONES, ...FLOWS]) {
    if (item.color) expect(item.hex).toBe(PALETTE_HEX[item.color]);
  }
});

test("PALETTE_HEX matches the palette of the installed eraser-diagrams engine", async () => {
  const paletteUrl = new URL("../node_modules/@eraserlabs/diagrams/dist/library/schema/palette.js", import.meta.url);
  const { STOCK_PALETTE } = (await import(paletteUrl.href)) as { STOCK_PALETTE: Record<string, string> };
  for (const [name, hex] of Object.entries(PALETTE_HEX)) {
    expect(STOCK_PALETTE[name]).toBe(hex);
  }
});

test("DEFAULT_EDGE_HEX is still the engine's default arrow color", async () => {
  const normalizersUrl = new URL("../node_modules/@eraserlabs/diagrams/dist/library/normalizers.js", import.meta.url);
  const source = await Bun.file(normalizersUrl).text();
  expect(source.includes(DEFAULT_EDGE_HEX)).toBe(true);
});
```

Run: `bun test scripts/colors.test.ts`
Expected: FAIL, ошибка `Cannot find module` с упоминанием `./colors.ts`.

- [ ] **Step 5: `colors.ts` и уборка**

Создать `scripts/colors.ts`:

```ts
// Цветовая конвенция диаграмм: цвета зон для групп, типы стрелок, ожидаемая легенда.
// Спека: docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md §4.
import type { Entity, LegendEntry, LineStyle, Relationship, ZoneColor } from "./diagram.ts";

export type PaletteName = "blue" | "purple" | "green" | "orange" | "red" | "black";

export const PALETTE_HEX: Readonly<Record<PaletteName, string>> = {
  blue: "#2866c4",
  purple: "#c43dcf",
  green: "#30a050",
  orange: "#c38424",
  red: "#bd413a",
  black: "#3a3a3a",
};

// Цвет стрелки без поля color в CLI 0.1.0.
export const DEFAULT_EDGE_HEX = "#1c1c1c";

export interface Zone {
  key: string;
  color: ZoneColor;
  legendText: string;
  hex: string;
}

export type FlowKey = "user" | "pipeline" | "alerts" | "other";

export interface Flow {
  key: FlowKey;
  color: PaletteName | undefined;
  lineStyle: LineStyle | undefined;
  legendText: string;
  hex: string;
}

export const ZONES: readonly Zone[] = [
  { key: "ours", color: "blue", legendText: "Наша инфраструктура", hex: PALETTE_HEX.blue },
  { key: "github", color: "purple", legendText: "GitHub", hex: PALETTE_HEX.purple },
  { key: "external", color: "green", legendText: "Внешние сервисы", hex: PALETTE_HEX.green },
];

const USER: Flow = { key: "user", color: "orange", lineStyle: "solid", legendText: "Пользовательский трафик", hex: PALETTE_HEX.orange };
const PIPELINE: Flow = { key: "pipeline", color: "black", lineStyle: "dashed", legendText: "Пайплайн и внешние системы, пунктир", hex: PALETTE_HEX.black };
const ALERTS: Flow = { key: "alerts", color: "red", lineStyle: "dotted", legendText: "Алерты и уведомления, точки", hex: PALETTE_HEX.red };
const OTHER: Flow = { key: "other", color: undefined, lineStyle: undefined, legendText: "Прочие связи", hex: DEFAULT_EDGE_HEX };

// Порядок массива задаёт порядок пунктов в легенде.
export const FLOWS: readonly Flow[] = [USER, PIPELINE, ALERTS, OTHER];
export const FLOW_BY_KEY: Readonly<Record<FlowKey, Flow>> = { user: USER, pipeline: PIPELINE, alerts: ALERTS, other: OTHER };

// Минимум полей, который нужен правилам: полный документ им тоже подходит.
export type TaggedNode = Pick<Entity, "tag">;
export type Endpoints = Pick<Relationship, "from" | "to">;
export interface LegendSource {
  entities: readonly Pick<Entity, "tag" | "id" | "containerId" | "color">[];
  connections: readonly Endpoints[];
}

export function indexById<T extends { id: string }>(doc: { entities: readonly T[] }): Record<string, T> {
  return Object.fromEntries(doc.entities.map((entity) => [entity.id, entity]));
}

// Тип стрелки по её концам, правила §4.2 проверяются сверху вниз.
export function flowOf(connection: Endpoints, entitiesById: Readonly<Record<string, TaggedNode>>): FlowKey {
  if (connection.to === "telegram") return "alerts";
  if (connection.from === "client") return "user";
  const fromActivity = entitiesById[connection.from]?.tag === "Activity";
  const toActivity = entitiesById[connection.to]?.tag === "Activity";
  if (fromActivity !== toActivity) return "pipeline";
  return "other";
}

export function expectedLegend(doc: LegendSource): LegendEntry[] {
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

Удалить старые файлы: `git rm -q scripts/colors.mjs scripts/colors.test.mjs`.

В `scripts/check-colors.mjs` строку

```js
import { FLOWS, ZONES, expectedLegend, flowOf, indexById } from "./colors.mjs";
```

заменить на

```js
import { FLOWS, ZONES, expectedLegend, flowOf, indexById } from "./colors.ts";
```

- [ ] **Step 6: проверка**

Run (Bash):

```bash
bun run typecheck; echo "typecheck-exit=$?"
bun test scripts/colors.test.ts
bun run test
bun run check
```

Expected: `typecheck-exit=0` без вывода ошибок; `9 pass`, `0 fail`; полный прогон `52 pass`, `0 fail`; `colors ok: 4 diagrams`.

- [ ] **Step 7: коммит**

```bash
git add package.json bun.lock tsconfig.json scripts/diagram.ts scripts/colors.ts scripts/colors.test.ts scripts/check-colors.mjs
git status --short
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Add TypeScript tooling, diagram types and colors.ts on bun APIs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

Expected: `git status --short` перед коммитом показывает `M package.json`, `M bun.lock`, `A tsconfig.json`, `A scripts/diagram.ts`, `A scripts/colors.ts`, `A scripts/colors.test.ts`, `D scripts/colors.mjs`, `D scripts/colors.test.mjs`, `M scripts/check-colors.mjs`.

---

### Task 2: `check-colors.ts`

**Files:**
- Create: `scripts/check-colors.ts`, `scripts/check-colors.test.ts`
- Delete: `scripts/check-colors.mjs`, `scripts/check-colors.test.mjs`
- Modify: `package.json` (скрипт `check`)

**Interfaces:**
- Consumes: `FLOW_BY_KEY`, `ZONES`, `expectedLegend`, `flowOf`, `indexById` из `scripts/colors.ts`; `DiagramDoc`, `Entity`, `GroupEntity`, `LegendEntity`, `Relationship` из `scripts/diagram.ts`.
- Produces: `checkDiagram(doc: DiagramDoc): string[]`; `bun run check`.

- [ ] **Step 1: падающий тест**

Создать `scripts/check-colors.test.ts`:

```ts
import { expect, test } from "bun:test";
import { checkDiagram } from "./check-colors.ts";
import type { DiagramDoc, Entity, LegendEntity, Relationship } from "./diagram.ts";

function validDoc(): DiagramDoc {
  return {
    entities: [
      { tag: "Group", id: "ours", x: 0, y: 0, width: 400, height: 300, isContainer: true, color: "blue", title: { text: "Ours" } },
      { tag: "Group", id: "vps", x: 20, y: 40, width: 360, height: 240, containerId: "ours", isContainer: true, color: "blue", styleMode: "plain", title: { text: "VPS" } },
      { tag: "Icon", id: "api", x: 40, y: 80, containerId: "vps", icon: "server", texts: [{ text: "API" }] },
      { tag: "Icon", id: "db", x: 180, y: 80, containerId: "vps", icon: "database", texts: [{ text: "DB" }] },
      { tag: "Icon", id: "client", x: 500, y: 80, icon: "chrome", texts: [{ text: "Client" }] },
      { tag: "Activity", id: "deploy", x: 40, y: 200, width: 120, height: 60, containerId: "vps", texts: [{ text: "Deploy" }] },
      { tag: "Icon", id: "telegram", x: 500, y: 240, icon: "telegram", texts: [{ text: "Telegram" }] },
      {
        tag: "Legend", id: "legend", x: 700, y: 0, width: 340,
        entries: [
          { text: "Наша инфраструктура", color: "#2866c4" },
          { text: "Пользовательский трафик", color: "#c38424" },
          { text: "Пайплайн и внешние системы, пунктир", color: "#3a3a3a" },
          { text: "Алерты и уведомления, точки", color: "#bd413a" },
          { text: "Прочие связи", color: "#1c1c1c" },
        ],
      },
    ],
    connections: [
      { tag: "Relationship", from: "client", to: "api", color: "orange", lineStyle: "solid" },
      { tag: "Relationship", from: "api", to: "db" },
      { tag: "Relationship", from: "deploy", to: "db", color: "black", lineStyle: "dashed" },
      { tag: "Relationship", from: "vps", to: "telegram", color: "red", lineStyle: "dotted" },
    ],
  };
}

function entity(doc: DiagramDoc, id: string): Entity {
  const found = doc.entities.find((e) => e.id === id);
  if (!found) throw new Error(`no entity ${id}`);
  return found;
}

function legendOf(doc: DiagramDoc): LegendEntity {
  const found = doc.entities.find((e): e is LegendEntity => e.tag === "Legend");
  if (!found) throw new Error("no legend");
  return found;
}

function connection(doc: DiagramDoc, index: number): Relationship {
  const found = doc.connections[index];
  if (!found) throw new Error(`no connection ${index}`);
  return found;
}

test("a diagram that follows the convention has no problems", () => {
  expect(checkDiagram(validDoc())).toEqual([]);
});

const violations: [name: string, id: string, mutate: (d: DiagramDoc) => void][] = [
  ["top-level group without a zone color", "ours", (d) => { delete entity(d, "ours").color; }],
  ["top-level group with styleMode", "ours", (d) => { entity(d, "ours").styleMode = "plain"; }],
  ["nested group with a different color", "vps", (d) => { entity(d, "vps").color = "green"; }],
  ["nested group without styleMode plain", "vps", (d) => { delete entity(d, "vps").styleMode; }],
  ["icon with a color", "api", (d) => { entity(d, "api").color = "red"; }],
  ["user traffic arrow without color", "client->api", (d) => { delete connection(d, 0).color; }],
  ["other arrow with a lineStyle", "api->db", (d) => { connection(d, 1).lineStyle = "dashed"; }],
  ["no legend", "legend", (d) => { d.entities = d.entities.filter((e) => e.tag !== "Legend"); }],
  ["two legends", "legend", (d) => { d.entities.push({ ...legendOf(d), id: "legend-2" }); }],
  ["legend with a wrong id", "key", (d) => { legendOf(d).id = "key"; }],
  ["legend with a color", "legend", (d) => { legendOf(d).color = "blue"; }],
  ["legend entries in a wrong order", "legend", (d) => { legendOf(d).entries.reverse(); }],
  ["legend with containerId", "legend", (d) => { legendOf(d).containerId = "ours"; }],
  ["legend with styleMode", "legend", (d) => { legendOf(d).styleMode = "plain"; }],
  ["Telegram icon with another id", "tg", (d) => {
    entity(d, "telegram").id = "tg";
    const alert = connection(d, 3);
    alert.to = "tg";
    delete alert.color;
    delete alert.lineStyle;
    const legend = legendOf(d);
    legend.entries = legend.entries.filter((e) => e.text !== "Алерты и уведомления, точки");
  }],
];

for (const [name, id, mutate] of violations) {
  test(`reports ${name} exactly once under id ${id}`, () => {
    const doc = validDoc();
    mutate(doc);
    const problems = checkDiagram(doc);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.startsWith(`${id}:`)).toBe(true);
  });
}

test("the missing-legend message includes the expected entries", () => {
  const doc = validDoc();
  doc.entities = doc.entities.filter((e) => e.tag !== "Legend");
  const problems = checkDiagram(doc);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('entries: [{"text":"Наша инфраструктура"');
});
```

Run: `bun test scripts/check-colors.test.ts`
Expected: FAIL, `Cannot find module` с упоминанием `./check-colors.ts`.

- [ ] **Step 2: реализация**

Создать `scripts/check-colors.ts`:

```ts
// Проверяет цветовую конвенцию во всех diagrams/*.json.
// Спека: docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md §4.5.
// Использование: bun scripts/check-colors.ts
import { join } from "node:path";
import { FLOW_BY_KEY, ZONES, expectedLegend, flowOf, indexById } from "./colors.ts";
import type { DiagramDoc, Entity, GroupEntity } from "./diagram.ts";

const ZONE_COLORS: readonly string[] = ZONES.map((z) => z.color);
const isZoneColor = (value: unknown): boolean => typeof value === "string" && ZONE_COLORS.includes(value);
const show = (value: unknown): string => (value === undefined ? "none" : String(value));

function checkGroup(group: GroupEntity, byId: Readonly<Record<string, Entity>>, problems: string[]): boolean {
  let hadProblem = false;
  if (!group.containerId) {
    if (!isZoneColor(group.color)) {
      problems.push(`${group.id}: top-level group color must be one of ${ZONE_COLORS.join(", ")}, got ${show(group.color)}`);
      hadProblem = true;
    }
    if (group.styleMode !== undefined) {
      problems.push(`${group.id}: top-level group must not set styleMode, got ${group.styleMode}`);
      hadProblem = true;
    }
    return hadProblem;
  }
  const parentColor = byId[group.containerId]?.color;
  if (isZoneColor(parentColor) && group.color !== parentColor) {
    problems.push(`${group.id}: nested group color must equal ${group.containerId} color ${show(parentColor)}, got ${show(group.color)}`);
    hadProblem = true;
  }
  if (group.styleMode !== "plain") {
    problems.push(`${group.id}: nested group styleMode must be plain, got ${show(group.styleMode)}`);
    hadProblem = true;
  }
  return hadProblem;
}

function checkLegend(doc: DiagramDoc, problems: string[], skipEntries: boolean): void {
  const legends = doc.entities.filter((e) => e.tag === "Legend");
  const [legend] = legends;
  if (legends.length !== 1 || !legend) {
    if (legends.length === 0) {
      problems.push(`legend: expected exactly one Legend, found 0; entries: ${JSON.stringify(expectedLegend(doc))}`);
    } else {
      problems.push(`legend: expected exactly one Legend, found ${legends.length}`);
    }
    return;
  }
  if (legend.id !== "legend") {
    problems.push(`${legend.id}: Legend id must be "legend"`);
  }
  for (const field of ["color", "containerId", "styleMode"] as const) {
    if (legend[field] !== undefined) {
      problems.push(`${legend.id}: Legend must not set ${field}`);
    }
  }
  if (skipEntries) return;
  const expected = expectedLegend(doc);
  if (!Bun.deepEquals(legend.entries, expected)) {
    problems.push(`${legend.id}: entries must be ${JSON.stringify(expected)}`);
  }
}

export function checkDiagram(doc: DiagramDoc): string[] {
  const problems: string[] = [];
  const byId = indexById(doc);
  let hasGroupProblem = false;
  for (const entity of doc.entities) {
    if (entity.tag === "Group") {
      if (checkGroup(entity, byId, problems)) hasGroupProblem = true;
    } else if (entity.tag !== "Legend" && entity.color !== undefined) {
      problems.push(`${entity.id}: ${entity.tag} must not set color`);
    }
    if (entity.icon === "telegram" && entity.id !== "telegram") {
      problems.push(`${entity.id}: a Telegram icon node must have id "telegram", otherwise arrows into it are not typed as alerts`);
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
  checkLegend(doc, problems, hasGroupProblem);
  return problems;
}

async function main(): Promise<number> {
  const names = [...new Bun.Glob("*.json").scanSync("diagrams")].sort();
  let failures = 0;
  for (const name of names) {
    const doc = (await Bun.file(join("diagrams", name)).json()) as DiagramDoc;
    for (const problem of checkDiagram(doc)) {
      console.error(`diagrams/${name} ${problem}`);
      failures += 1;
    }
  }
  if (failures > 0) return 1;
  console.log(`colors ok: ${names.length} diagrams`);
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
```

Удалить: `git rm -q scripts/check-colors.mjs scripts/check-colors.test.mjs`.

В `package.json` строку `"check": "bun scripts/check-colors.mjs",` заменить на `"check": "bun scripts/check-colors.ts",`.

- [ ] **Step 3: проверка**

Run (Bash):

```bash
bun run typecheck; echo "typecheck-exit=$?"
bun test scripts/check-colors.test.ts
bun run test
bun run check; echo "check-exit=$?"
```

Expected: `typecheck-exit=0`; `17 pass`, `0 fail`; полный прогон `52 pass`; `colors ok: 4 diagrams` и `check-exit=0`.

- [ ] **Step 4: коммит**

```bash
git add package.json scripts/check-colors.ts scripts/check-colors.test.ts
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Port check-colors to TypeScript and bun APIs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 3: `build-index.ts`

**Files:**
- Create: `scripts/build-index.ts`, `scripts/build-index.test.ts`
- Delete: `scripts/build-index.mjs`, `scripts/build-index.test.mjs`
- Modify: `package.json` (скрипт `index`), `scripts/build-site.mjs` (строка импорта)

**Interfaces:**
- Produces: `diagramNames(dir = "diagrams"): string[]`, `renderIndex(names: readonly string[], options: { previewsHref?: string } = {}): string`; `bun run index`.

- [ ] **Step 1: падающий тест**

Создать `scripts/build-index.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagramNames, renderIndex } from "./build-index.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("diagramNames: basenames of *.json without extension, sorted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "index-"));
  tempDirs.push(dir);
  await Bun.write(join(dir, "cd.json"), "{}");
  await Bun.write(join(dir, "ci.json"), "{}");
  await Bun.write(join(dir, "README.md"), "");
  expect(diagramNames(dir)).toEqual(["cd", "ci"]);
});

test("renderIndex: one card per diagram with html link, png link and preview", () => {
  const html = renderIndex(["deployment", "ci"]);
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toMatch(/<h2>deployment<\/h2>/);
  expect(html).toMatch(/href="deployment\.html"/);
  expect(html).toMatch(/href="deployment\.png"/);
  expect(html).toMatch(/<img src="deployment\.png"/);
  expect(html).toMatch(/<h2>ci<\/h2>/);
  expect(html).not.toMatch(/<link|<script/);
});

test("renderIndex: links branch previews only when previewsHref is given", () => {
  expect(renderIndex(["ci"], { previewsHref: "branches/" })).toMatch(/<a href="branches\/">Превью веток<\/a>/);
  expect(renderIndex(["ci"])).not.toMatch(/Превью веток/);
});
```

Run: `bun test scripts/build-index.test.ts`
Expected: FAIL, `Cannot find module` с упоминанием `./build-index.ts`.

- [ ] **Step 2: реализация**

Создать `scripts/build-index.ts`:

```ts
// Собирает dist/index.html: заголовок, ссылки на <name>.html и <name>.png,
// превью PNG. Один статичный файл, CSS встроен, зависимостей нет.
// Использование: bun scripts/build-index.ts
import { join } from "node:path";

export function diagramNames(dir = "diagrams"): string[] {
  return [...new Bun.Glob("*.json").scanSync(dir)].sort().map((name) => name.slice(0, -".json".length));
}

export function renderIndex(names: readonly string[], options: { previewsHref?: string } = {}): string {
  const cards = names
    .map(
      (name) => `    <section class="card">
      <h2>${name}</h2>
      <p><a href="${name}.html">HTML</a> · <a href="${name}.png">PNG</a></p>
      <a href="${name}.html"><img src="${name}.png" alt="${name}"></a>
    </section>`,
    )
    .join("\n");
  const previews = options.previewsHref
    ? `\n  <p><a href="${options.previewsHref}">Превью веток</a></p>`
    : "";
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
${cards}${previews}
</body>
</html>
`;
}

if (import.meta.main) {
  const names = diagramNames();
  await Bun.write(join("dist", "index.html"), renderIndex(names));
  console.error(`dist/index.html: ${names.length} diagrams`);
}
```

Удалить: `git rm -q scripts/build-index.mjs scripts/build-index.test.mjs`.

В `package.json` строку `"index": "bun scripts/build-index.mjs",` заменить на `"index": "bun scripts/build-index.ts",`.

В `scripts/build-site.mjs` строку

```js
import { diagramNames, renderIndex } from "./build-index.mjs";
```

заменить на

```js
import { diagramNames, renderIndex } from "./build-index.ts";
```

- [ ] **Step 3: проверка**

Run (Bash):

```bash
bun run typecheck; echo "typecheck-exit=$?"
bun test scripts/build-index.test.ts
bun run test
rm -rf dist && bun run index && ls dist
```

Expected: `typecheck-exit=0`; `3 pass`; полный прогон `52 pass`; `dist/index.html: 4 diagrams`, `ls dist` показывает `index.html` (каталог создан `Bun.write`).

- [ ] **Step 4: коммит**

```bash
git add package.json scripts/build-index.ts scripts/build-index.test.ts scripts/build-site.mjs
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Port build-index to TypeScript and bun APIs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 4: `fetch-icons.ts`

**Files:**
- Create: `scripts/fetch-icons.ts`, `scripts/fetch-icons.test.ts`
- Delete: `scripts/fetch-icons.mjs`, `scripts/fetch-icons.test.mjs`
- Modify: `package.json` (скрипт `icons`)

**Interfaces:**
- Produces: `LIST_URL`, `GcsPage`, `FetchLike`, `namesFromPage(page: GcsPage): string[]`, `fetchAllIcons(fetchImpl?: FetchLike): Promise<string[]>`, `formatIconsFile(names: readonly string[]): string`; `bun run icons`.

- [ ] **Step 1: падающий тест**

Создать `scripts/fetch-icons.test.ts`:

```ts
import { expect, test } from "bun:test";
import { LIST_URL, fetchAllIcons, formatIconsFile, namesFromPage, type FetchLike, type GcsPage } from "./fetch-icons.ts";

test("namesFromPage strips prefix and .svg, drops the folder entry and non-svg", () => {
  const page: GcsPage = {
    items: [
      { name: "canvas-icons/" },
      { name: "canvas-icons/go.svg" },
      { name: "canvas-icons/readme.txt" },
      { name: "canvas-icons/postgres.svg" },
    ],
  };
  expect(namesFromPage(page)).toEqual(["go", "postgres"]);
});

test("fetchAllIcons follows nextPageToken, dedupes and sorts", async () => {
  const calls: string[] = [];
  const fakeFetch: FetchLike = async (url) => {
    calls.push(url);
    const page: GcsPage = url.includes("pageToken=tok1")
      ? { items: [{ name: "canvas-icons/aws.svg" }, { name: "canvas-icons/go.svg" }] }
      : { items: [{ name: "canvas-icons/go.svg" }, { name: "canvas-icons/zulu.svg" }], nextPageToken: "tok1" };
    return { ok: true, status: 200, json: async () => page };
  };
  const names = await fetchAllIcons(fakeFetch);
  expect(names).toEqual(["aws", "go", "zulu"]);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toBe(LIST_URL);
  expect(calls[1]?.endsWith("&pageToken=tok1")).toBe(true);
});

test("fetchAllIcons throws on non-2xx", async () => {
  const fakeFetch: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await expect(fetchAllIcons(fakeFetch)).rejects.toThrow(/GCS 503/);
});

test("formatIconsFile: one name per line, trailing newline", () => {
  expect(formatIconsFile(["a", "b"])).toBe("a\nb\n");
});
```

Run: `bun test scripts/fetch-icons.test.ts`
Expected: FAIL, `Cannot find module` с упоминанием `./fetch-icons.ts`.

- [ ] **Step 2: реализация**

Создать `scripts/fetch-icons.ts`:

```ts
// Обновляет icons.txt: имена иконок публичного каталога Eraser
// (https://storage.googleapis.com/eraser-public-assets/canvas-icons/<name>.svg).
// Использование: bun scripts/fetch-icons.ts

export const LIST_URL =
  "https://storage.googleapis.com/storage/v1/b/eraser-public-assets/o" +
  "?prefix=canvas-icons/&maxResults=1000&fields=items(name),nextPageToken";
const PREFIX = "canvas-icons/";
const SUFFIX = ".svg";

export interface GcsPage {
  items?: { name: string }[];
  nextPageToken?: string;
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function namesFromPage(page: GcsPage): string[] {
  return (page.items ?? [])
    .map((item) => item.name)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => name.slice(PREFIX.length, -SUFFIX.length));
}

export async function fetchAllIcons(fetchImpl: FetchLike = fetch): Promise<string[]> {
  const names = new Set<string>();
  let pageToken: string | undefined;
  do {
    const url = pageToken ? `${LIST_URL}&pageToken=${encodeURIComponent(pageToken)}` : LIST_URL;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`GCS ${res.status} for ${url}`);
    const page = (await res.json()) as GcsPage;
    for (const name of namesFromPage(page)) names.add(name);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...names].sort();
}

export function formatIconsFile(names: readonly string[]): string {
  return names.join("\n") + "\n";
}

if (import.meta.main) {
  const names = await fetchAllIcons();
  await Bun.write("icons.txt", formatIconsFile(names));
  console.error(`icons.txt: ${names.length} names`);
}
```

Удалить: `git rm -q scripts/fetch-icons.mjs scripts/fetch-icons.test.mjs`.

В `package.json` строку `"icons": "bun scripts/fetch-icons.mjs"` заменить на `"icons": "bun scripts/fetch-icons.ts"`.

- [ ] **Step 3: проверка**

Run (Bash):

```bash
bun run typecheck; echo "typecheck-exit=$?"
bun test scripts/fetch-icons.test.ts
bun run test
bun run icons && git diff --stat icons.txt
```

Expected: `typecheck-exit=0`; `4 pass`; полный прогон `52 pass`; `icons.txt: 38xx names` и пустой `git diff --stat` (нужна сеть; если каталог Eraser изменился, записать дифф в отчёт и вернуть файл `git checkout -- icons.txt`).

- [ ] **Step 4: коммит**

```bash
git add package.json scripts/fetch-icons.ts scripts/fetch-icons.test.ts
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Port fetch-icons to TypeScript and bun APIs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 5: `eraser.ts`

**Files:**
- Create: `scripts/eraser.ts`, `scripts/eraser.test.ts`
- Delete: `scripts/eraser.mjs`, `scripts/eraser.test.mjs`
- Modify: `package.json` (скрипты `validate`, `render`)

**Interfaces:**
- Produces: `DIAGRAMS_DIR`, `NODE_PROBE_ARGS`, `SpawnError`, `NodeProbeResult`, `NodeVerdict`, `listDiagrams(dir?): string[]`, `cliEntry(): Promise<string>`, `buildArgs(command, files, extra): string[]`, `rendererCommand(command, files, extra): Promise<{ cmd: string; args: string[] }>`, `nodeProbeVerdict(result: NodeProbeResult): NodeVerdict`, `spawnError(error: unknown): SpawnError`; `bun run validate`, `bun run render`.

- [ ] **Step 1: падающий тест**

Создать `scripts/eraser.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildArgs, cliEntry, listDiagrams, nodeProbeVerdict, rendererCommand, spawnError } from "./eraser.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("listDiagrams returns only *.json, sorted, with dir prefix", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eraser-"));
  tempDirs.push(dir);
  await Bun.write(join(dir, "b.json"), "{}");
  await Bun.write(join(dir, "a.json"), "{}");
  await Bun.write(join(dir, "notes.md"), "");
  expect(listDiagrams(dir)).toEqual([join(dir, "a.json"), join(dir, "b.json")]);
});

test("buildArgs: command, then files, then extra options", () => {
  expect(buildArgs("render", ["diagrams/a.json", "diagrams/b.json"], ["-f", "html"])).toEqual([
    "render",
    "diagrams/a.json",
    "diagrams/b.json",
    "-f",
    "html",
  ]);
});

test("cliEntry resolves the installed CLI entry point", async () => {
  expect(await cliEntry()).toMatch(/diagrams-cli[\\/]dist[\\/]cli\.js$/);
});

test("rendererCommand runs the CLI under node, not under the current runtime", async () => {
  const { cmd, args } = await rendererCommand("render", ["diagrams/a.json"], ["-f", "html"]);
  expect(cmd).toBe("node");
  expect(args[0]).toBe(await cliEntry());
  expect(args.slice(1)).toEqual(["render", "diagrams/a.json", "-f", "html"]);
});

test("nodeProbeVerdict: real node answers node", () => {
  expect(nodeProbeVerdict({ exitCode: 0, stdout: "node" })).toBe("ok");
});

test("nodeProbeVerdict: bun's node shim answers bun", () => {
  expect(nodeProbeVerdict({ exitCode: 0, stdout: "bun" })).toBe("bun");
});

test("nodeProbeVerdict: no node on PATH is missing", () => {
  const missing = spawnError(Object.assign(new Error('Executable not found in $PATH: "node"'), { code: "ENOENT" }));
  expect(nodeProbeVerdict({ error: missing })).toBe("missing");
});

test("nodeProbeVerdict: other spawn errors and non-zero exits are failed", () => {
  const denied = spawnError(Object.assign(new Error("EACCES"), { code: "EACCES" }));
  expect(nodeProbeVerdict({ error: denied })).toBe("failed");
  expect(nodeProbeVerdict({ exitCode: 1, stdout: "" })).toBe("failed");
});
```

Run: `bun test scripts/eraser.test.ts`
Expected: FAIL, `Cannot find module` с упоминанием `./eraser.ts`.

- [ ] **Step 2: реализация**

Создать `scripts/eraser.ts`:

```ts
// Обёртка над eraser-diagrams CLI. Подставляет diagrams/*.json вместо glob,
// потому что cmd.exe на Windows glob не раскрывает, а CLI сам этого не делает.
// CLI запускается под node: под bun запуск Chrome зависает
// (docs/superpowers/specs/2026-09-13-diagram-colors-and-bun-design.md §2.1).
// Использование: bun scripts/eraser.ts <command> [cli options...]
import { dirname, join } from "node:path";

export const DIAGRAMS_DIR = "diagrams";

export const NODE_PROBE_ARGS = ["-e", "process.stdout.write(process.versions.bun ? 'bun' : 'node')"];

export type SpawnError = { code: string | undefined; message: string };
export type NodeProbeResult = { error: SpawnError } | { exitCode: number | null; stdout: string };
export type NodeVerdict = "ok" | "missing" | "bun" | "failed";

export function listDiagrams(dir = DIAGRAMS_DIR): string[] {
  return [...new Bun.Glob("*.json").scanSync(dir)].sort().map((name) => join(dir, name));
}

export async function cliEntry(): Promise<string> {
  const pkgPath = Bun.resolveSync("@eraserlabs/diagrams-cli/package.json", import.meta.dir);
  const pkg = (await Bun.file(pkgPath).json()) as { bin: Record<string, string> };
  const bin = pkg.bin["eraser-diagrams"];
  if (!bin) throw new Error(`no eraser-diagrams bin in ${pkgPath}`);
  return join(dirname(pkgPath), bin);
}

export function buildArgs(command: string, files: readonly string[], extra: readonly string[]): string[] {
  return [command, ...files, ...extra];
}

export async function rendererCommand(
  command: string,
  files: readonly string[],
  extra: readonly string[],
): Promise<{ cmd: string; args: string[] }> {
  return { cmd: "node", args: [await cliEntry(), ...buildArgs(command, files, extra)] };
}

// "bun" значит, что `node` в PATH это shim от bun (bun run подкладывает его, когда Node нет).
export function nodeProbeVerdict(result: NodeProbeResult): NodeVerdict {
  if ("error" in result) return result.error.code === "ENOENT" ? "missing" : "failed";
  if (result.exitCode !== 0) return "failed";
  return result.stdout === "node" ? "ok" : "bun";
}

export function spawnError(error: unknown): SpawnError {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  return { code, message: error instanceof Error ? error.message : String(error) };
}

function probeNode(): NodeProbeResult {
  try {
    const result = Bun.spawnSync(["node", ...NODE_PROBE_ARGS]);
    return { exitCode: result.exitCode, stdout: result.stdout.toString() };
  } catch (error) {
    return { error: spawnError(error) };
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...extra] = argv;
  if (!command) {
    console.error("usage: bun scripts/eraser.ts <command> [cli options...]");
    return 2;
  }
  const files = listDiagrams();
  if (files.length === 0) {
    console.error(`no *.json files in ${DIAGRAMS_DIR}/`);
    return 2;
  }
  const probe = probeNode();
  const verdict = nodeProbeVerdict(probe);
  if (verdict === "missing" || verdict === "bun") {
    const reason = verdict === "missing" ? "node not found on PATH" : "node on PATH is bun's shim, not Node";
    console.error(`${reason}: the eraser-diagrams renderer needs Node >= 22.12`);
    return 2;
  }
  if (verdict === "failed") {
    console.error("error" in probe ? probe.error.message : `node probe exited with status ${probe.exitCode}`);
    return 1;
  }
  const { cmd, args } = await rendererCommand(command, files, extra);
  try {
    const result = Bun.spawnSync([cmd, ...args], { stdio: ["inherit", "inherit", "inherit"] });
    return result.exitCode ?? 1;
  } catch (error) {
    const { code, message } = spawnError(error);
    if (code === "ENOENT") {
      console.error("node not found on PATH: the eraser-diagrams renderer needs Node >= 22.12");
      return 2;
    }
    console.error(message);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
```

Удалить: `git rm -q scripts/eraser.mjs scripts/eraser.test.mjs`.

В `package.json` строки

```json
    "validate": "bun scripts/eraser.mjs validate",
```

и

```json
    "render": "bun scripts/eraser.mjs render -f html && bun scripts/eraser.mjs render -f png",
```

заменить на

```json
    "validate": "bun scripts/eraser.ts validate",
```

и

```json
    "render": "bun scripts/eraser.ts render -f html && bun scripts/eraser.ts render -f png",
```

- [ ] **Step 3: проверка**

Run (Bash):

```bash
bun run typecheck; echo "typecheck-exit=$?"
bun test scripts/eraser.test.ts
bun run test
bun scripts/eraser.ts; echo "usage-exit=$?"
bun run validate
bun run render
```

Expected: `typecheck-exit=0`; `8 pass`; полный прогон `52 pass`; `usage: bun scripts/eraser.ts <command> [cli options...]` и `usage-exit=2`; `validate` печатает `ok` для 4 схем; `render` пишет 4 HTML и 4 PNG без зависания.

- [ ] **Step 4: коммит**

```bash
git add package.json scripts/eraser.ts scripts/eraser.test.ts
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Port the eraser CLI wrapper to TypeScript and Bun.spawnSync

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 6: `build-site.ts`

**Files:**
- Create: `scripts/build-site.ts`, `scripts/build-site.test.ts`
- Delete: `scripts/build-site.mjs`, `scripts/build-site.test.mjs`
- Modify: `package.json` (скрипт `site`)

**Interfaces:**
- Consumes: `diagramNames`, `renderIndex` из `scripts/build-index.ts`.
- Produces: `Branch`, `SluggedBranch`, `BuildResult`, `PreviewEntry`, `branchSlug`, `assignSlugs`, `parseBranches`, `fetchArgs`, `escapeHtml`, `renderPreviewsIndex`, `renderSummary`; `bun run site [--main-built]`.

- [ ] **Step 1: падающий тест**

Создать `scripts/build-site.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  assignSlugs,
  branchSlug,
  escapeHtml,
  fetchArgs,
  parseBranches,
  renderPreviewsIndex,
  renderSummary,
} from "./build-site.ts";

test("branchSlug replaces unsafe characters with single dashes and trims them", () => {
  expect(branchSlug("feature/bun-and-colors")).toBe("feature-bun-and-colors");
  expect(branchSlug("fix//a b")).toBe("fix-a-b");
  expect(branchSlug("a--b")).toBe("a-b");
  expect(branchSlug("-a-")).toBe("a");
  expect(branchSlug("v1.2_rc")).toBe("v1.2_rc");
});

test("branchSlug falls back to branch when nothing safe is left", () => {
  expect(branchSlug("схемы/новые")).toBe("branch");
});

test("branchSlug turns a slug made only of dots into branch", () => {
  expect(branchSlug("ы.ы")).toBe("branch");
});

test("fetchArgs adds --depth=1 only for a shallow clone and always prunes", () => {
  expect(fetchArgs(true)).toEqual(["fetch", "--depth=1", "--no-tags", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
  expect(fetchArgs(false)).toEqual(["fetch", "--no-tags", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
});

test("assignSlugs sorts by name and suffixes a colliding slug with the short sha", () => {
  const result = assignSlugs([
    { name: "a/b", sha: "1111111aaaa" },
    { name: "a-b", sha: "2222222bbbb" },
  ]);
  expect(result).toEqual([
    { name: "a-b", sha: "2222222bbbb", slug: "a-b" },
    { name: "a/b", sha: "1111111aaaa", slug: "a-b-1111111" },
  ]);
});

test("assignSlugs never gives a branch the slug of the previews index file", () => {
  const [entry] = assignSlugs([{ name: "index.html", sha: "3333333cccc" }]);
  expect(entry?.slug).toBe("index.html-3333333");
});

test("parseBranches skips HEAD and main and keeps names with slashes", () => {
  const output = "HEAD 0000000\nfeature/x 1111111\nmain 2222222\r\nfix 3333333\n";
  expect(parseBranches(output)).toEqual([
    { name: "feature/x", sha: "1111111" },
    { name: "fix", sha: "3333333" },
  ]);
});

test("escapeHtml escapes the five HTML-significant characters", () => {
  expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
});

test("renderPreviewsIndex links built branches and marks failed ones with the step", () => {
  const html = renderPreviewsIndex([
    { name: "feature/x", slug: "feature-x", sha: "abcdef0123", status: "ok" },
    { name: "a<b>", slug: "a-b", sha: "1234567890", status: "failed", failedStep: "bun install" },
  ]);
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toMatch(/<a href="feature-x\/">feature\/x<\/a> <code>abcdef0<\/code>/);
  expect(html).toMatch(/a&lt;b&gt; \(не собралась: bun install\)/);
  expect(html).toMatch(/href="\.\.\/"/);
  expect(html).not.toMatch(/<script|<link/);
});

test("renderPreviewsIndex says there are no other branches for an empty list", () => {
  expect(renderPreviewsIndex([])).toMatch(/Других веток нет\./);
});

test("renderSummary lists every branch with its preview path or failed step", () => {
  const summary = renderSummary([
    { name: "feature/x", slug: "feature-x", sha: "abc", status: "ok" },
    { name: "old", slug: "old", sha: "def", status: "failed", failedStep: "bun install" },
  ]);
  expect(summary).toMatch(/- `feature\/x`: branches\/feature-x\//);
  expect(summary).toMatch(/- `old`: не собралась на шаге bun install/);
});
```

Run: `bun test scripts/build-site.test.ts`
Expected: FAIL, `Cannot find module` с упоминанием `./build-site.ts`.

- [ ] **Step 2: реализация**

Создать `scripts/build-site.ts`:

```ts
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
```

Удалить: `git rm -q scripts/build-site.mjs scripts/build-site.test.mjs`.

В `package.json` строку `"site": "bun scripts/build-site.mjs",` заменить на `"site": "bun scripts/build-site.ts",`.

- [ ] **Step 3: проверка тестов и типов**

Run (Bash):

```bash
bun run typecheck; echo "typecheck-exit=$?"
bun test scripts/build-site.test.ts
bun run test
git ls-files 'scripts/*.mjs' | wc -l
rm -rf dist && bun run site --main-built; echo "exit=$?"
```

Expected: `typecheck-exit=0`; `11 pass`; полный прогон `52 pass`; `0` файлов `.mjs`; `site: --main-built given but dist/index.html is missing` и `exit=1` без git fetch.

- [ ] **Step 4: сквозной прогон против временного origin**

Прогон в копии вне рабочей копии, настоящий `origin` не трогается. Коммиты `e21c159` (эпоха npm) и `6be51ba` (нет `package.json`) есть в истории.

Run (Bash, из корня рабочей копии):

```bash
SCRATCH="$(mktemp -d)"
REPO="$(pwd)"
git clone -q --bare "$REPO" "$SCRATCH/origin.git"
git -C "$SCRATCH/origin.git" branch preview/npm-era e21c159
git -C "$SCRATCH/origin.git" branch 'preview/no-scripts&x' 6be51ba
git clone -q "$SCRATCH/origin.git" "$SCRATCH/clone"
git -C "$SCRATCH/clone" checkout -q "$(git branch --show-current)"
# Шаги 1–2 ещё не закоммичены: переносим рабочие файлы в клон.
rm -f "$SCRATCH/clone/scripts/build-site.mjs" "$SCRATCH/clone/scripts/build-site.test.mjs"
cp "$REPO/scripts/build-site.ts" "$REPO/scripts/build-site.test.ts" "$SCRATCH/clone/scripts/"
cp "$REPO/package.json" "$SCRATCH/clone/package.json"
cd "$SCRATCH/clone"
bun install --frozen-lockfile
BEFORE=$(git rev-list --count HEAD)
GITHUB_STEP_SUMMARY="$SCRATCH/summary.md" bun run site > "$SCRATCH/site.log" 2>&1; echo "site-exit=$?"
grep '^site:' "$SCRATCH/site.log"
cat "$SCRATCH/summary.md"
ls dist/branches
grep -c 'href="branches/"' dist/index.html
grep -E '<li>' dist/branches/index.html
echo "shallow=$(git rev-parse --is-shallow-repository) before=$BEFORE after=$(git rev-list --count HEAD)"
git worktree list | wc -l
grep -rl 'file://' dist --include='*.html' | wc -l
cd "$REPO"
```

Expected (прогон около 40 секунд):
- `site-exit=0`;
- строки `site: building ...` для каждой ветки bare-клона кроме `main`, затем `site: N/M branch previews built`;
- в `summary.md` текущая ветка и `preview/npm-era` с путями `branches/<slug>/`, `preview/no-scripts&x` с `не собралась на шаге bun run build`;
- `ls dist/branches` содержит `index.html`, slug текущей ветки и `preview-npm-era`;
- счётчик ссылки `branches/` равен `1`; имя `preview/no-scripts&amp;x` экранировано;
- `shallow=false`, `before` равен `after`;
- `git worktree list` одна строка;
- файлов с `file://` `0`.

Если сборка ветки упала с `E_UNKNOWN_ICON` на существующей иконке, это сбой сети: повторить `bun run site` один раз и записать оба вывода.

- [ ] **Step 5: путь таймаута**

В том же временном клоне (не в рабочей копии) временно поставить лимит шага 50 мс и убедиться, что таймаут распознаётся:

```bash
cd "$SCRATCH/clone"
sed -i 's/const BRANCH_STEP_TIMEOUT_MS = 5 \* 60 \* 1000;/const BRANCH_STEP_TIMEOUT_MS = 50;/' scripts/build-site.ts
grep -n 'BRANCH_STEP_TIMEOUT_MS =' scripts/build-site.ts
bun run site --main-built 2>&1 | grep -E '^site:|timed out'
grep -E '<li>' dist/branches/index.html
git worktree list | wc -l
cd "$REPO"
```

Expected: строки `bun install --frozen-lockfile: timed out`; в списке ветки с `package.json` помечены `не собралась: bun install (timeout)`; выход сборки 0; `git worktree list` одна строка. Закоммиченный скрипт в рабочей копии не меняется.

- [ ] **Step 6: коммит**

```bash
git add package.json scripts/build-site.ts scripts/build-site.test.ts
git status --short
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Port build-site to TypeScript and Bun.spawnSync

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

Expected: `git status --short` перед коммитом показывает только `M package.json`, `A scripts/build-site.ts`, `A scripts/build-site.test.ts`, `D scripts/build-site.mjs`, `D scripts/build-site.test.mjs`.

---

### Task 7: CI и документация

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`
- Modify: `.claude/skills/eraser-diagrams/SKILL.md`, `README.md`

**Interfaces:**
- Consumes: `bun run typecheck` (Task 1).

- [ ] **Step 1: workflows**

В `.github/workflows/ci.yml` после строки

```yaml
      - run: bun install --frozen-lockfile
```

вставить строку

```yaml
      - run: bun run typecheck
```

В `.github/workflows/pages.yml` сделать то же самое после строки `      - run: bun install --frozen-lockfile` (она встречается в файле один раз, в job `build`).

- [ ] **Step 2: скилл**

В `.claude/skills/eraser-diagrams/SKILL.md`:

1. Все вхождения `scripts/colors.mjs` заменить на `scripts/colors.ts` (их два).
2. Строку

   ```
   7. Перед коммитом: `bun run test` и `bun run build` (то же, что делает CI).
   ```

   заменить на

   ```
   7. Перед коммитом: `bun run typecheck`, `bun run test` и `bun run build` (то же, что делает CI).
   ```

- [ ] **Step 3: README**

В `README.md` в блоке команд после строки `bun run test` добавить строку:

```
bun run typecheck  # строгая проверка типов скриптов
```

- [ ] **Step 4: проверка**

Run (Bash):

```bash
grep -n 'bun run typecheck' .github/workflows/ci.yml .github/workflows/pages.yml README.md .claude/skills/eraser-diagrams/SKILL.md
grep -rn '\.mjs' package.json .github README.md .claude/skills; echo "mjs-grep-exit=$?"
git ls-files 'scripts/*.mjs' | wc -l
grep -c $'\t' .github/workflows/ci.yml .github/workflows/pages.yml
git diff --check
```

Expected: `bun run typecheck` найден в обоих workflow (по одной строке, сразу после `bun install --frozen-lockfile`), в README и в SKILL.md; `mjs-grep-exit=1`; `0` файлов `.mjs`; табов `0`; `git diff --check` пуст.

- [ ] **Step 5: коммит**

```bash
git add .github/workflows/ci.yml .github/workflows/pages.yml .claude/skills/eraser-diagrams/SKILL.md README.md
MSG="$(mktemp)"
cat > "$MSG" <<'EOF'
Typecheck in CI; docs point to the TypeScript scripts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git commit -F "$MSG"
```

---

### Task 8: Приёмка

Шаги 2–3 пушат ветку и создают PR на GitHub. Это внешние действия: выполнять только после явного подтверждения пользователя.

**Files:** нет изменений.

- [ ] **Step 1: локальная приёмка**

Run (Bash):

```bash
rm -rf dist
bun install --frozen-lockfile
bun run typecheck && bun run test && bun run build
ls dist | wc -l
git ls-files 'scripts/*.mjs' | wc -l
git status --short
```

Expected: проверка типов без ошибок; `52 pass`; сборка с `colors ok: 4 diagrams` и `dist/index.html: 4 diagrams`; `9` файлов в `dist`; `0` файлов `.mjs`; `git status --short` пуст.

- [ ] **Step 2: (после подтверждения пользователя) push и PR**

```bash
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push https://github.com/YarikMix/diagrams.git HEAD:refs/heads/feature/typescript
BODY="$(mktemp)"
cat > "$BODY" <<'EOF'
Скрипты на TypeScript и API bun по `docs/superpowers/specs/2026-09-14-typescript-design.md`.

- `scripts/*.mjs` и тесты переведены на `.ts`, `Bun.*` и `bun:test`, поведение и сообщения прежние
- типы документа диаграммы в `scripts/diagram.ts`
- `tsconfig.json` со `strict` и `noUncheckedIndexedAccess`, `bun run typecheck` в CI
- `typescript` 7.0.2 и `@types/bun` 1.4.2 в dev-зависимостях

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --repo YarikMix/diagrams --base main --head feature/typescript --title "Port scripts to TypeScript on bun APIs" --body-file "$BODY"
```

- [ ] **Step 3: (после подтверждения пользователя) CI зелёный**

Run: `gh run list --repo YarikMix/diagrams --branch feature/typescript --limit 3`, затем `gh run watch <id> --repo YarikMix/diagrams --exit-status` для запуска `CI` по `pull_request`.
Expected: job `build` зелёный; в логе шаг `bun run typecheck` успешен, `bun run test` `52 pass`, `bun run build` `colors ok: 4 diagrams`.
