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
