// Собирает сайт Pages: main в dist/, каждую ветку origin в dist/branches/<slug>/.
// Спека: docs/superpowers/specs/2026-09-13-branch-previews-design.md §4.
// Использование: bun scripts/build-site.mjs

const MAIN_BRANCH = "main";
// Имя, которое slug ветки занимать не может: там лежит список превью.
const RESERVED_SLUGS = ["index.html"];

export function branchSlug(name) {
  const slug = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "branch";
}

export function assignSlugs(branches) {
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
export function parseBranches(output) {
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

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPreviewsIndex(entries) {
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

export function renderSummary(entries) {
  const lines = entries.map((entry) =>
    entry.status === "ok"
      ? `- \`${entry.name}\`: branches/${entry.slug}/`
      : `- \`${entry.name}\`: не собралась на шаге ${entry.failedStep}`,
  );
  return ["### Превью веток", "", ...(lines.length ? lines : ["Других веток нет."]), ""].join("\n");
}
