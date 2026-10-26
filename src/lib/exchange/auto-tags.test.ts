import { test } from "node:test";
import assert from "node:assert/strict";
import { EXCHANGE_TAG_LIMIT, NO_AUTO_TAGS, mergeTagLabels, pickAutoTags } from "./auto-tags.ts";

const catalog = [
  { slug: "portre", label: "Portre" },
  { slug: "anime", label: "Anime" },
  { slug: "reklam", label: "Reklam" },
  { slug: "fantastik", label: "Fantastik" },
];
const both = { automatic: true, suggested: true };

test("nothing is picked when both options are off", () => {
  assert.deepEqual(pickAutoTags("Portre", "anime portrait", catalog, [], NO_AUTO_TAGS), []);
});

test("automatic picks the high-confidence catalog matches only", () => {
  const picks = pickAutoTags("Anime karakter", "bir anime portrait çiz", catalog, [], { automatic: true, suggested: false });
  assert.deepEqual(picks.map((p) => p.slug).sort(), ["anime", "portre"]);
  assert.ok(picks.every((p) => p.kind === "automatic" && !p.isNew));
});

test("suggested adds low-confidence catalog hits and candidate-dictionary hits (flagged isNew), never the automatic ones", () => {
  const onlySuggested = pickAutoTags("Reklamı", "reklamı güzelleştir", catalog, [], { automatic: false, suggested: true });
  assert.ok(onlySuggested.some((p) => p.slug === "reklam" && p.kind === "suggested" && !p.isNew));
  assert.ok(!onlySuggested.some((p) => p.kind === "automatic"));
  const withCandidates = pickAutoTags("Başlık", "write a short story about photography and travel", catalog, [], { automatic: false, suggested: true });
  const candidates = withCandidates.filter((p) => p.isNew);
  assert.ok(candidates.length > 0, "dictionary candidates found");
  assert.ok(candidates.every((p) => p.kind === "suggested" && !catalog.some((c) => c.slug === p.slug)));
});

test("tags the prompt already has are never repeated (label or slug form, any case/accent)", () => {
  const picks = pickAutoTags("Anime", "anime portrait", catalog, ["ANIME", "portre"], both);
  assert.ok(!picks.some((p) => p.slug === "anime" || p.slug === "portre"));
});

test("the 20-tag ceiling counts the tags already on the prompt", () => {
  const existing = Array.from({ length: EXCHANGE_TAG_LIMIT - 1 }, (_, i) => `etiket-${i}`);
  const picks = pickAutoTags("Anime", "anime portrait fantastik", catalog, existing, both);
  assert.equal(picks.length, 1);
  assert.deepEqual(pickAutoTags("Anime", "anime portrait", catalog, [...existing, "bir-daha"], both), []);
});

test("an empty catalog still yields dictionary candidates when 'suggested' is on, nothing when only 'automatic'", () => {
  assert.deepEqual(pickAutoTags("x", "photography", [], [], { automatic: true, suggested: false }), []);
  assert.ok(pickAutoTags("x", "photography", [], [], { automatic: false, suggested: true }).every((p) => p.isNew));
});

test("mergeTagLabels keeps the file's own tags first and appends the picks", () => {
  const picks = pickAutoTags("Anime", "anime", catalog, ["özel"], both);
  assert.deepEqual(mergeTagLabels(["özel"], picks).slice(0, 2), ["özel", "Anime"]);
});

test("pickAutoTagsBatch returns one result per subject in order, reports progress and can be stopped", async () => {
  const { pickAutoTagsBatch } = await import("./auto-tags.ts");
  const subjects = Array.from({ length: 45 }, (_, i) => ({ title: i % 2 ? "Anime" : "Portre", text: "x", existing: [] as string[] }));
  const seen: number[] = [];
  const all = await pickAutoTagsBatch(subjects, catalog, both, { yieldEvery: 10, onProgress: (done) => seen.push(done) });
  assert.equal(all?.length, 45);
  assert.deepEqual(all?.[0].map((p) => p.slug), ["portre"]);
  assert.deepEqual(all?.[1].map((p) => p.slug), ["anime"]);
  assert.deepEqual(seen, [10, 20, 30, 40, 45]);
  let calls = 0;
  const stopped = await pickAutoTagsBatch(subjects, catalog, both, { yieldEvery: 10, shouldStop: () => ++calls > 12 });
  assert.equal(stopped, null);
});
