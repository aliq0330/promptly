import { supabase } from "./client";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import type { Prompt, PromptRequest, Tag } from "@/types";
import { REQUEST_SELECT, mapRequestRow, type RequestRow } from "./requests";

const TAG_STATS_SELECT = "slug, label, prompt_usage_count, request_usage_count, usage_count, created_at";

interface TagStatsRow {
  slug: string;
  label: string;
  prompt_usage_count: number;
  request_usage_count: number;
  usage_count: number;
  created_at: string;
}

function mapTagStatsRow(row: TagStatsRow): Tag {
  return {
    slug: row.slug,
    label: row.label,
    promptUsageCount: row.prompt_usage_count,
    requestUsageCount: row.request_usage_count,
    usageCount: row.usage_count,
    createdAt: row.created_at,
  };
}

/** Every real tag (seeded once in supabase/migrations/20260919120600_seed_tags.sql, plus any real user-created tag since — Bölüm 9.23), alphabetical, WITHOUT stats. Public read (Bölüm 19). Cheap — used by the live analyzer and the manual-tag autocomplete, which only need slug+label. */
export async function fetchAllTags(): Promise<Tag[]> {
  try {
    const { data, error } = await supabase.from("tags").select("slug, label").order("label", { ascending: true });
    if (error) {
      console.error("fetchAllTags", error);
      return [];
    }
    return (data ?? []) as Tag[];
  } catch (err) {
    console.error("fetchAllTags", err);
    return [];
  }
}

/** Every real tag WITH real usage stats, sorted by genuine usage_count desc — for the "Popüler Etiketler" sections (discover page + /tags). */
export async function fetchPopularTags(limit = 20): Promise<Tag[]> {
  try {
    const { data, error } = await supabase
      .from("tags")
      .select(TAG_STATS_SELECT)
      .order("usage_count", { ascending: false })
      .order("label", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("fetchPopularTags", error);
      return [];
    }
    return ((data ?? []) as TagStatsRow[]).map(mapTagStatsRow);
  } catch (err) {
    console.error("fetchPopularTags", err);
    return [];
  }
}

/** Most recently created real tags, newest first — for the /tags "Yeni Eklenenler" section. */
export async function fetchNewestTags(limit = 20): Promise<Tag[]> {
  try {
    const { data, error } = await supabase
      .from("tags")
      .select(TAG_STATS_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchNewestTags", error);
      return [];
    }
    return ((data ?? []) as TagStatsRow[]).map(mapTagStatsRow);
  } catch (err) {
    console.error("fetchNewestTags", err);
    return [];
  }
}

/** Every real tag WITH stats (for the /tags "Tümü" list + client-side search) — same shape as fetchPopularTags, sorted alphabetically instead. */
export async function fetchAllTagsWithStats(): Promise<Tag[]> {
  try {
    const { data, error } = await supabase.from("tags").select(TAG_STATS_SELECT).order("label", { ascending: true });
    if (error) {
      console.error("fetchAllTagsWithStats", error);
      return [];
    }
    return ((data ?? []) as TagStatsRow[]).map(mapTagStatsRow);
  } catch (err) {
    console.error("fetchAllTagsWithStats", err);
    return [];
  }
}

/** A single real tag by slug, with stats — for the tag detail page's header. */
export async function fetchTagBySlug(slug: string): Promise<Tag | null> {
  try {
    const { data, error } = await supabase.from("tags").select(TAG_STATS_SELECT).eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return mapTagStatsRow(data as TagStatsRow);
  } catch (err) {
    console.error("fetchTagBySlug", err);
    return null;
  }
}

/**
 * Genuinely time-windowed rising tags — via the real `trending_tags` RPC
 * (Bölüm 9.23), never a fabricated percentage. Returns only tags with real
 * recent usage; an empty result means there genuinely isn't enough recent
 * data yet, and the caller must render an honest empty state instead of
 * inventing one (CLAUDE.md §14/§24).
 */
export interface TrendingTag extends Tag {
  recentCount: number;
  previousCount: number;
}

