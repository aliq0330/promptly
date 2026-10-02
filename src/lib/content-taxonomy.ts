/**
 * Central content taxonomy — the ONE source for content types, categories
 * and subcategories across prompts, prompt requests, generators, presets,
 * search, explore and every filter. Nothing else in the app hard-codes a
 * category.
 *
 * Shape: content type -> category -> subcategory. Every level has a stable,
 * English, snake_case slug (what is stored in the database and used in
 * URLs/filters); the visible label comes from `taxonomyLabel(labelKey,
 * language)` with the same `Language` the rest of the app uses. Label keys
 * follow `taxonomy.<type>.<category>[.<subcategory>]`.
 *
 * Source of truth: the `taxonomy_categories` / `taxonomy_subcategories`
 * tables. This module is a synchronous in-memory registry (so search parsing,
 * filters and labels never wait on the network) that starts from the bundled
 * seed (`taxonomy-seed.ts`, the same data the migration inserts) and is
 * REPLACED by the live rows as soon as `hydrateTaxonomy()` is called
 * (`TaxonomyHydrator`). Inactive rows are hidden from pickers but still
 * resolve (an old item keeps its readable label).
 *
 * Only the requested level is ever materialised by the UI: pickers/filters
 * call `getCategories(type)` / `getSubcategories(...)`, so a type's
 * subcategories are never rendered until it (and its category) is chosen.
 */
import type { Language } from "@/lib/i18n/translations";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { CONTENT_TYPE_IDS, TAXONOMY_SEED, TYPE_LABELS, type ContentTypeId, type Pair } from "@/lib/taxonomy-seed";

export { CONTENT_TYPE_IDS };
export type { ContentTypeId };

function slugify(en: string): string {
  return en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface TaxonomySubcategory {
  /** Stable slug — the value stored on content. */
  id: string;
  slug: string;
  type: ContentTypeId;
  categoryId: string;
  labelKey: string;
  /** `[en, tr]` or `null`. */
  description: Pair | null;
  sortOrder: number;
  isActive: boolean;
}
export interface TaxonomyCategory {
  /** Stable slug — the value stored on content (the database row also has its own uuid). */
  id: string;
  slug: string;
  type: ContentTypeId;
  labelKey: string;
  /** Lucide icon name (kebab-case), resolved by `taxonomy-icons.ts`. */
  icon: string | null;
  description: Pair | null;
  sortOrder: number;
  isActive: boolean;
  /** Active subcategories only, in display order. */
  subcategories: TaxonomySubcategory[];
}

/** Rows as read from the database (see `lib/supabase/taxonomy.ts`). */
export interface TaxonomyDbCategory {
  dbId: string;
  contentType: ContentTypeId;
  slug: string;
  nameEn: string;
  nameTr: string;
  icon: string | null;
  descriptionEn: string | null;
  descriptionTr: string | null;
  sortOrder: number;
  isActive: boolean;
}
export interface TaxonomyDbSubcategory {
  categoryDbId: string;
  slug: string;
  nameEn: string;
  nameTr: string;
  descriptionEn: string | null;
  descriptionTr: string | null;
  sortOrder: number;
  isActive: boolean;
}

// `labelKey -> [en, tr]`, filled while the tree is built.
const LABELS = new Map<string, Pair>();

export function contentTypeLabelKey(type: ContentTypeId): string {
  return `taxonomy.${type}`;
}

/** Every category incl. inactive ones (label/sanitise lookups). */
let ALL: Record<ContentTypeId, TaxonomyCategory[]> = { image: [], text: [], audio: [], video: [] };
/** Active categories with active subcategories only — what pickers show. */
let TREE: Record<ContentTypeId, TaxonomyCategory[]> = { image: [], text: [], audio: [], video: [] };
/** Every subcategory incl. inactive, per `type:categorySlug`. */
let ALL_SUBS = new Map<string, TaxonomySubcategory[]>();
let entryIndex: TaxonomyEntry[] | null = null;

const listeners = new Set<() => void>();
let version = 0;
export function subscribeTaxonomy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** Bumps whenever the registry is replaced — components re-read via `useSyncExternalStore`. */
export function getTaxonomyVersion(): number {
  return version;
}

function install(all: Record<ContentTypeId, TaxonomyCategory[]>, subs: Map<string, TaxonomySubcategory[]>) {
  ALL = all;
  ALL_SUBS = subs;
  TREE = { image: [], text: [], audio: [], video: [] };
  for (const type of CONTENT_TYPE_IDS) {
    TREE[type] = all[type]
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ ...c, subcategories: c.subcategories.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder) }));
  }
  entryIndex = null;
}

