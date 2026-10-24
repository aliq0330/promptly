import { supabase } from "./client";
import { batcherRegistry } from "./batched-lookup";
import { translateForRuntime } from "@/lib/i18n/translations";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import { WORKFLOW_SELECT, mapWorkflowRow, type WorkflowRow } from "./workflows";
import { PRESET_SELECT, mapPresetRow, type PresetRow } from "./presets";
import type { LikeableContentType } from "./likes";
import { dedupeSavedEntries } from "@/lib/saved-selection";
import { fetchCommunityPostsByIds, type CommunityPost } from "./communities";

/** See `use-save-state.ts`'s identical note — saving never targets a request. A community application post is saved as the POST itself (docs/history/184-*). */
type SaveableContentType = Extract<LikeableContentType, "prompt" | "workflow" | "preset" | "community_post">;
import type { Collection, Preset, Prompt, Workflow } from "@/types";

/**
 * A single row in a collection's contents — a collection can hold prompts,
 * workflows and presets side by side, so a flat `Prompt[]` can't represent it. Mirrors the `FeedItem`
 * discriminated-union pattern already used for the mixed home/discover feed
 * (`src/features/feed/types.ts`) rather than inventing a new shape.
 */
export type CollectionEntry =
  | { type: "prompt"; data: Prompt }
  | { type: "workflow"; data: Workflow }
  | { type: "preset"; data: Preset }
  /** A community APPLICATION post saved as the post itself (its own like/comment/save counts, docs/history/184-*). */
  | { type: "community_post"; data: CommunityPost };

/** Which real column a save target lives in — mirrors likes.ts's `targetColumn`. */
function saveTargetColumn(contentType: SaveableContentType): "prompt_id" | "workflow_id" | "preset_id" | "community_post_id" {
  if (contentType === "community_post") return "community_post_id";
  if (contentType === "preset") return "preset_id";
  if (contentType === "workflow") return "workflow_id";
  return "prompt_id";
}

export interface CollectionRow {
  id: string;
  name: string;
  visibility: "public" | "private";
  item_count: number;
  follower_count: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
}

const COLLECTION_SELECT = `
  id, name, visibility, item_count, follower_count, is_default, created_at, updated_at,
  profiles:owner_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests, is_demo )
`;

function mapCollectionRow(row: CollectionRow, coverImage: Collection["coverImage"] = null): Collection {
  return {
    id: row.id,
    owner: mapProfileRow(row.profiles),
    name: row.name,
    visibility: row.visibility,
    itemCount: row.item_count,
    followerCount: row.follower_count ?? 0,
    coverImage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDefault: row.is_default,
  };
}

