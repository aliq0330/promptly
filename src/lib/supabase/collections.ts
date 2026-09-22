import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import type { Collection, Prompt } from "@/types";

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

/** Whether this viewer generally saved a real prompt — true iff it's in their own default ("Genel") collection. Never based on any collection's name (it's renameable), never based on membership in any *other* collection. Replaces the old prompt_saves-backed fetchIsSaved (CLAUDE.md Bölüm 9.22 — single source of truth). */
export async function isPromptSaved(promptId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select("collection_id, collections!inner ( is_default )")
      .eq("prompt_id", promptId)
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
 * Adds a real prompt to a real collection the caller owns. This is the
 * ONLY way a prompt joins a collection now — adding it to the default
 * ("Genel") collection specifically IS the general "kaydedildi" action
 * (bookmark fills); adding it to any other collection is just membership
 * in that collection alone and does not by itself generally save the
 * prompt (CLAUDE.md Bölüm 9.22 §4 — no more silent dual-write into a
 * separate prompt_saves table, single source of truth).
 */
export async function addItemToCollection(collectionId: string, promptId: string): Promise<void> {
  const { error } = await supabase.from("collection_items").insert({ collection_id: collectionId, prompt_id: promptId });
  if (error) throw new Error(error.message);
}

/** Removes a real prompt from exactly one collection — never touches the general "kaydedildi" state or the prompt's membership in any OTHER collection (CLAUDE.md Bölüm 9.22 §8). Never call this for the caller's own default collection — use `removeFromSavedEverywhere` instead, which is a different operation with different rules (§9). */
export async function removeFromCollection(collectionId: string, promptId: string): Promise<void> {
  const { error } = await supabase.from("collection_items").delete().eq("collection_id", collectionId).eq("prompt_id", promptId);
  if (error) throw new Error(error.message);
}

/**
 * The general "kaydedilenlerden kaldır" action — removes a real prompt from
 * the caller's default collection AND every one of their other collections
 * that also contains it, in one atomic server-side operation
 * (`remove_prompt_from_saved_everywhere` RPC, CLAUDE.md Bölüm 9.22 §7/§18).
 * Never touches the prompt itself, another user's saves/collections, or
 * anything beyond the caller's own `collection_items` rows.
 */
export async function removeFromSavedEverywhere(promptId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_prompt_from_saved_everywhere", { p_prompt_id: promptId });
  if (error) throw new Error(error.message);
}

// === Generator kaydetme (Bölüm 9.34 — generator_saves'in yerini alıyor) ===
//
// Kapsam kararı: bir prompt'un aksine, bir generator şu an yalnızca TEK bir
// yere kaydedilebiliyor — çağıranın kendi varsayılan ("Genel") koleksiyonu.
// `collection_items` şeması (Bölüm 9.34'ün migration'ı) zaten generic bir
// `generator_id` taşıyor ve bir generatorun ÖZEL, isimli bir koleksiyona da
// eklenebilmesini yapısal olarak destekliyor — ama bunun için tam bir
// `SaveToCollectionModal` benzeri çoklu-koleksiyon arayüzü inşa etmek bu
// fazın kapsamı dışında bırakıldı (ayrı bir UI genellemesi gerektiriyor).
// Bu üç fonksiyon, eski `generator_saves` (Bölüm 9.27, atıl bırakıldı —
// Bölüm 9.22'nin `prompt_saves`'i atıl bırakma kararıyla aynı gerekçe)
// tablosunun basit boolean "kaydedildi mi" davranışını BİREBİR koruyor,
// yalnızca artık gerçek koleksiyon sistemine (dolayısıyla gerçek `item_
// count` sayaçlarına) bağlı.

/** Whether this viewer generally saved a real generator — true iff it's in their own default ("Genel") collection. Mirrors isPromptSaved. */
export async function isGeneratorSaved(generatorId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select("collection_id, collections!inner ( is_default )")
      .eq("generator_id", generatorId)
      .eq("collections.owner_id", userId)
      .eq("collections.is_default", true)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("isGeneratorSaved", err);
    return false;
  }
}

/** Adds a real generator to the caller's own default collection — self-heals the default collection id the same way fetchDefaultCollectionId does. */
export async function saveGeneratorToDefault(generatorId: string, userId: string): Promise<void> {
  const collectionId = await fetchDefaultCollectionId(userId);
  if (!collectionId) throw new Error("Varsayılan koleksiyon bulunamadı.");
  const { error } = await supabase.from("collection_items").insert({ collection_id: collectionId, generator_id: generatorId });
  if (error) throw new Error(error.message);
}

/** Removes a real generator from the caller's own default collection. */
export async function unsaveGeneratorFromDefault(generatorId: string, userId: string): Promise<void> {
  const collectionId = await fetchDefaultCollectionId(userId);
  if (!collectionId) return;
  const { error } = await supabase.from("collection_items").delete().eq("collection_id", collectionId).eq("generator_id", generatorId);
  if (error) throw new Error(error.message);
}