function buildFromSeed(): { all: Record<ContentTypeId, TaxonomyCategory[]>; subs: Map<string, TaxonomySubcategory[]> } {
  const all: Record<ContentTypeId, TaxonomyCategory[]> = { image: [], text: [], audio: [], video: [] };
  const subs = new Map<string, TaxonomySubcategory[]>();
  for (const type of CONTENT_TYPE_IDS) {
    LABELS.set(contentTypeLabelKey(type), TYPE_LABELS[type]);
    TAXONOMY_SEED[type].forEach(([[catEn, catTr], rawSubs, icon, [descEn, descTr]], catIndex) => {
      const catId = slugify(catEn);
      const catKey = `taxonomy.${type}.${catId}`;
      LABELS.set(catKey, [catEn, catTr]);
      const subList: TaxonomySubcategory[] = rawSubs.map(([subEn, subTr], subIndex) => {
        const subId = slugify(subEn);
        const labelKey = `${catKey}.${subId}`;
        LABELS.set(labelKey, [subEn, subTr]);
        return { id: subId, slug: subId, type, categoryId: catId, labelKey, description: null, sortOrder: subIndex, isActive: true };
      });
      subs.set(`${type}:${catId}`, subList);
      all[type].push({ id: catId, slug: catId, type, labelKey: catKey, icon, description: [descEn, descTr], sortOrder: catIndex, isActive: true, subcategories: subList });
    });
  }
  return { all, subs };
}

{
  const seeded = buildFromSeed();
  install(seeded.all, seeded.subs);
}

/**
 * Replaces the bundled seed with the live database rows. A content type the
 * database has no categories for keeps its seed (so a partially populated
 * table never empties a picker).
 */
