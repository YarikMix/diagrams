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
