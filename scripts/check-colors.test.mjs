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

const entity = (doc, id) => doc.entities.find((e) => e.id === id);

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
  ["legend with containerId", "legend", (d) => { entity(d, "legend").containerId = "ours"; }],
  ["legend with styleMode", "legend", (d) => { entity(d, "legend").styleMode = "plain"; }],
  ["Telegram icon with another id", "tg", (d) => {
    entity(d, "telegram").id = "tg";
    d.connections[3].to = "tg";
    delete d.connections[3].color;
    delete d.connections[3].lineStyle;
    entity(d, "legend").entries = entity(d, "legend").entries.filter(
      (e) => e.text !== "Алерты и уведомления, точки",
    );
  }],
];

for (const [name, id, mutate] of violations) {
  test(`reports ${name} exactly once under id ${id}`, () => {
    const doc = validDoc();
    mutate(doc);
    const problems = checkDiagram(doc);
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.ok(problems[0].startsWith(`${id}:`), problems[0]);
  });
}

test("the missing-legend message includes the expected entries", () => {
  const doc = validDoc();
  doc.entities = doc.entities.filter((e) => e.tag !== "Legend");
  const problems = checkDiagram(doc);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.ok(
    problems[0].includes('entries: [{"text":"Наша инфраструктура"'),
    problems[0],
  );
});
