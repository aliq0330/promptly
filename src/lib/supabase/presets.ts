import { supabase } from "./client";
import { withoutBlocked } from "./blocked-users";
import { applyKeysetCursor, nextCursorFrom, type KeysetCursor } from "./pagination";
import { PROFILE_SELECT } from "./profiles";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { normalizeToolRefs } from "@/lib/ai-tool-catalog";
import {
  applyAdvancedFilters,
  applyTaxonomyFilter,
  hasSearchFilter,
  sanitizeSearchText,
  tagJoinSelect,
  taxonomyColumns,
  type ContentSearchFilters,
} from "./taxonomy-query";
import { translateForRuntime } from "@/lib/i18n/translations";
import type { Preset, PromptContentType, Tag } from "@/types";

export interface PresetRow {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  cover_url: string | null;
  content_type: PromptContentType;
  category: string | null;
  subcategory: string | null;
  tools: string[] | null;
  selection: Record<string, string> | null;
  status: "draft" | "published";
  visibility: "public" | "private";
  use_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
  preset_tags: { tags: { slug: string; label: string } }[] | null;
}

export const PRESET_SELECT = `
  id, creator_id, title, description, cover_url, content_type, category, subcategory, tools, selection, status, visibility,
  use_count, like_count, comment_count, save_count, created_at, updated_at,
  profiles:creator_id ( ${PROFILE_SELECT} ),
  preset_tags ( tags ( slug, label ) )
`;

