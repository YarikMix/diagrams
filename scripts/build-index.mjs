// Собирает dist/index.html: заголовок, ссылки на <name>.html и <name>.png,
// превью PNG. Один статичный файл, CSS встроен, зависимостей нет.
// Использование: bun scripts/build-index.mjs
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function diagramNames(dir = "diagrams") {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => name.slice(0, -".json".length));
}

export function renderIndex(names, options = {}) {
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = "dist";
  mkdirSync(outDir, { recursive: true });
  const names = diagramNames();
  writeFileSync(join(outDir, "index.html"), renderIndex(names));
  console.error(`dist/index.html: ${names.length} diagrams`);
}