export async function fetchTrendingTags(limit = 12, windowDays = 7): Promise<TrendingTag[]> {
  try {
    const { data, error } = await supabase.rpc("trending_tags", { p_limit: limit, p_window_days: windowDays });
    if (error) {
      console.error("fetchTrendingTags", error);
      return [];
    }
    return ((data ?? []) as { slug: string; label: string; recent_count: number; previous_count: number }[]).map(
      (row) => ({ slug: row.slug, label: row.label, recentCount: row.recent_count, previousCount: row.previous_count }),
    );
  } catch (err) {
    console.error("fetchTrendingTags", err);
    return [];
  }
}

/**
 * Finds an existing real tag by normalized label among an already-fetched
 * catalog (see `useTagCatalog`) — the client-side half of CLAUDE.md §9/§10's
 * "prefer an existing catalog tag, case-insensitively, before ever
 * suggesting a new one." Doing this against an already-loaded catalog
 * (rather than a fresh ILIKE query per keystroke) sidesteps Postgres
 * ILIKE's locale-dependent Turkish case-folding entirely — normalization
 * happens once, client-side, with the exact same rules the server's
 * `normalize_tag_name` uses (see tag-normalize.ts).
 */
export function findExistingTagByLabel(catalog: Tag[], label: string): Tag | null {
  const target = normalizeTagLabel(label);
  if (!target) return null;
  return catalog.find((tag) => normalizeTagLabel(tag.label) === target) ?? null;
}

/**
 * Genuinely, permanently gets-or-creates a real tag — via the
 * `get_or_create_tag` RPC (Bölüm 9.23), the ONLY way a new tag row can ever
 * be written (there is no direct client INSERT policy on `tags` at all).
 * Callers should always try `findExistingTagByLabel` against an
 * already-loaded catalog FIRST (CLAUDE.md §13: "always search for an
 * existing match before creating a new one") — this is the fallback for a
 * genuinely new label, and is itself still idempotent/duplicate-safe at the
 * database level (a unique `slug` — CLAUDE.md §10) even if called directly.
 */
export async function getOrCreateTag(label: string): Promise<Tag> {
  const { data, error } = await supabase.rpc("get_or_create_tag", { p_label: label });
  if (error || !data) throw new Error(error?.message ?? "Etiket oluşturulamadı.");
  const row = data as { slug: string; label: string };
  return { slug: row.slug, label: row.label };
}

/** Every real, published prompt tagged with `slug`, newest first — for `/tags/local?tag=…`. */
export async function fetchPromptsByTag(slug: string, limit = 60): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_tags")
      .select(`prompts:prompt_id ( ${PROMPT_SELECT} )`)
      .eq("tag_slug", slug)
      .order("created_at", { ascending: false, referencedTable: "prompts" })
      .limit(limit);
    if (error) {
      console.error("fetchPromptsByTag", error);
      return [];
    }
    return ((data ?? []) as unknown as { prompts: PromptRow | null }[])
      .map((row) => row.prompts)
      .filter((row): row is PromptRow => Boolean(row))
      .filter((row) => row.status === "published")
      .map((row) => mapPromptRow(row))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.error("fetchPromptsByTag", err);
    return [];
  }
}

/** Every real request tagged with `slug`, newest first — the tag detail page's requests section (CLAUDE.md §15). Requests have no draft concept, so no status filter is needed (same as fetchRecentRequests). */
export async function fetchRequestsByTagSlug(slug: string, limit = 60): Promise<PromptRequest[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_request_tags")
      .select(`prompt_requests:request_id ( ${REQUEST_SELECT} )`)
      .eq("tag_slug", slug)
      .order("created_at", { ascending: false, referencedTable: "prompt_requests" })
      .limit(limit);
    if (error) {
      console.error("fetchRequestsByTagSlug", error);
      return [];
    }
    return ((data ?? []) as unknown as { prompt_requests: RequestRow | null }[])
      .map((row) => row.prompt_requests)
      .filter((row): row is RequestRow => Boolean(row))
      .map((row) => mapRequestRow(row))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.error("fetchRequestsByTagSlug", err);
    return [];
  }
}
