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
