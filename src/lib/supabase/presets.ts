import { supabase } from "./client";
import { fetchAllRows, OWNED_PAGE, type OwnedListFilter, type PagedResult } from "./paged";
import { withoutBlocked } from "./blocked-users";
import { applyKeysetCursor, nextCursorFrom, type KeysetCursor } from "./pagination";
import { PROFILE_SELECT } from "./profiles";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { normalizeToolRefs } from "@/lib/ai-tool-catalog";
import { sanitizeSearchText, taxonomyColumns, type ContentSearchFilters } from "./taxonomy-query";
import { orderByIds, searchContentIds, type SearchCursor, type SearchPage } from "./search";
import { translateForRuntime } from "@/lib/i18n/translations";
import { type PresetField, type PresetFieldConfig, type PresetFieldType, type PresetOption, type PresetSelection } from "@/lib/preset-fields";
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
  selection: PresetSelection | null;
  status: "draft" | "published";
  visibility: "public" | "private";
  community_id?: string | null;
  like_count: number | null;
  quote_count?: number | null;
  comment_count: number | null;
  save_count: number | null;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
  preset_tags: { tags: { slug: string; label: string } }[] | null;
}

export const PRESET_SELECT = `
  id, creator_id, title, description, cover_url, content_type, category, subcategory, tools, selection, status, visibility, community_id,
  like_count, comment_count, save_count, quote_count, created_at, updated_at,
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
    fields: [],
    selection: row.selection && typeof row.selection === "object" ? row.selection : {},
    status: row.status,
    visibility: row.visibility,
    communityId: row.community_id ?? null,
    likeCount: row.like_count ?? 0,
    quoteCount: row.quote_count ?? 0,
    commentCount: row.comment_count ?? 0,
    saveCount: row.save_count ?? 0,
    tags: (row.preset_tags ?? []).map((pt): Tag => ({ slug: pt.tags.slug, label: pt.tags.label })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Fields / options (the user's own, `preset_fields` + `preset_options`)
// ---------------------------------------------------------------------------

interface OptionRow {
  id: string;
  field_id: string;
  label: string;
  value: string;
  sort_order: number;
  fragment_en: string | null;
  fragment_tr: string | null;
}
interface FieldRow {
  id: string;
  owner_id: string;
  preset_id: string | null;
  name: string;
  type: PresetFieldType;
  kind: "phrase" | "suffix" | null;
  content_types: string[] | null;
  config: PresetFieldConfig | null;
  sort_order: number;
  preset_options: OptionRow[] | null;
}

const FIELD_SELECT = "id, owner_id, preset_id, name, type, kind, content_types, config, sort_order, preset_options ( id, field_id, label, value, sort_order, fragment_en, fragment_tr )";

function mapOptionRow(row: OptionRow): PresetOption {
  return {
    id: row.id,
    fieldId: row.field_id,
    label: row.label,
    value: row.value,
    sortOrder: row.sort_order,
    fragment: row.fragment_en || row.fragment_tr ? { en: row.fragment_en ?? "", tr: row.fragment_tr ?? "" } : undefined,
  };
}

export function mapFieldRow(row: FieldRow): PresetField {
  return {
    id: row.id,
    presetId: row.preset_id,
    name: row.name,
    type: row.type,
    kind: row.kind ?? "phrase",
    sortOrder: row.sort_order,
    config: row.config && typeof row.config === "object" ? row.config : {},
    contentTypes: row.content_types ?? [],
    source: "user",
    options: (row.preset_options ?? []).map(mapOptionRow).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/**
 * Attaches each preset's own fields. A SEPARATE query on purpose: if the
 * field tables aren't there yet (migration pending) or the call fails, the
 * presets still load — they just show the parameters the platform catalog
 * knows, exactly as before custom fields existed.
 */
async function withFields(presets: Preset[]): Promise<Preset[]> {
  if (presets.length === 0) return presets;
  try {
    const { data, error } = await supabase
      .from("preset_fields")
      .select(FIELD_SELECT)
      .in(
        "preset_id",
        presets.map((p) => p.id),
      )
      .order("sort_order", { ascending: true });
    if (error || !data) return presets;
    const byPreset = new Map<string, PresetField[]>();
    for (const row of data as unknown as FieldRow[]) {
      if (!row.preset_id) continue;
      if (!byPreset.has(row.preset_id)) byPreset.set(row.preset_id, []);
      byPreset.get(row.preset_id)!.push(mapFieldRow(row));
    }
    return presets.map((p) => ({ ...p, fields: byPreset.get(p.id) ?? [] }));
  } catch {
    return presets;
  }
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
        .is("community_id", null)
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
    const items = await withFields(await withoutBlocked(rows.map(mapPresetRow), (p) => p.creator.id));
    return { items, nextCursor: nextCursorFrom(rows, limit, (row) => row.created_at) };
  } catch (err) {
    console.error("fetchRecentPresets", err);
    return { items: [], nextCursor: null };
  }
}

/** Presets by id (any order), for the home feed's server-chosen page. */
export async function fetchPresetsByIds(ids: string[]): Promise<Preset[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("presets").select(PRESET_SELECT).in("id", ids);
  if (error) throw new Error(error.message);
  return withFields(await withoutBlocked((data ?? []).map((row) => mapPresetRow(row as unknown as PresetRow)), (p) => p.creator.id));
}

/** Presets related to `presetId` (`public.related_presets`): shared tags first, then same category; visible presets only. Throws on failure — the caller hides the block. */
export async function fetchRelatedPresets(presetId: string, limit = 4): Promise<Preset[]> {
  const { data, error } = await supabase.rpc("related_presets", { p_preset_id: presetId, p_limit: limit });
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
  return orderByIds(await fetchPresetsByIds(ids), ids);
}

/** Preset search — same shared taxonomy / advanced-search filters as prompts/requests, one keyset page at a time (`public.search_content`). Text matches title + description (a preset row has no other body column). */
export async function searchPresetsPage(query: string, filters: ContentSearchFilters = {}, limit = 20, cursor?: SearchCursor | null): Promise<SearchPage<Preset>> {
  try {
    const page = await searchContentIds("preset", query, filters, limit, cursor);
    return { items: orderByIds(await fetchPresetsByIds(page.ids), page.ids), nextCursor: page.nextCursor };
  } catch (err) {
    console.error("searchPresetsPage", err);
    return { items: [], nextCursor: null };
  }
}

/** First page only — for pickers that never page. */
export async function searchPresets(query: string, filters: ContentSearchFilters = {}, limit = 20): Promise<Preset[]> {
  return (await searchPresetsPage(query, filters, limit)).items;
}

/** One preset, `null` when missing / not visible to the viewer (RLS). */
export async function fetchPresetById(id: string): Promise<Preset | null> {
  try {
    const { data, error } = await supabase.from("presets").select(PRESET_SELECT).eq("id", id).maybeSingle();
    if (error || !data) {
      if (error) console.error("fetchPresetById", error);
      return null;
    }
    return (await withFields([mapPresetRow(data as unknown as PresetRow)]))[0];
  } catch (err) {
    console.error("fetchPresetById", err);
    return null;
  }
}

/** One page of a person's published presets (profile "Hazır Ayarlar", "İçeriklerim"); same contract as `fetchRequestsByAuthorPage`. */
export async function fetchPresetsByCreatorPage(creatorId: string, filter: OwnedListFilter = {}, offset = 0, limit = OWNED_PAGE): Promise<PagedResult<Preset>> {
  const text = sanitizeSearchText(filter.search ?? "");
  let request = supabase
    .from("presets")
    .select(PRESET_SELECT, offset === 0 ? { count: "exact" } : undefined)
    .eq("creator_id", creatorId)
    .is("community_id", null)
    .eq("status", "published");
  if (filter.visibility && filter.visibility !== "all") request = request.eq("visibility", filter.visibility);
  if (text) request = request.or(`title.ilike.%${text}%,description.ilike.%${text}%`);
  const sort = filter.sort ?? "newest";
  request = sort === "most-liked" ? request.order("like_count", { ascending: false }).order("created_at", { ascending: false }) : request.order("created_at", { ascending: sort === "oldest" });
  const { data, count, error } = await request.order("id", { ascending: sort === "oldest" }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as PresetRow[];
  return { items: await withFields(rows.map(mapPresetRow)), total: offset === 0 ? (count ?? null) : null, nextOffset: rows.length === limit ? offset + limit : null };
}

/** A creator's presets — RLS gives a visitor only public published ones, the owner their private ones and drafts too ("Oluşturduklarım"). */
export async function fetchPresetsByCreator(creatorId: string): Promise<Preset[]> {
  try {
    const { rows } = await fetchAllRows((from, to) =>
      supabase
        .from("presets")
        .select(PRESET_SELECT)
        .eq("creator_id", creatorId)
        .is("community_id", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    );
    return withFields(rows.map((row) => mapPresetRow(row as unknown as PresetRow)));
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
export async function fetchSavedPresetsPage(userId: string, offset = 0, limit = OWNED_PAGE): Promise<PagedResult<Preset>> {
  const { data, count, error } = await supabase
    .from("collection_items")
    .select(`id, created_at, collections!inner ( owner_id ), presets ( ${PRESET_SELECT} )`, offset === 0 ? { count: "exact" } : undefined)
    .eq("collections.owner_id", userId)
    .not("preset_id", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { presets: PresetRow | null }[];
  const seen = new Set<string>();
  const items: Preset[] = [];
  for (const row of rows) {
    if (!row.presets || seen.has(row.presets.id)) continue;
    seen.add(row.presets.id);
    items.push(mapPresetRow(row.presets));
  }
  return { items: await withFields(items), total: offset === 0 ? (count ?? null) : null, nextOffset: rows.length === limit ? offset + limit : null };
}

/** Every saved preset (pickers that must offer all of them: "Hazır ayarla dene", the preset picker) — the pages above, read to the end (was cut at 120). */
export async function fetchSavedPresets(userId: string): Promise<Preset[]> {
  try {
    const out: Preset[] = [];
    const seen = new Set<string>();
    for (let offset: number | null = 0, guard = 0; offset !== null && guard < 200; guard += 1) {
      const page: PagedResult<Preset> = await fetchSavedPresetsPage(userId, offset, 100);
      for (const preset of page.items) {
        if (seen.has(preset.id)) continue;
        seen.add(preset.id);
        out.push(preset);
      }
      offset = page.nextOffset;
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
    return withFields(
      ((data ?? []) as unknown as { presets: PresetRow | null }[])
      .map((row) => row.presets)
      .filter((row): row is PresetRow => Boolean(row) && row!.status === "published" && row!.visibility === "public")
      .map(mapPresetRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
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
  /** The preset's own fields (new ids are fine — the selection is keyed by them); platform-catalog keys in the selection need no field row. */
  fields: PresetField[];
  selection: PresetSelection;
  tags: Tag[];
  status: "draft" | "published";
  visibility: "public" | "private";
  /** Topluluğa özgü içerik: yalnız YENİ kayıtta gönderilir (`?community=`); sunucu görünürlüğü private'a zorlar, taslağa ve sonradan değiştirmeye izin vermez. */
  communityId?: string | null;
}

/**
 * Creates or updates a preset (+ replaces its tags). Returns the id.
 *
 * Creating: the row is inserted, then its fields written (a creation is not an edit, so no version is opened).
 * Updating: title, description, the chosen values and the whole field tree go through ONE RPC transaction,
 * `save_preset_content` — which also records the version history (the old content is read before it is replaced,
 * so v1 is the real pre-edit content; before, the fields were rewritten by separate non-atomic requests). It runs
 * FIRST, before the status/visibility update below, so publishing a draft in the same save is never mistaken for an
 * edit. Ownership is enforced by the RPC (an update that touches nothing is reported, never swallowed).
 */
export async function savePreset(input: SavePresetInput, creatorId: string): Promise<string> {
  const tax = taxonomyColumns(input.contentType, input.category, input.subcategory);
  const title = input.title.trim();
  const description = input.description.trim();
  const columns = {
    cover_url: input.coverUrl,
    content_type: input.contentType,
    category: tax.category,
    subcategory: tax.subcategory,
    tools: input.tools,
    status: input.status,
    visibility: input.visibility,
  };
  let id = input.id;
  if (id) {
    const { error: contentError } = await supabase.rpc("save_preset_content", {
      p_preset_id: id,
      p_title: title,
      p_description: description,
      p_selection: input.selection,
      p_fields: fieldsPayload(input.fields),
    });
    if (contentError) throw new Error(contentError.message || translateForRuntime("preset.errorSave"));
    const { data, error } = await supabase.from("presets").update(columns).eq("id", id).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(translateForRuntime("preset.errorSave"));
  } else {
    const { data, error } = await supabase
      .from("presets")
      .insert({ ...columns, title, description, selection: input.selection, creator_id: creatorId, community_id: input.communityId ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    id = data.id as string;
    await replacePresetFields(id, creatorId, input.fields);
  }
  await supabase.from("preset_tags").delete().eq("preset_id", id as string);
  if (input.tags.length > 0) {
    const { error } = await supabase.from("preset_tags").insert(input.tags.map((tag) => ({ preset_id: id, tag_slug: tag.slug })));
    if (error) throw new Error(error.message);
  }
  return id as string;
}

/** The `p_fields` shape of `save_preset_content`: the field tree with its options, array order = sort order. */
function fieldsPayload(fields: PresetField[]) {
  return fields.map((field) => ({
    id: field.id,
    name: field.name.trim(),
    type: field.type,
    kind: field.kind ?? "phrase",
    content_types: field.contentTypes ?? [],
    config: field.config ?? {},
    options: optionInsertRows(field).map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      fragment_en: option.fragment_en,
      fragment_tr: option.fragment_tr,
    })),
  }));
}

function fieldInsertRow(field: PresetField, ownerId: string, presetId: string | null, sortOrder: number) {
  return {
    id: field.id,
    owner_id: ownerId,
    preset_id: presetId,
    name: field.name.trim(),
    type: field.type,
    kind: field.kind ?? "phrase",
    content_types: field.contentTypes ?? [],
    config: field.config ?? {},
    sort_order: sortOrder,
  };
}

function optionInsertRows(field: PresetField) {
  return field.options.map((option, index) => ({
    id: option.id,
    field_id: field.id,
    label: option.label.trim(),
    value: (option.value || option.label).trim(),
    sort_order: index,
    fragment_en: option.fragment?.en || null,
    fragment_tr: option.fragment?.tr || null,
  }));
}

/** Replaces ALL of a preset's own fields (and their options) with `fields` — the builder always holds the complete list. */
async function replacePresetFields(presetId: string, ownerId: string, fields: PresetField[]): Promise<void> {
  const del = await supabase.from("preset_fields").delete().eq("preset_id", presetId);
  if (del.error) {
    // Table missing (migration pending): only a preset with no own fields can still be saved.
    if (fields.length === 0) return;
    throw new Error(del.error.message);
  }
  if (fields.length === 0) return;
  const inserted = await supabase.from("preset_fields").insert(fields.map((field, index) => fieldInsertRow(field, ownerId, presetId, index)));
  if (inserted.error) throw new Error(inserted.error.message);
  const optionRows = fields.flatMap(optionInsertRows);
  if (optionRows.length > 0) {
    const options = await supabase.from("preset_options").insert(optionRows);
    if (options.error) throw new Error(options.error.message);
  }
}

export async function deletePreset(id: string): Promise<void> {
  const { data, error } = await supabase.from("presets").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(translateForRuntime("preset.errorDelete"));
}
