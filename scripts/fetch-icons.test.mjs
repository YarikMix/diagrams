import test from "node:test";
import assert from "node:assert/strict";
import { namesFromPage, fetchAllIcons, formatIconsFile, LIST_URL } from "./fetch-icons.mjs";

test("namesFromPage strips prefix and .svg, drops the folder entry and non-svg", () => {
  const page = {
    items: [
      { name: "canvas-icons/" },
      { name: "canvas-icons/go.svg" },
      { name: "canvas-icons/readme.txt" },
      { name: "canvas-icons/postgres.svg" },
    ],
  };
  assert.deepEqual(namesFromPage(page), ["go", "postgres"]);
});

test("fetchAllIcons follows nextPageToken, dedupes and sorts", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    const page = url.includes("pageToken=tok1")
      ? { items: [{ name: "canvas-icons/aws.svg" }, { name: "canvas-icons/go.svg" }] }
      : { items: [{ name: "canvas-icons/go.svg" }, { name: "canvas-icons/zulu.svg" }], nextPageToken: "tok1" };
    return { ok: true, status: 200, json: async () => page };
  };
  const names = await fetchAllIcons(fakeFetch);
  assert.deepEqual(names, ["aws", "go", "zulu"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], LIST_URL);
  assert.ok(calls[1].endsWith("&pageToken=tok1"));
});

test("fetchAllIcons throws on non-2xx", async () => {
  const fakeFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => fetchAllIcons(fakeFetch), /GCS 503/);
});

test("formatIconsFile: one name per line, trailing newline", () => {
  assert.equal(formatIconsFile(["a", "b"]), "a\nb\n");
});