export function mapPresetRow(row: PresetRow): Preset {
  return {
    id: row.id,
    creator: mapProfileRow(row.profiles),
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url,
    contentType: row.content_type,
    category: row.category,
    subcategory: row.subcategory,
    tools: normalizeToolRefs(row.tools),
    selection: row.selection && typeof row.selection === "object" ? row.selection : {},
    status: row.status,
    visibility: row.visibility,
    useCount: row.use_count ?? 0,
    likeCount: row.like_count ?? 0,
    commentCount: row.comment_count ?? 0,
    saveCount: row.save_count ?? 0,
    tags: (row.preset_tags ?? []).map((pt): Tag => ({ slug: pt.tags.slug, label: pt.tags.label })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface PresetsPage {
  items: Preset[];
  nextCursor: KeysetCursor | null;
}

/** Recent public presets, keyset-paginated — the real "Daha fazla yükle" source behind `/presets`. */
export async function fetchRecentPresets(limit = 24, cursor?: KeysetCursor): Promise<PresetsPage> {
  try {
    const request = applyKeysetCursor(
      supabase
        .from("presets")
        .select(PRESET_SELECT)
        .eq("status", "published")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
      "created_at",
      cursor,
    );
    const { data, error } = await request;
    if (error) {
      console.error("fetchRecentPresets", error);
      return { items: [], nextCursor: null };
    }
    const rows = (data ?? []) as unknown as PresetRow[];
    const items = await withoutBlocked(rows.map(mapPresetRow), (p) => p.creator.id);
    return { items, nextCursor: nextCursorFrom(rows, limit, (row) => row.created_at) };
  } catch (err) {
    console.error("fetchRecentPresets", err);
    return { items: [], nextCursor: null };
  }
}

/** Preset search — same shared taxonomy / advanced-search filters as prompts/generators/requests (content type, category, tool, tags, author). */
export async function searchPresets(query: string, filters: ContentSearchFilters = {}, limit = 20): Promise<Preset[]> {
  const escaped = sanitizeSearchText(query);
  if (!escaped && !hasSearchFilter(filters)) return [];
  try {
    let request = supabase
      .from("presets")
      .select(PRESET_SELECT + tagJoinSelect("preset_tags", filters.tagSlugs))
      .eq("status", "published")
      .eq("visibility", "public");
    if (escaped) request = request.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    if (filters.authorId) request = request.eq("creator_id", filters.authorId);
    request = applyAdvancedFilters(applyTaxonomyFilter(request, filters.taxonomy), filters, "creator_id");
    const order = filters.sort === "new" ? "created_at" : "use_count";
    const { data, error } = await request.order(order, { ascending: false }).limit(limit);
    if (error) {
      console.error("searchPresets", error);
      return [];
    }
    return withoutBlocked((data ?? []).map((row) => mapPresetRow(row as unknown as PresetRow)), (p) => p.creator.id);
  } catch (err) {
    console.error("searchPresets", err);
    return [];
  }
}

/** One preset, `null` when missing / not visible to the viewer (RLS). */
export async function fetchPresetById(id: string): Promise<Preset | null> {
  try {
    const { data, error } = await supabase.from("presets").select(PRESET_SELECT).eq("id", id).maybeSingle();
    if (error || !data) {
      if (error) console.error("fetchPresetById", error);
      return null;
    }
    return mapPresetRow(data as unknown as PresetRow);
  } catch (err) {
    console.error("fetchPresetById", err);
    return null;
  }
}

/** A creator's presets — RLS gives a visitor only public published ones, the owner their private ones and drafts too ("Oluşturduklarım"). */
export async function fetchPresetsByCreator(creatorId: string): Promise<Preset[]> {
  try {
    const { data, error } = await supabase
      .from("presets")
      .select(PRESET_SELECT)
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchPresetsByCreator", error);
      return [];
    }
    return (data ?? []).map((row) => mapPresetRow(row as unknown as PresetRow));
  } catch (err) {
    console.error("fetchPresetsByCreator", err);
    return [];
  }
}

/**
 * "Kaydettiklerim" — presets in ANY of the viewer's own collections (the one
 * shared save/collection system, Bölüm 9.38), newest save first, one row per
 * preset. Presets that are no longer visible (made private/deleted) simply
 * drop out (RLS yields a null embed).
 */
export async function fetchSavedPresets(userId: string): Promise<Preset[]> {
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select(`created_at, collections!inner ( owner_id ), presets ( ${PRESET_SELECT} )`)
      .eq("collections.owner_id", userId)
      .not("preset_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) {
      console.error("fetchSavedPresets", error);
      return [];
    }
    const seen = new Set<string>();
    const out: Preset[] = [];
    for (const row of (data ?? []) as unknown as { presets: PresetRow | null }[]) {
      if (!row.presets || seen.has(row.presets.id)) continue;
      seen.add(row.presets.id);
      out.push(mapPresetRow(row.presets));
    }
    return out;
  } catch (err) {
    console.error("fetchSavedPresets", err);
    return [];
  }
}

/** Public published presets carrying `slug`, newest first. */
export async function fetchPresetsByTagSlug(slug: string, limit = 60): Promise<Preset[]> {
  try {
    const { data, error } = await supabase
      .from("preset_tags")
      .select(`presets:preset_id ( ${PRESET_SELECT} )`)
      .eq("tag_slug", slug)
      .limit(limit);
    if (error) {
      console.error("fetchPresetsByTagSlug", error);
      return [];
    }
    return ((data ?? []) as unknown as { presets: PresetRow | null }[])
      .map((row) => row.presets)
      .filter((row): row is PresetRow => Boolean(row) && row!.status === "published" && row!.visibility === "public")
      .map(mapPresetRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    console.error("fetchPresetsByTagSlug", err);
    return [];
  }
}

export interface SavePresetInput {
  id: string | null;
  title: string;
  description: string;
  coverUrl: string | null;
  contentType: PromptContentType;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  selection: Record<string, string>;
  tags: Tag[];
  status: "draft" | "published";
  visibility: "public" | "private";
}

/** Creates or updates a preset (+ replaces its tags). Returns the id. Ownership is enforced by RLS (an update that touches 0 rows is reported, never swallowed). */
export async function savePreset(input: SavePresetInput, creatorId: string): Promise<string> {
  const tax = taxonomyColumns(input.contentType, input.category, input.subcategory);
  const columns = {
    title: input.title.trim(),
    description: input.description.trim(),
    cover_url: input.coverUrl,
    content_type: input.contentType,
    category: tax.category,
    subcategory: tax.subcategory,
    tools: input.tools,
    selection: input.selection,
    status: input.status,
    visibility: input.visibility,
  };
  let id = input.id;
  if (id) {
    const { data, error } = await supabase.from("presets").update(columns).eq("id", id).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(translateForRuntime("preset.errorSave"));
  } else {
    const { data, error } = await supabase.from("presets").insert({ ...columns, creator_id: creatorId }).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }
  await supabase.from("preset_tags").delete().eq("preset_id", id as string);
  if (input.tags.length > 0) {
    const { error } = await supabase.from("preset_tags").insert(input.tags.map((tag) => ({ preset_id: id, tag_slug: tag.slug })));
    if (error) throw new Error(error.message);
  }
  return id as string;
}

export async function deletePreset(id: string): Promise<void> {
  const { data, error } = await supabase.from("presets").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(translateForRuntime("preset.errorDelete"));
}

/**
 * Records one real "Bu hazır ayarı kullan" press (`preset_uses` row → the
 * `presets.use_count` trigger). Fire-and-forget by design: the user's
 * navigation never waits on, or fails because of, the counter.
 */
export async function recordPresetUse(presetId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("preset_uses").insert({ preset_id: presetId, user_id: userId });
  if (error) console.error("recordPresetUse", error);
}
