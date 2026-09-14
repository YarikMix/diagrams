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
