/**
 * Kategori taksonomisinin (yönetici tarafından nadiren değişen ~300 satır) cihaz önbelleği (docs/history/325-*).
 *
 * Neden: `TaxonomyHydrator` her tam sayfa yüklemesinde iki sorgu atıyordu (`taxonomy_categories` + `taxonomy_subcategories`, ikincisi
 * pg_stat_user_tables'ta 1 737 tarama / 537 bin okunan satır). Önbellek tazeyken sorgu atılmaz; bayatsa önbellek yine anında kullanılır
 * ve arka planda yenilenir (stale-while-revalidate). Önbellek YALNIZ hızlandırıcıdır: yok / bozuk / okunamıyorsa eski davranış (ağdan al).
 * Taksonomi herkese aynıdır ve kullanıcıya özel veri taşımaz; kimlik değişince sayfa zaten baştan yüklenir.
 */
import type { TaxonomyDbCategory, TaxonomyDbSubcategory } from "@/lib/content-taxonomy";

export const TAXONOMY_CACHE_KEY = "promptly-taxonomy-v1";
/** Bu süreden yeniyse ağa hiç gidilmez; eskiyse önbellek gösterilir ama arka planda yenilenir. */
export const TAXONOMY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Bundan eskisi hiç kullanılmaz (uzun süre açılmamış cihazda yanlış etiket göstermesin). */
export const TAXONOMY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface TaxonomySnapshot {
  categories: TaxonomyDbCategory[];
  subcategories: TaxonomyDbSubcategory[];
}

interface Stored extends TaxonomySnapshot {
  savedAt: number;
}

export interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): CacheStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isCategory(row: unknown): row is TaxonomyDbCategory {
  const r = row as Partial<TaxonomyDbCategory> | null;
  return Boolean(r) && typeof r!.dbId === "string" && typeof r!.contentType === "string" && typeof r!.slug === "string" && typeof r!.nameEn === "string" && typeof r!.nameTr === "string" && typeof r!.sortOrder === "number";
}

function isSubcategory(row: unknown): row is TaxonomyDbSubcategory {
  const r = row as Partial<TaxonomyDbSubcategory> | null;
  return Boolean(r) && typeof r!.categoryDbId === "string" && typeof r!.slug === "string" && typeof r!.nameEn === "string" && typeof r!.nameTr === "string" && typeof r!.sortOrder === "number";
}

/** Önbelleği okur; yok, bozuk, şekli yanlış ya da `MAX_AGE`'den eskiyse `null`. `fresh`: ağa gitmeye gerek yok. */
export function readTaxonomyCache(now: number = Date.now(), storage: CacheStorage | null = defaultStorage()): { data: TaxonomySnapshot; fresh: boolean } | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(TAXONOMY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed || typeof parsed.savedAt !== "number" || !Array.isArray(parsed.categories) || !Array.isArray(parsed.subcategories)) return null;
    const age = now - parsed.savedAt;
    if (age < 0 || age > TAXONOMY_CACHE_MAX_AGE_MS) return null;
    if (parsed.categories.length === 0 || !parsed.categories.every(isCategory) || !parsed.subcategories.every(isSubcategory)) return null;
    return { data: { categories: parsed.categories, subcategories: parsed.subcategories }, fresh: age < TAXONOMY_CACHE_TTL_MS };
  } catch {
    return null;
  }
}

/** Taze veriyi önbelleğe yazar; depolama dolu / kapalıysa sessizce vazgeçer. */
export function writeTaxonomyCache(data: TaxonomySnapshot, now: number = Date.now(), storage: CacheStorage | null = defaultStorage()): void {
  if (!storage || data.categories.length === 0) return;
  try {
    const stored: Stored = { savedAt: now, categories: data.categories, subcategories: data.subcategories };
    storage.setItem(TAXONOMY_CACHE_KEY, JSON.stringify(stored));
  } catch {
    // Kota dolu ya da gizli mod: önbelleksiz devam.
  }
}