export function hydrateTaxonomy(categories: TaxonomyDbCategory[], subcategories: TaxonomyDbSubcategory[]): void {
  const seeded = buildFromSeed();
  const all = { ...seeded.all };
  const subs = new Map(seeded.subs);
  const byType = new Map<ContentTypeId, TaxonomyDbCategory[]>();
  for (const row of categories) {
    if (!byType.has(row.contentType)) byType.set(row.contentType, []);
    byType.get(row.contentType)!.push(row);
  }
  const dbSubsByCategory = new Map<string, TaxonomyDbSubcategory[]>();
  for (const row of subcategories) {
    if (!dbSubsByCategory.has(row.categoryDbId)) dbSubsByCategory.set(row.categoryDbId, []);
    dbSubsByCategory.get(row.categoryDbId)!.push(row);
  }
  for (const [type, rows] of byType) {
    // Drop this type's seed labels/subs, then rebuild it from the rows.
    for (const key of Array.from(subs.keys())) if (key.startsWith(`${type}:`)) subs.delete(key);
    all[type] = rows.map((row) => {
      const catKey = `taxonomy.${type}.${row.slug}`;
      LABELS.set(catKey, [row.nameEn, row.nameTr]);
      const subList: TaxonomySubcategory[] = (dbSubsByCategory.get(row.dbId) ?? []).map((sub) => {
        const labelKey = `${catKey}.${sub.slug}`;
        LABELS.set(labelKey, [sub.nameEn, sub.nameTr]);
        return {
          id: sub.slug,
          slug: sub.slug,
          type,
          categoryId: row.slug,
          labelKey,
          description: sub.descriptionEn || sub.descriptionTr ? [sub.descriptionEn ?? "", sub.descriptionTr ?? ""] : null,
          sortOrder: sub.sortOrder,
          isActive: sub.isActive,
        };
      });
      subs.set(`${type}:${row.slug}`, subList);
      return {
        id: row.slug,
        slug: row.slug,
        type,
        labelKey: catKey,
        icon: row.icon,
        description: row.descriptionEn || row.descriptionTr ? [row.descriptionEn ?? "", row.descriptionTr ?? ""] : null,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        subcategories: subList,
      };
    });
  }
  install(all, subs);
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Visible label for any taxonomy node (`labelKey`), in the active language. */
export function taxonomyLabel(labelKey: string, language: Language): string {
  const pair = LABELS.get(labelKey);
  if (!pair) return labelKey;
  return language === "en" ? pair[0] : pair[1];
}

export function isContentTypeId(value: unknown): value is ContentTypeId {
  return typeof value === "string" && (CONTENT_TYPE_IDS as readonly string[]).includes(value);
}

/** Active categories of a type, in display order. */
export function getCategories(type: ContentTypeId): TaxonomyCategory[] {
  return TREE[type];
}
/** Any category of the type (inactive ones included, so an old value still resolves). */
export function findCategory(type: ContentTypeId, categoryId: string | null | undefined): TaxonomyCategory | null {
  if (!categoryId) return null;
  return ALL[type].find((c) => c.id === categoryId) ?? null;
}
/** Active subcategories of a category. */
export function getSubcategories(type: ContentTypeId, categoryId: string | null | undefined): TaxonomySubcategory[] {
  if (!categoryId) return [];
  return TREE[type].find((c) => c.id === categoryId)?.subcategories ?? [];
}
export function findSubcategory(
  type: ContentTypeId,
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
): TaxonomySubcategory | null {
  if (!subcategoryId || !categoryId) return null;
  return ALL_SUBS.get(`${type}:${categoryId}`)?.find((s) => s.id === subcategoryId) ?? null;
}

export interface TaxonomySelection {
  contentType: ContentTypeId;
  category: string | null;
  subcategory: string | null;
}

/** Drops a category/subcategory that doesn't exist for the type (bad/legacy data) instead of trusting it. */
export function sanitizeTaxonomy(
  type: ContentTypeId,
  category: string | null | undefined,
  subcategory: string | null | undefined,
): { category: string | null; subcategory: string | null } {
  const cat = findCategory(type, category);
  if (!cat) return { category: null, subcategory: null };
  const sub = findSubcategory(type, cat.id, subcategory);
  return { category: cat.id, subcategory: sub?.id ?? null };
}

/**
 * Maps a value stored before the 4-type taxonomy (`code`, `music`) — or
 * anything unknown — onto a current type (+ category where the old value
 * implied one). Used defensively when reading rows.
 */
export function normalizeLegacyContentType(raw: string | null | undefined): { contentType: ContentTypeId; category: string | null } {
  if (isContentTypeId(raw)) return { contentType: raw, category: null };
  if (raw === "code") return { contentType: "text", category: "coding" };
  if (raw === "music") return { contentType: "audio", category: "music" };
  return { contentType: "image", category: null };
}

/** Active filter: `null` at a level means "any". */
export interface TaxonomyFilterValue {
  contentType: ContentTypeId | null;
  category: string | null;
  subcategory: string | null;
}
export const EMPTY_TAXONOMY_FILTER: TaxonomyFilterValue = { contentType: null, category: null, subcategory: null };

export function matchesTaxonomy(
  item: { contentType?: string | null; category?: string | null; subcategory?: string | null },
  filter: TaxonomyFilterValue,
): boolean {
  if (filter.contentType && item.contentType !== filter.contentType) return false;
  if (filter.category && item.category !== filter.category) return false;
  if (filter.subcategory && item.subcategory !== filter.subcategory) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Search: interpreting typed text ("görsel anime") and autocomplete.
// ---------------------------------------------------------------------------

export type TaxonomyEntry =
  | { kind: "type"; type: ContentTypeId; keys: string[]; labelKey: string }
  | { kind: "category"; type: ContentTypeId; categoryId: string; keys: string[]; labelKey: string }
  | { kind: "subcategory"; type: ContentTypeId; categoryId: string; subcategoryId: string; keys: string[]; labelKey: string };

/** Comparison key: case/accent-insensitive (also folds â/î/û, e.g. "Hikâye" ~ "hikaye"). */
function norm(text: string): string {
  return normalizeTagLabel(text.replace(/[âÂ]/g, "a").replace(/[îÎ]/g, "i").replace(/[ûÛ]/g, "u"));
}

function keyFor(labelKey: string): string[] {
  const pair = LABELS.get(labelKey)!;
  return Array.from(new Set([norm(pair[0]), norm(pair[1])]));
}

/** Built once, lazily — a few hundred small records, never rendered directly. */
function getEntryIndex(): TaxonomyEntry[] {
  if (entryIndex) return entryIndex;
  const out: TaxonomyEntry[] = [];
  for (const type of CONTENT_TYPE_IDS) {
    const labelKey = contentTypeLabelKey(type);
    out.push({ kind: "type", type, labelKey, keys: keyFor(labelKey) });
    for (const cat of TREE[type]) {
      out.push({ kind: "category", type, categoryId: cat.id, labelKey: cat.labelKey, keys: keyFor(cat.labelKey) });
      for (const sub of cat.subcategories) {
        out.push({ kind: "subcategory", type, categoryId: cat.id, subcategoryId: sub.id, labelKey: sub.labelKey, keys: keyFor(sub.labelKey) });
      }
    }
  }
  entryIndex = out;
  return out;
}

export interface ParsedTaxonomyQuery {
  contentType: ContentTypeId | null;
  category: string | null;
  subcategory: string | null;
  /** The query with every recognised taxonomy word removed. */
  rest: string;
}

/**
 * Reads "aliq03 görsel anime" as {type: image, sub: anime, rest: "aliq03"}.
 * Words are matched (1–3 word phrases, accent/case-insensitive) against
 * type / category / subcategory labels in both languages. A word that could
 * mean several things is only applied when the type is already known (from
 * an earlier "görsel"/"video"…) or when it is unambiguous; otherwise it
 * stays part of `rest` so ordinary searches keep working.
 */
export function parseTaxonomyQuery(query: string): ParsedTaxonomyQuery {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const index = getEntryIndex();
  const normWords = words.map((w) => norm(w));

  // Pass 1: find the content type, if one is named.
  let contentType: ContentTypeId | null = null;
  const used = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    const hit = index.find((e) => e.kind === "type" && e.keys.includes(normWords[i]));
    if (hit && hit.kind === "type") {
      contentType = hit.type;
      used.add(i);
      break;
    }
  }

  // Pass 2: category / subcategory, longest phrase first.
  let category: string | null = null;
  let subcategory: string | null = null;
  for (let i = 0; i < words.length; i++) {
    if (used.has(i)) continue;
    for (let len = Math.min(3, words.length - i); len >= 1; len--) {
      const span = Array.from({ length: len }, (_, k) => i + k);
      if (span.some((k) => used.has(k))) continue;
      const phrase = norm(words.slice(i, i + len).join(" "));
      if (!phrase) continue;
      const matches = index.filter((e) => e.kind !== "type" && e.keys.includes(phrase) && (!contentType || e.type === contentType));
      if (matches.length === 0) continue;
      const types = new Set(matches.map((m) => m.type));
      if (!contentType && types.size > 1) continue; // ambiguous across types — leave as text
      // Prefer a subcategory match (more specific) inside the chosen type.
      const pick = matches.find((m) => m.kind === "subcategory") ?? matches[0];
      if (!contentType) contentType = pick.type;
      if (pick.kind === "subcategory") {
        if (!category) category = pick.categoryId;
        if (!subcategory) subcategory = pick.subcategoryId;
      } else if (pick.kind === "category" && !category) {
        category = pick.categoryId;
      } else {
        continue;
      }
      span.forEach((k) => used.add(k));
      i += len - 1;
      break;
    }
  }

  const rest = words.filter((_, i) => !used.has(i)).join(" ");
  return { contentType, category, subcategory, rest };
}

export interface TaxonomySuggestion {
  entry: TaxonomyEntry;
  /** Text to put in the search box for this suggestion (its label in the active language). */
  insertText: string;
}

/**
 * Autocomplete for the word currently being typed. `prefix` is matched at
 * the start of any label word; results are limited and ordered type →
 * category → subcategory. When a content type is already in the query only
 * that type's categories/subcategories are offered.
 */
export function suggestTaxonomy(prefix: string, language: Language, contentType: ContentTypeId | null, limit = 6): TaxonomySuggestion[] {
  const p = norm(prefix);
  if (p.length < 1) return [];
  const rank = { type: 0, category: 1, subcategory: 2 } as const;
  const found = getEntryIndex()
    .filter((e) => (!contentType || e.type === contentType || e.kind === "type" ? true : false))
    .filter((e) => !(contentType && e.kind === "type"))
    .filter((e) => e.keys.some((k) => k.startsWith(p) || k.split("-").some((word) => word.startsWith(p))))
    .sort((a, b) => rank[a.kind] - rank[b.kind]);
  const seen = new Set<string>();
  const out: TaxonomySuggestion[] = [];
  for (const entry of found) {
    const label = taxonomyLabel(entry.labelKey, language);
    const dedupe = `${entry.kind}:${entry.type}:${label}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ entry, insertText: label });
    if (out.length >= limit) break;
  }
  return out;
}

/** "Fotoğrafçılık · Moda Fotoğrafı" (optionally prefixed by the type) — the readable path of whatever levels are set. */
export function taxonomyPathLabel(
  item: { contentType: ContentTypeId; category?: string | null; subcategory?: string | null },
  language: Language,
  includeType = true,
): string {
  const parts: string[] = [];
  if (includeType) parts.push(taxonomyLabel(contentTypeLabelKey(item.contentType), language));
  const cat = findCategory(item.contentType, item.category);
  if (cat) {
    parts.push(taxonomyLabel(cat.labelKey, language));
    const sub = findSubcategory(item.contentType, cat.id, item.subcategory);
    if (sub) parts.push(taxonomyLabel(sub.labelKey, language));
  }
  return parts.join(" · ");
}
