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
