import test from "node:test";
import assert from "node:assert/strict";
import {
  readTaxonomyCache,
  TAXONOMY_CACHE_KEY,
  TAXONOMY_CACHE_MAX_AGE_MS,
  TAXONOMY_CACHE_TTL_MS,
  writeTaxonomyCache,
  type CacheStorage,
  type TaxonomySnapshot,
} from "./taxonomy-cache.ts";

function memory(): CacheStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const snapshot: TaxonomySnapshot = {
  categories: [{ dbId: "c1", contentType: "image", slug: "photography", nameEn: "Photography", nameTr: "Fotoğraf", icon: null, descriptionEn: null, descriptionTr: null, sortOrder: 1, isActive: true }],
  subcategories: [{ categoryDbId: "c1", slug: "portrait", nameEn: "Portrait", nameTr: "Portre", descriptionEn: null, descriptionTr: null, sortOrder: 1, isActive: true }],
};

test("a fresh write is read back and marked fresh", () => {
  const s = memory();
  writeTaxonomyCache(snapshot, 1_000, s);
  const hit = readTaxonomyCache(1_000 + 60_000, s);
  assert.ok(hit);
  assert.equal(hit.fresh, true);
  assert.deepEqual(hit.data, snapshot);
});

test("past the TTL the cache is still used but not fresh (revalidate in background)", () => {
  const s = memory();
  writeTaxonomyCache(snapshot, 0, s);
  const hit = readTaxonomyCache(TAXONOMY_CACHE_TTL_MS + 1, s);
  assert.ok(hit);
  assert.equal(hit.fresh, false);
});

test("past the max age, in the future, missing or corrupt means no cache", () => {
  const s = memory();
  assert.equal(readTaxonomyCache(0, s), null);
  writeTaxonomyCache(snapshot, 1_000, s);
  assert.equal(readTaxonomyCache(1_000 + TAXONOMY_CACHE_MAX_AGE_MS + 1, s), null);
  assert.equal(readTaxonomyCache(500, s), null);
  s.data.set(TAXONOMY_CACHE_KEY, "{not json");
  assert.equal(readTaxonomyCache(2_000, s), null);
  s.data.set(TAXONOMY_CACHE_KEY, JSON.stringify({ savedAt: 1_000, categories: [{ slug: "x" }], subcategories: [] }));
  assert.equal(readTaxonomyCache(2_000, s), null);
  s.data.set(TAXONOMY_CACHE_KEY, JSON.stringify({ savedAt: 1_000, categories: [], subcategories: [] }));
  assert.equal(readTaxonomyCache(2_000, s), null);
});

test("storage failures never throw", () => {
  const broken: CacheStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.equal(readTaxonomyCache(0, broken), null);
  assert.doesNotThrow(() => writeTaxonomyCache(snapshot, 0, broken));
  assert.equal(readTaxonomyCache(0, null), null);
  assert.doesNotThrow(() => writeTaxonomyCache(snapshot, 0, null));
});

test("an empty category list is never cached", () => {
  const s = memory();
  writeTaxonomyCache({ categories: [], subcategories: [] }, 0, s);
  assert.equal(s.data.size, 0);
});
