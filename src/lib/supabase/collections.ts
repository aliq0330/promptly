import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import { GENERATOR_SELECT, mapGeneratorRow, type GeneratorRow } from "./generators";
import type { LikeableContentType as SaveableContentType } from "./likes";
import type { Collection, Generator, Prompt } from "@/types";

/**
 * A single row in a collection's contents — a collection can hold prompts
 * AND generators side by side (Bölüm 9.36 widened `collection_items` to a
 * nullable `prompt_id`/`generator_id` pair, same shape as `prompt_likes`),
 * so a flat `Prompt[]` can no longer represent it. Mirrors the `FeedItem`
 * discriminated-union pattern already used for the mixed home/discover feed
 * (`src/features/feed/types.ts`) rather than inventing a new shape.
 */
export type CollectionEntry = { type: "prompt"; data: Prompt } | { type: "generator"; data: Generator };

/** Which real column a save target lives in — mirrors likes.ts's `targetColumn` exactly (Bölüm 9.36's Prompt/Generator parity pass, same "collection_items now holds a nullable prompt_id OR generator_id" shape as prompt_likes/prompt_comments). */
function saveTargetColumn(contentType: SaveableContentType): "prompt_id" | "generator_id" {
  return contentType === "generator" ? "generator_id" : "prompt_id";
}

export interface CollectionRow {
  id: string;
  name: string;
  visibility: "public" | "private";
  item_count: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
}

