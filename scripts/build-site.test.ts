import { expect, test } from "bun:test";
import {
  assignSlugs,
  branchSlug,
  escapeHtml,
  fetchArgs,
  parseBranches,
  renderPreviewsIndex,
  renderSummary,
} from "./build-site.ts";

test("branchSlug replaces unsafe characters with single dashes and trims them", () => {
  expect(branchSlug("feature/bun-and-colors")).toBe("feature-bun-and-colors");
  expect(branchSlug("fix//a b")).toBe("fix-a-b");
  expect(branchSlug("a--b")).toBe("a-b");
  expect(branchSlug("-a-")).toBe("a");
  expect(branchSlug("v1.2_rc")).toBe("v1.2_rc");
});

test("branchSlug falls back to branch when nothing safe is left", () => {
  expect(branchSlug("схемы/новые")).toBe("branch");
});

test("branchSlug turns a slug made only of dots into branch", () => {
  expect(branchSlug("ы.ы")).toBe("branch");
});

test("fetchArgs adds --depth=1 only for a shallow clone and always prunes", () => {
  expect(fetchArgs(true)).toEqual(["fetch", "--depth=1", "--no-tags", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
  expect(fetchArgs(false)).toEqual(["fetch", "--no-tags", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
});

test("assignSlugs sorts by name and suffixes a colliding slug with the short sha", () => {
  const result = assignSlugs([
    { name: "a/b", sha: "1111111aaaa" },
    { name: "a-b", sha: "2222222bbbb" },
  ]);
  expect(result).toEqual([
    { name: "a-b", sha: "2222222bbbb", slug: "a-b" },
    { name: "a/b", sha: "1111111aaaa", slug: "a-b-1111111" },
  ]);
});

test("assignSlugs never gives a branch the slug of the previews index file", () => {
  const [entry] = assignSlugs([{ name: "index.html", sha: "3333333cccc" }]);
  expect(entry?.slug).toBe("index.html-3333333");
});

test("parseBranches skips HEAD and main and keeps names with slashes", () => {
  const output = "HEAD 0000000\nfeature/x 1111111\nmain 2222222\r\nfix 3333333\n";
  expect(parseBranches(output)).toEqual([
    { name: "feature/x", sha: "1111111" },
    { name: "fix", sha: "3333333" },
  ]);
});

test("escapeHtml escapes the five HTML-significant characters", () => {
  expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
});

test("renderPreviewsIndex links built branches and marks failed ones with the step", () => {
  const html = renderPreviewsIndex([
    { name: "feature/x", slug: "feature-x", sha: "abcdef0123", status: "ok" },
    { name: "a<b>", slug: "a-b", sha: "1234567890", status: "failed", failedStep: "bun install" },
  ]);
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toMatch(/<a href="feature-x\/">feature\/x<\/a> <code>abcdef0<\/code>/);
  expect(html).toMatch(/a&lt;b&gt; \(не собралась: bun install\)/);
  expect(html).toMatch(/href="\.\.\/"/);
  expect(html).not.toMatch(/<script|<link/);
});

test("renderPreviewsIndex says there are no other branches for an empty list", () => {
  expect(renderPreviewsIndex([])).toMatch(/Других веток нет\./);
});

test("renderSummary lists every branch with its preview path or failed step", () => {
  const summary = renderSummary([
    { name: "feature/x", slug: "feature-x", sha: "abc", status: "ok" },
    { name: "old", slug: "old", sha: "def", status: "failed", failedStep: "bun install" },
  ]);
  expect(summary).toMatch(/- `feature\/x`: branches\/feature-x\//);
  expect(summary).toMatch(/- `old`: не собралась на шаге bun install/);
});
