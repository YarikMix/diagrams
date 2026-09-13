// Обновляет icons.txt: имена иконок публичного каталога Eraser
// (https://storage.googleapis.com/eraser-public-assets/canvas-icons/<name>.svg).
// Использование: bun scripts/fetch-icons.mjs
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIST_URL =
  "https://storage.googleapis.com/storage/v1/b/eraser-public-assets/o" +
  "?prefix=canvas-icons/&maxResults=1000&fields=items(name),nextPageToken";
const PREFIX = "canvas-icons/";
const SUFFIX = ".svg";

export function namesFromPage(page) {
  return (page.items ?? [])
    .map((item) => item.name)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => name.slice(PREFIX.length, -SUFFIX.length));
}

export async function fetchAllIcons(fetchImpl = fetch) {
  const names = new Set();
  let pageToken;
  do {
    const url = pageToken ? `${LIST_URL}&pageToken=${encodeURIComponent(pageToken)}` : LIST_URL;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`GCS ${res.status} for ${url}`);
    const page = await res.json();
    for (const name of namesFromPage(page)) names.add(name);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...names].sort();
}

export function formatIconsFile(names) {
  return names.join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = await fetchAllIcons();
  writeFileSync("icons.txt", formatIconsFile(names));
  console.error(`icons.txt: ${names.length} names`);
}