const COLLECTION_SELECT = `
  id, name, visibility, item_count, is_default, created_at, updated_at,
  profiles:owner_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

function mapCollectionRow(row: CollectionRow, coverImage: Collection["coverImage"] = null): Collection {
  return {
    id: row.id,
    owner: mapProfileRow(row.profiles),
    name: row.name,
    visibility: row.visibility,
    itemCount: row.item_count,
    coverImage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDefault: row.is_default,
  };
}

/** Default collection sorts first ("Genel" always leads Kaydedilenler, CLAUDE.md Bölüm 9.22 §1), the rest stay newest-first. */
function sortWithDefaultFirst(collections: Collection[]): Collection[] {
  return [...collections].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Fetches the most recently-added item's first media for each collection id
 * in one query, for use as a cheap "cover image" — never a separately
 * uploaded cover. A generator has no `prompt_media` (its "cover" is just its
 * own `cover_url` data URL, Bölüm 9.27), so its row is checked as a second,
 * separate fallback rather than trying to force it through the same
 * `prompt_media` shape. Returns a Map keyed by collection_id; a collection
 * with no image items (or no items at all) is simply absent from the map.
 */
async function fetchCovers(collectionIds: string[]): Promise<Map<string, Collection["coverImage"]>> {
  const covers = new Map<string, Collection["coverImage"]>();
  if (collectionIds.length === 0) return covers;
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select(
        "collection_id, created_at, prompts ( prompt_media ( id, url, width, height, alt ) ), generators ( cover_url )",
      )
      .in("collection_id", collectionIds)
      .order("created_at", { ascending: false });
    if (error || !data) return covers;
    for (const row of data as unknown as {
      collection_id: string;
      prompts: { prompt_media: { id: string; url: string; width: number; height: number; alt: string | null }[] } | null;
      generators: { cover_url: string | null } | null;
    }[]) {
      if (covers.has(row.collection_id)) continue;
      const media = row.prompts?.prompt_media?.[0];
      if (media) {
        covers.set(row.collection_id, { id: media.id, url: media.url, width: media.width, height: media.height, alt: media.alt ?? "" });
      } else if (row.generators?.cover_url) {
        covers.set(row.collection_id, { id: row.collection_id, url: row.generators.cover_url, width: 320, height: 320, alt: "" });
      }
    }
    return covers;
  } catch (err) {
    console.error("fetchCovers", err);
    return covers;
  }
}

async function fetchOwnCollectionsRaw(userId: string): Promise<Collection[]> {
  const { data, error } = await supabase
    .from("collections")
    .select(COLLECTION_SELECT)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("fetchOwnCollections", error);
    return [];
  }
  const rows = data as unknown as CollectionRow[];
  const covers = await fetchCovers(rows.map((row) => row.id));
  return sortWithDefaultFirst(rows.map((row) => mapCollectionRow(row, covers.get(row.id) ?? null)));
}

/**
 * Every collection this user owns, "Genel" (default) always first — for the
 * profile "Kaydedilenler" tab and the save modal. Self-healing: every real
 * account gets its default collection at signup (`handle_new_user`) and
 * every pre-existing account was backfilled once (Bölüm 9.22's migration),
 * but if this list ever comes back with no default row anyway (a stray
 * account that predates both, or any other edge case), it calls the same
 * idempotent, unique-index-guarded RPC the signup trigger itself uses and
 * refetches once — it can never end up creating a second one, and a normal
 * page load where the default already exists never calls it at all.
 */
export async function fetchOwnCollections(userId: string): Promise<Collection[]> {
  try {
    const rows = await fetchOwnCollectionsRaw(userId);
    if (rows.some((c) => c.isDefault)) return rows;
    try {
      await supabase.rpc("get_or_create_own_default_collection");
    } catch (err) {
      console.error("fetchOwnCollections: self-heal", err);
      return rows;
    }
    return await fetchOwnCollectionsRaw(userId);
  } catch (err) {
    console.error("fetchOwnCollections", err);
    return [];
  }
}

/** A single collection by id — RLS hides a private collection from anyone but its owner automatically, so a "not found" and "exists but private" both just resolve to null here (same honest ambiguity as fetchConversationForUser, Bölüm 21 Faz 6). */
export async function fetchCollectionById(id: string): Promise<Collection | null> {
  try {
    const { data, error } = await supabase.from("collections").select(COLLECTION_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as CollectionRow;
    const covers = await fetchCovers([row.id]);
    return mapCollectionRow(row, covers.get(row.id) ?? null);
  } catch (err) {
    console.error("fetchCollectionById", err);
    return null;
  }
}

/** This user's own default ("Genel") collection id — the single source of truth for general "kaydedildi" state (bookmark fill), never derived from a name. Self-heals the same way `fetchOwnCollections` does if it's ever missing. */
export async function fetchDefaultCollectionId(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("collections")
      .select("id")
      .eq("owner_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    if (error) return null;
    if (data) return data.id;
    const { data: healedId, error: rpcError } = await supabase.rpc("get_or_create_own_default_collection");
    if (rpcError) {
      console.error("fetchDefaultCollectionId: self-heal", rpcError);
      return null;
    }
    return healedId ?? null;
  } catch (err) {
    console.error("fetchDefaultCollectionId", err);
    return null;
  }
}

/**
 * Every real item in a collection, newest-first — a prompt OR a generator
 * (Bölüm 9.36 widened `collection_items` itself to hold either, but this
 * fetch was never updated to match: it only ever selected the `prompts`
 * embed, so a row with `generator_id` set came back with `prompts: null`
 * and was silently filtered out — the collection's real `item_count`
 * stayed correct, since the counter trigger counts every row regardless of
 * target, but the item itself never rendered. Fixed here by querying both
 * embeds in the same request and mapping each row to whichever one is
 * actually populated). Soft-deleted prompts (Bölüm 9.7) are filtered out
 * the same way every other listing does; a generator is never soft-deleted
 * (Bölüm 9.27 — hard delete only), so no equivalent filter is needed there.
 */
export async function fetchCollectionItems(collectionId: string): Promise<CollectionEntry[]> {
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select(`created_at, prompts ( ${PROMPT_SELECT} ), generators ( ${GENERATOR_SELECT} )`)
      .eq("collection_id", collectionId)
      .order("created_at", { ascending: false });
    if (error || !data) {
      if (error) console.error("fetchCollectionItems", error);
      return [];
    }
    const entries: CollectionEntry[] = [];
    for (const row of data as unknown as { prompts: PromptRow | null; generators: GeneratorRow | null }[]) {
      if (row.prompts && !row.prompts.deleted_at) {
        entries.push({ type: "prompt", data: mapPromptRow(row.prompts) });
      } else if (row.generators) {
        entries.push({ type: "generator", data: mapGeneratorRow(row.generators) });
      }
    }
    return entries;
  } catch (err) {
    console.error("fetchCollectionItems", err);
    return [];
  }
}

/**
 * Whether this viewer generally saved a real prompt OR generator — true iff
 * it's in their own default ("Genel") collection. Never based on any
 * collection's name (it's renameable), never based on membership in any
 * *other* collection. Replaces the old prompt_saves-backed fetchIsSaved
 * (CLAUDE.md Bölüm 9.22 — single source of truth); `contentType` defaults
 * to `"prompt"` so every existing prompt call site keeps working unchanged
 * (Bölüm 9.36 — the same generator now goes through this SAME function
 * instead of its own separate `isGeneratorSaved`).
 */
export async function isPromptSaved(id: string, userId: string, contentType: SaveableContentType = "prompt"): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select("collection_id, collections!inner ( is_default )")
      .eq(saveTargetColumn(contentType), id)
      .eq("collections.owner_id", userId)
      .eq("collections.is_default", true)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("isPromptSaved", err);
    return false;
  }
}

/** Which of this user's own collections already contain this prompt/generator — powers the save modal's "+/kayıtlı" state per row. `contentType` defaults to `"prompt"` so every existing prompt call site keeps working unchanged. */
export async function fetchCollectionIdsContaining(id: string, userId: string, contentType: SaveableContentType = "prompt"): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select("collection_id, collections!inner ( owner_id )")
      .eq(saveTargetColumn(contentType), id)
      .eq("collections.owner_id", userId);
    if (error || !data) return new Set();
    return new Set((data as unknown as { collection_id: string }[]).map((row) => row.collection_id));
  } catch (err) {
    console.error("fetchCollectionIdsContaining", err);
    return new Set();
  }
}

export async function createCollection(
  input: { name: string; visibility: "public" | "private" },
  ownerId: string,
  ownerProfile: Collection["owner"],
): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .insert({ owner_id: ownerId, name: input.name.trim(), visibility: input.visibility })
    .select("id, created_at, updated_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Koleksiyon oluşturulamadı.");
  return {
    id: data.id,
    owner: ownerProfile,
    name: input.name.trim(),
    visibility: input.visibility,
    itemCount: 0,
    coverImage: null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isDefault: false,
  };
}

/** Renames/re-visibilities a real collection the caller owns — works identically for the default collection (Bölüm 9.22 §11: renaming "Genel" is allowed, its identity never depends on the name) or a custom one. Never sends `is_default` — the DB additionally rejects any attempt to change it outright (`collections_before_update` trigger), so this can't accidentally flip it even if a future edit ever tried to. */
export async function updateCollection(
  collectionId: string,
  patch: { name: string; visibility: "public" | "private" },
): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ name: patch.name.trim(), visibility: patch.visibility })
    .eq("id", collectionId);
  if (error) throw new Error(error.message);
}

/** Deletes a real, non-default collection the caller owns (RLS enforces ownership) — only removes the collection and its collection_items rows (on delete cascade); the prompts themselves, other collections, and the general "kaydedildi" state are never touched. The default ("Genel") collection can never be deleted — the `collections_before_delete` trigger rejects it with a clear message before the frontend even needs its own check (Bölüm 9.22 §12). */
export async function deleteCollection(collectionId: string): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", collectionId);
  if (error) throw new Error(error.message);
}

/**
 * Adds a real prompt OR generator to a real collection the caller owns.
 * This is the ONLY way a prompt/generator joins a collection now — adding
 * it to the default ("Genel") collection specifically IS the general
 * "kaydedildi" action (bookmark fills); adding it to any other collection
 * is just membership in that collection alone and does not by itself
 * generally save the item (CLAUDE.md Bölüm 9.22 §4 — no more silent
 * dual-write into a separate prompt_saves table, single source of truth).
 * `contentType` defaults to `"prompt"` so every existing prompt call site
 * keeps working unchanged (Bölüm 9.36 — a generator now joins the SAME
 * multi-collection system a prompt does, replacing the old
 * default-collection-only `saveGeneratorToDefault`).
 */
export async function addItemToCollection(collectionId: string, id: string, contentType: SaveableContentType = "prompt"): Promise<void> {
  const { error } = await supabase.from("collection_items").insert({ collection_id: collectionId, [saveTargetColumn(contentType)]: id });
  if (error) throw new Error(error.message);
}

/** Removes a real prompt/generator from exactly one collection — never touches the general "kaydedildi" state or its membership in any OTHER collection (CLAUDE.md Bölüm 9.22 §8). Never call this for the caller's own default collection — use `removeFromSavedEverywhere` instead, which is a different operation with different rules (§9). */
export async function removeFromCollection(collectionId: string, id: string, contentType: SaveableContentType = "prompt"): Promise<void> {
  const { error } = await supabase.from("collection_items").delete().eq("collection_id", collectionId).eq(saveTargetColumn(contentType), id);
  if (error) throw new Error(error.message);
}

/**
 * The general "kaydedilenlerden kaldır" action — removes a real prompt or
 * generator from the caller's default collection AND every one of their
 * other collections that also contains it, in one atomic server-side
 * operation (`remove_prompt_from_saved_everywhere`/
 * `remove_generator_from_saved_everywhere` RPCs, CLAUDE.md Bölüm 9.22
 * §7/§18, widened to generators in Bölüm 9.36). Never touches the item
 * itself, another user's saves/collections, or anything beyond the
 * caller's own `collection_items` rows.
 */
export async function removeFromSavedEverywhere(id: string, contentType: SaveableContentType = "prompt"): Promise<void> {
  const rpcName = contentType === "generator" ? "remove_generator_from_saved_everywhere" : "remove_prompt_from_saved_everywhere";
  const rpcParam = contentType === "generator" ? { p_generator_id: id } : { p_prompt_id: id };
  const { error } = await supabase.rpc(rpcName, rpcParam);
  if (error) throw new Error(error.message);
}