/** Default collection sorts first ("Genel" always leads the collection list), the rest stay newest-first. */
function sortWithDefaultFirst(collections: Collection[]): Collection[] {
  return [...collections].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Fetches the most recently-added item's first media for each collection id
 * in one query, for use as a cheap "cover image" — never a separately
 * uploaded cover. Returns a Map keyed by collection_id; a collection
 * with no image items (or no items at all) is simply absent from the map.
 */
async function fetchCovers(collectionIds: string[]): Promise<Map<string, Collection["coverImage"]>> {
  const covers = new Map<string, Collection["coverImage"]>();
  if (collectionIds.length === 0) return covers;
  try {
    const { data, error } = await supabase
      .from("collection_items")
      .select(
        "collection_id, created_at, prompts ( prompt_media ( id, url, width, height, alt ) ), workflows ( cover_url ), presets ( cover_url )",
      )
      .in("collection_id", collectionIds)
      .order("created_at", { ascending: false });
    if (error || !data) return covers;
    for (const row of data as unknown as {
      collection_id: string;
      prompts: { prompt_media: { id: string; url: string; width: number; height: number; alt: string | null }[] } | null;
      workflows: { cover_url: string | null } | null;
      presets: { cover_url: string | null } | null;
    }[]) {
      if (covers.has(row.collection_id)) continue;
      const media = row.prompts?.prompt_media?.[0];
      if (media) {
        covers.set(row.collection_id, { id: media.id, url: media.url, width: media.width, height: media.height, alt: media.alt ?? "" });
      } else if (row.workflows?.cover_url) {
        covers.set(row.collection_id, { id: row.collection_id, url: row.workflows.cover_url, width: 320, height: 320, alt: "" });
      } else if (row.presets?.cover_url) {
        covers.set(row.collection_id, { id: row.collection_id, url: row.presets.cover_url, width: 320, height: 320, alt: "" });
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

/** Newest-first non-empty public collections of one person — what a visitor sees on their profile (RLS would also show the owner their private ones, which is why `visibility` is filtered explicitly). */
export async function fetchPublicCollectionsByOwner(ownerId: string): Promise<Collection[]> {
  try {
    const { data, error } = await supabase
      .from("collections")
      .select(COLLECTION_SELECT)
      .eq("owner_id", ownerId)
      .eq("visibility", "public")
      .gt("item_count", 0)
      .order("created_at", { ascending: false });
    if (error || !data) {
      if (error) console.error("fetchPublicCollectionsByOwner", error);
      return [];
    }
    const rows = data as unknown as CollectionRow[];
    const covers = await fetchCovers(rows.map((row) => row.id));
    return rows.map((row) => mapCollectionRow(row, covers.get(row.id) ?? null));
  } catch (err) {
    console.error("fetchPublicCollectionsByOwner", err);
    return [];
  }
}

/** Thrown by `followCollection` at the 200-collection limit, so the UI can say so instead of a generic failure. */
export class CollectionFollowLimitError extends Error {
  constructor() {
    super("collection_follow_limit");
    this.name = "CollectionFollowLimitError";
  }
}

/** Whether this viewer follows the collection (RLS: they only ever see their own follow rows). */
export async function isFollowingCollection(userId: string, collectionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("collection_follows")
      .select("collection_id")
      .eq("user_id", userId)
      .eq("collection_id", collectionId)
      .maybeSingle();
    if (error) {
      console.error("isFollowingCollection", error);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error("isFollowingCollection", err);
    return false;
  }
}

/** Follows a public collection of someone else. Following twice is not an error (the unique key already says so). */
export async function followCollection(userId: string, collectionId: string): Promise<void> {
  const { error } = await supabase.from("collection_follows").insert({ user_id: userId, collection_id: collectionId });
  if (!error || error.code === "23505") return;
  if (error.message.includes("collection_follow_limit")) throw new CollectionFollowLimitError();
  throw new Error(error.message || translateForRuntime("collection.followFailed"));
}

/** Unfollows a collection. Unfollowing one that is not followed is not an error either. */
export async function unfollowCollection(userId: string, collectionId: string): Promise<void> {
  const { error } = await supabase.from("collection_follows").delete().eq("user_id", userId).eq("collection_id", collectionId);
  if (error) throw new Error(error.message || translateForRuntime("collection.followFailed"));
}

/**
 * The public collections this viewer follows, most recently followed first. The follow rows
 * are read first and the collections second, so one the owner has since made private (or
 * deleted) simply isn't returned (RLS hides it) instead of showing up as a broken card.
 */
export async function fetchFollowedCollections(userId: string): Promise<Collection[]> {
  try {
    const { data: follows, error } = await supabase
      .from("collection_follows")
      .select("collection_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error || !follows || follows.length === 0) {
      if (error) console.error("fetchFollowedCollections", error);
      return [];
    }
    const ids = follows.map((row) => row.collection_id as string);
    const { data, error: collectionsError } = await supabase.from("collections").select(COLLECTION_SELECT).in("id", ids);
    if (collectionsError || !data) {
      if (collectionsError) console.error("fetchFollowedCollections", collectionsError);
      return [];
    }
    const rows = data as unknown as CollectionRow[];
    const covers = await fetchCovers(rows.map((row) => row.id));
    const byId = new Map(rows.map((row) => [row.id, mapCollectionRow(row, covers.get(row.id) ?? null)]));
    return ids.flatMap((id) => {
      const collection = byId.get(id);
      return collection && collection.visibility === "public" ? [collection] : [];
    });
  } catch (err) {
    console.error("fetchFollowedCollections", err);
    return [];
  }
}

type CollectionItemRow = { community_post_id?: string | null; prompts: PromptRow | null; workflows: WorkflowRow | null; presets: PresetRow | null };

/**
 * Rows that point at a community post are resolved in ONE extra read afterwards (`resolvePostEntries`): a post the viewer can no
 * longer read (left the community, post removed) simply isn't returned and is skipped, so the list never shows a broken card.
 */
function mapCollectionItemRows(rows: CollectionItemRow[], posts: Map<string, CommunityPost> = new Map()): CollectionEntry[] {
  const entries: CollectionEntry[] = [];
  for (const row of rows) {
    if (row.community_post_id) {
      const post = posts.get(row.community_post_id);
      if (post) entries.push({ type: "community_post", data: post });
    } else if (row.prompts && !row.prompts.deleted_at) {
      entries.push({ type: "prompt", data: mapPromptRow(row.prompts) });
    } else if (row.workflows) {
      entries.push({ type: "workflow", data: mapWorkflowRow(row.workflows) });
    } else if (row.presets) {
      entries.push({ type: "preset", data: mapPresetRow(row.presets) });
    }
  }
  return entries;
}

async function resolvePostEntries(rows: CollectionItemRow[]): Promise<Map<string, CommunityPost>> {
  const ids = [...new Set(rows.flatMap((row) => (row.community_post_id ? [row.community_post_id] : [])))];
  try {
    return await fetchCommunityPostsByIds(ids);
  } catch (err) {
    console.error("resolvePostEntries", err);
    return new Map();
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
      .select(`created_at, community_post_id, prompts ( ${PROMPT_SELECT} ), workflows ( ${WORKFLOW_SELECT} ), presets ( ${PRESET_SELECT} )`)
      .eq("collection_id", collectionId)
      .order("created_at", { ascending: false });
    if (error || !data) {
      if (error) console.error("fetchCollectionItems", error);
      return [];
    }
    const rows = data as unknown as CollectionItemRow[];
    return mapCollectionItemRows(rows, await resolvePostEntries(rows));
  } catch (err) {
    console.error("fetchCollectionItems", err);
    return [];
  }
}

/** Membership rows read for "Kaydedilenler" (PostgREST returns at most 1000 rows per request anyway). */
const SAVED_ROW_LIMIT = 1000;

/**
 * "Kaydedilenler": every distinct work in at least one of this user's own
 * collections — "Genel" and the custom ones alike — newest save first, each
 * work once however many collections hold it. It is a read over
 * `collection_items`, the same rows `isPromptSaved` looks at, so the list and
 * the bookmark icon can't disagree. The owner filter is explicit because the
 * select policy also exposes other people's public collections.
 *
 * Unlike the per-collection fetch this THROWS on failure: a failed load must
 * not look like "nothing saved".
 */
export async function fetchSavedItems(userId: string): Promise<CollectionEntry[]> {
  const { data, error } = await supabase
    .from("collection_items")
    .select(`created_at, community_post_id, collections!inner ( owner_id ), prompts ( ${PROMPT_SELECT} ), workflows ( ${WORKFLOW_SELECT} ), presets ( ${PRESET_SELECT} )`)
    .eq("collections.owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(SAVED_ROW_LIMIT);
  if (error) {
    console.error("fetchSavedItems", error);
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown as CollectionItemRow[];
  return dedupeSavedEntries(mapCollectionItemRows(rows, await resolvePostEntries(rows)));
}

/**
 * Whether this viewer saved a work — true iff it's a member of ANY of their
 * own collections (the default "Genel" one or a custom one), never decided by
 * a collection's name. This is the one definition of "saved": the bookmark
 * fill, "Kaydedilenler" (`fetchSavedItems`) and the save modal all read the
 * same `collection_items` rows. Leaving a single collection never unsaves
 * anything while another still holds the work. `contentType` defaults to
 * `"prompt"`.
 */
export async function isPromptSaved(id: string, userId: string, contentType: SaveableContentType = "prompt"): Promise<boolean> {
  return saveLookup(`${userId}|${contentType}`)(id);
}

const saveLookup = batcherRegistry((key) => {
  const [userId, contentType] = key.split("|") as [string, SaveableContentType];
  const column = saveTargetColumn(contentType);
  return async (ids) => {
    const { data, error } = await supabase
      .from("collection_items")
      .select(`${column}, collections!inner ( owner_id )`)
      .eq("collections.owner_id", userId)
      .in(column, ids);
    if (error || !data) return new Set();
    return new Set((data as unknown as Record<string, string>[]).map((row) => row[column]));
  };
});

/**
 * Which of this user's own collections already contain this work — powers the
 * save modal's per-row state. THROWS on failure: an unknown membership must
 * never be read as "in no collection", or the modal would offer to save over
 * something it just failed to see.
 */
export async function fetchCollectionIdsContaining(id: string, userId: string, contentType: SaveableContentType = "prompt"): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("collection_items")
    .select("collection_id, collections!inner ( owner_id )")
    .eq(saveTargetColumn(contentType), id)
    .eq("collections.owner_id", userId);
  if (error) {
    console.error("fetchCollectionIdsContaining", error);
    throw new Error(error.message);
  }
  return new Set(((data ?? []) as unknown as { collection_id: string }[]).map((row) => row.collection_id));
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
  if (error || !data) throw new Error(error?.message ?? translateForRuntime("collection.createFailed"));
  return {
    id: data.id,
    owner: ownerProfile,
    name: input.name.trim(),
    visibility: input.visibility,
    itemCount: 0,
    followerCount: 0,
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
 * Adds a real item to a real collection the caller owns. This is the ONLY
 * way an item joins a collection (and so becomes "saved") — there is no
 * separate saves table; `prompt_saves` was dropped by migration
 * 20260919840000. Saved = in at least one collection, so adding to any
 * collection fills the bookmark; adding to a second one is just membership
 * in that additional collection. Idempotent: the unique index on
 * (collection_id, target) makes a concurrent or repeated add a no-op
 * (`23505`), not a failure. `contentType` defaults to `"prompt"`.
 */
export async function addItemToCollection(collectionId: string, id: string, contentType: SaveableContentType = "prompt"): Promise<void> {
  const { error } = await supabase.from("collection_items").insert({ collection_id: collectionId, [saveTargetColumn(contentType)]: id });
  if (error && error.code !== "23505") throw new Error(error.message);
}

/**
 * Removes a work from exactly one collection and nothing else — never from
 * another collection, never from "Genel" unless that is the one named. If it
 * was the work's last membership the bookmark empties (saved = in at least one
 * collection); otherwise it stays filled. Deleting a row that is already gone
 * is a no-op, so a repeated or concurrent remove is harmless. RLS only lets
 * the collection's owner delete.
 */
export async function removeFromCollection(collectionId: string, id: string, contentType: SaveableContentType = "prompt"): Promise<void> {
  const { error } = await supabase.from("collection_items").delete().eq("collection_id", collectionId).eq(saveTargetColumn(contentType), id);
  if (error) throw new Error(error.message);
}
