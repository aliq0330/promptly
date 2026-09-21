import { supabase } from "./client";
import { savePrompt } from "./saves";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import type { Collection, Prompt } from "@/types";

export interface CollectionRow {
  id: string;
  name: string;
  visibility: "public" | "private";
  item_count: number;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
}

const COLLECTION_SELECT = `
  id, name, visibility, item_count, created_at, updated_at,
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
  };
}

/**
 * Fetches the most recently-added item's first media for each collection id
 * in one query, for use as a cheap "cover image" — never a separately
 * uploaded cover. Returns a Map keyed by collection_id; a collection with no
 * image items (or no items at all) is simply absent from the map.
 */
async function fetchCovers(collectionIds: string[]): Promise<Map<string, Collection["coverImage"]>> {
  const covers = new Map<string, Collection["coverImage"]>();
  if (collectionIds.length === 0) return covers;
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select("collection_id, created_at, prompts ( prompt_media ( id, url, width, height, alt ) )")
      .in("collection_id", collectionIds)
      .order("created_at", { ascending: false });
    if (error || !data) return covers;
    for (const row of data as unknown as {
      collection_id: string;
      prompts: { prompt_media: { id: string; url: string; width: number; height: number; alt: string | null }[] } | null;
    }[]) {
      if (covers.has(row.collection_id)) continue;
      const media = row.prompts?.prompt_media?.[0];
      if (media) {
        covers.set(row.collection_id, { id: media.id, url: media.url, width: media.width, height: media.height, alt: media.alt ?? "" });
      }
    }
    return covers;
  } catch (err) {
    console.error("fetchCovers", err);
    return covers;
  }
}

/** Every collection this user owns, newest-first — for the profile "Koleksiyonlar" tab and the save modal. Includes private ones (RLS already limits this to the caller's own collections when called for someone else, but this is only ever called for the signed-in owner). */
export async function fetchOwnCollections(userId: string): Promise<Collection[]> {
  try {
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
    return rows.map((row) => mapCollectionRow(row, covers.get(row.id) ?? null));
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

/** Every real prompt in a collection, newest-first — soft-deleted prompts (Bölüm 9.7) are filtered out the same way every other listing does. */
export async function fetchCollectionItems(collectionId: string): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select(`created_at, prompts ( ${PROMPT_SELECT} )`)
      .eq("collection_id", collectionId)
      .order("created_at", { ascending: false });
    if (error || !data) {
      if (error) console.error("fetchCollectionItems", error);
      return [];
    }
    return (data as unknown as { prompts: PromptRow | null }[])
      .map((row) => row.prompts)
      .filter((row): row is PromptRow => Boolean(row) && !row!.deleted_at)
      .map((row) => mapPromptRow(row));
  } catch (err) {
    console.error("fetchCollectionItems", err);
    return [];
  }
}

/** Which of this user's own collections already contain this prompt — powers the save modal's "+/kayıtlı" state per row. */
export async function fetchCollectionIdsContaining(promptId: string, userId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select("collection_id, collections!inner ( owner_id )")
      .eq("prompt_id", promptId)
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
  };
}

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

/** Deletes a real collection the caller owns (RLS enforces ownership) — only removes the collection and its collection_items rows (on delete cascade); the prompts themselves, other collections, and the general prompt_saves bookmark are never touched. */
export async function deleteCollection(collectionId: string): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", collectionId);
  if (error) throw new Error(error.message);
}

/**
 * Adds a real prompt to a real collection the caller owns. Also ensures the
 * prompt is in the caller's general "Kaydedilenler" (prompt_saves) — adding
 * to a collection is this app's primary "save" action now, so a collection
 * is never an island disconnected from the existing bookmark (CLAUDE.md
 * mimari karar). The savePrompt call is best-effort: a duplicate-row error
 * (already generally saved) is swallowed, anything else is logged but never
 * blocks the collection add itself succeeding.
 */
export async function addItemToCollection(collectionId: string, promptId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("collection_items").insert({ collection_id: collectionId, prompt_id: promptId });
  if (error) throw new Error(error.message);
  try {
    await savePrompt(promptId, userId);
  } catch (err) {
    console.error("addItemToCollection: savePrompt", err);
  }
}

/** Removes a real prompt from one collection only — never touches the general save or the prompt's membership in any other collection. */
export async function removeItemFromCollection(collectionId: string, promptId: string): Promise<void> {
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("prompt_id", promptId);
  if (error) throw new Error(error.message);
}
