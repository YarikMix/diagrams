import test from "node:test";
import assert from "node:assert/strict";
import {
  assignSlugs,
  branchSlug,
  escapeHtml,
  parseBranches,
  renderPreviewsIndex,
  renderSummary,
} from "./build-site.mjs";

test("branchSlug replaces unsafe characters with single dashes and trims them", () => {
  assert.equal(branchSlug("feature/bun-and-colors"), "feature-bun-and-colors");
  assert.equal(branchSlug("fix//a b"), "fix-a-b");
  assert.equal(branchSlug("a--b"), "a-b");
  assert.equal(branchSlug("-a-"), "a");
  assert.equal(branchSlug("v1.2_rc"), "v1.2_rc");
});

test("branchSlug falls back to branch when nothing safe is left", () => {
  assert.equal(branchSlug("схемы/новые"), "branch");
});

test("assignSlugs sorts by name and suffixes a colliding slug with the short sha", () => {
  const result = assignSlugs([
    { name: "a/b", sha: "1111111aaaa" },
    { name: "a-b", sha: "2222222bbbb" },
  ]);
  assert.deepEqual(result, [
    { name: "a-b", sha: "2222222bbbb", slug: "a-b" },
    { name: "a/b", sha: "1111111aaaa", slug: "a-b-1111111" },
  ]);
});

test("assignSlugs never gives a branch the slug of the previews index file", () => {
  const [entry] = assignSlugs([{ name: "index.html", sha: "3333333cccc" }]);
  assert.equal(entry.slug, "index.html-3333333");
});

test("parseBranches skips HEAD and main and keeps names with slashes", () => {
  const output = "HEAD 0000000\nfeature/x 1111111\nmain 2222222\r\nfix 3333333\n";
  assert.deepEqual(parseBranches(output), [
    { name: "feature/x", sha: "1111111" },
    { name: "fix", sha: "3333333" },
  ]);
});

test("escapeHtml escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("renderPreviewsIndex links built branches and marks failed ones with the step", () => {
  const html = renderPreviewsIndex([
    { name: "feature/x", slug: "feature-x", sha: "abcdef0123", status: "ok" },
    { name: "a<b>", slug: "a-b", sha: "1234567890", status: "failed", failedStep: "bun install" },
  ]);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<a href="feature-x\/">feature\/x<\/a> <code>abcdef0<\/code>/);
  assert.match(html, /a&lt;b&gt; \(не собралась: bun install\)/);
  assert.match(html, /href="\.\.\/"/);
  assert.doesNotMatch(html, /<script|<link/);
});

test("renderPreviewsIndex says there are no other branches for an empty list", () => {
  assert.match(renderPreviewsIndex([]), /Других веток нет\./);
});

test("renderSummary lists every branch with its preview path or failed step", () => {
  const summary = renderSummary([
    { name: "feature/x", slug: "feature-x", sha: "abc", status: "ok" },
    { name: "old", slug: "old", sha: "def", status: "failed", failedStep: "bun install" },
  ]);
  assert.match(summary, /- `feature\/x`: branches\/feature-x\//);
  assert.match(summary, /- `old`: не собралась на шаге bun install/);
});
