import { test } from "node:test";
import assert from "node:assert/strict";
import { SHARE_SOURCES, buildCatalogUrl, mapCatalogRows } from "./share-catalog.ts";

const source = (kind: string) => {
  const found = SHARE_SOURCES.find((s) => s.kind === kind);
  assert.ok(found, kind);
  return found;
};

test("every content source filters out private, draft and deleted rows explicitly", () => {
  const prompt = buildCatalogUrl("https://x.supabase.co", source("prompt"), 0);
  for (const needle of ["status=eq.published", "visibility=eq.public", "deleted_at=is.null"]) assert.ok(prompt.includes(needle), `prompt ${needle}`);

  const request = buildCatalogUrl("https://x.supabase.co", source("request"), 0);
  for (const needle of ["is_draft=eq.false", "visibility=eq.public", "deleted_at=is.null"]) assert.ok(request.includes(needle), `request ${needle}`);

  for (const kind of ["workflow", "preset"]) {
    const url = buildCatalogUrl("https://x.supabase.co", source(kind), 0);
    for (const needle of ["status=eq.published", "visibility=eq.public"]) assert.ok(url.includes(needle), `${kind} ${needle}`);
  }
});

test("community-only content never gets a public share page (community_id is null is explicit, not left to visibility alone)", () => {
  for (const kind of ["prompt", "request", "workflow", "preset"]) {
    assert.ok(buildCatalogUrl("https://x.supabase.co", source(kind), 0).includes("community_id=is.null"), `${kind} excludes community content`);
  }
});

test("urls are paged deterministically and never leak extra columns", () => {
  const url = buildCatalogUrl("https://x.supabase.co/", source("prompt"), 2000, 1000);
  assert.ok(url.startsWith("https://x.supabase.co/rest/v1/prompts?"));
  assert.ok(url.includes("select=id,title,description&"));
  assert.ok(url.includes("order=id.asc"));
  assert.ok(url.includes("limit=1000&offset=2000"));
  assert.ok(!url.includes("prompt_text"));
});

test("profiles are keyed by username and expose only name + bio", () => {
  const url = buildCatalogUrl("https://x.supabase.co", source("profile"), 0);
  assert.ok(url.includes("select=username,display_name,bio"));
  assert.ok(!/email|role/.test(url));
});

test("rows without a key or title are dropped; text is clipped and flattened", () => {
  const entries = mapCatalogRows(source("prompt"), [
    { id: "a", title: "  Portre\n promptu ", description: "x ".repeat(200) },
    { id: "", title: "no key", description: "d" },
    { id: "b", title: "   ", description: "d" },
    { id: "c", title: "ok", description: null },
    null,
    "junk",
  ]);
  assert.deepEqual(entries.map((e) => e.key), ["a", "c"]);
  assert.equal(entries[0].title, "Portre promptu");
  assert.ok(entries[0].description.length <= 200);
  assert.equal(entries[1].description, "");
  assert.deepEqual(mapCatalogRows(source("prompt"), { not: "an array" }), []);
});
