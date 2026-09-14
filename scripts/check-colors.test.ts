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
