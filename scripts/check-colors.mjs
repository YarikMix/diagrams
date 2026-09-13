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
