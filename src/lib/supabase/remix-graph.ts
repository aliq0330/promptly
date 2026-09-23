import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { Generator, Prompt, RemixGraphNode } from "@/types";

interface RemixGraphRow {
  id: string;
  title: string;
  author_id: string;
  origin_type: "original" | "remix" | "request_response";
  source_prompt_id: string | null;
  root_prompt_id: string | null;
  deleted_at: string | null;
  remix_count: number;
  created_at: string;
}

interface GeneratorRemixGraphRow {
  id: string;
  title: string;
  slug: string;
  author_id: string;
  origin_type: "original" | "remix";
  source_generator_id: string | null;
  root_generator_id: string | null;
  remix_count: number;
  created_at: string;
}

/**
 * Every node in a real remix tree, fetched in ONE recursive query
 * (`fetch_remix_graph`, 20260919250000) rather than one fetch per node —
 * Aşama 3's "tüm düğümleri aynı anda DOM'a yığma... performanslı çizim"
 * requirement starts at the data layer, not just the renderer. RLS
 * (enforced inside that SQL function, `security invoker`) means a node
 * neither published nor owned by the viewer is simply never returned —
 * never included as a "restricted" stub with leaked details (Aşama 18).
 * A child whose `sourcePromptId` doesn't appear among the returned nodes
 * (a private/never-published ancestor, or one this recursive walk simply
 * couldn't see) is rendered by the map as "kaynak erişilemez", the exact
 * same honest treatment as a genuinely deleted one — this function makes
 * no distinction between the two cases, since from a privacy standpoint
 * they must look identical to an unauthorized viewer.
 */
export async function fetchRemixGraph(rootPromptId: string): Promise<RemixGraphNode[]> {
  try {
    const { data, error } = await supabase.rpc("fetch_remix_graph", { p_root_id: rootPromptId });
    if (error || !data) return [];
    const rows = data as RemixGraphRow[];
    if (rows.length === 0) return [];

    const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests")
      .in("id", authorIds);
    const profilesById = new Map((profileRows as ProfileRow[] | null ?? []).map((p) => [p.id, mapProfileRow(p)]));

    return rows.map((row): RemixGraphNode => ({
      id: row.id,
      title: row.deleted_at ? "" : row.title,
      author: profilesById.get(row.author_id) ?? {
        id: row.author_id,
        username: "silinmis-kullanici",
        displayName: "Silinmiş kullanıcı",
        avatarUrl: null,
        coverUrl: null,
        bio: null,
        website: null,
        followerCount: 0,
        followingCount: 0,
        createdAt: row.created_at,
      },
      originType: row.origin_type === "remix" ? "remix" : "original",
      sourcePromptId: row.source_prompt_id,
      rootPromptId: row.root_prompt_id,
      isDeleted: Boolean(row.deleted_at),
      isAccessible: true,
      remixCount: row.remix_count,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("fetchRemixGraph", err);
    return [];
  }
}

/** The real root id to fetch a graph for, from any node in the chain — the prompt's own id if it's an original, its `root_prompt_id` otherwise. */
export function resolveGraphRootId(prompt: Pick<Prompt, "id" | "origin">): string {
  return prompt.origin.type === "remix" ? prompt.origin.rootPromptId : prompt.id;
}

/**
 * The generator equivalent of `fetchRemixGraph`/`resolveGraphRootId` —
 * same single-query recursive-CTE data source (`fetch_generator_remix_
 * graph`, Bölüm 9.36), same `RemixGraphNode` shape (with `contentType:
 * "generator"` set so `RemixBranchMap`/`RemixNodeDetailPanel` build the
 * right links and hide the prompt-only merge/diff actions), so the SAME
 * map component renders a generator's remix tree without any changes of
 * its own. A generator has no soft-delete (Bölüm 9.7's prompt-only
 * concept) — a real deletion just removes the row, so `isDeleted` is
 * always `false` here; an ancestor that's genuinely gone simply never
 * appears among the returned nodes, which the map's existing "kaynağa
 * erişilemiyor" fallback already handles correctly.
 */
export async function fetchGeneratorRemixGraph(rootGeneratorId: string): Promise<RemixGraphNode[]> {
  try {
    const { data, error } = await supabase.rpc("fetch_generator_remix_graph", { p_root_id: rootGeneratorId });
    if (error || !data) return [];
    const rows = data as GeneratorRemixGraphRow[];
    if (rows.length === 0) return [];

    const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests")
      .in("id", authorIds);
    const profilesById = new Map((profileRows as ProfileRow[] | null ?? []).map((p) => [p.id, mapProfileRow(p)]));

    return rows.map((row): RemixGraphNode => ({
      id: row.id,
      title: row.title,
      author: profilesById.get(row.author_id) ?? {
        id: row.author_id,
        username: "silinmis-kullanici",
        displayName: "Silinmiş kullanıcı",
        avatarUrl: null,
        coverUrl: null,
        bio: null,
        website: null,
        followerCount: 0,
        followingCount: 0,
        createdAt: row.created_at,
      },
      originType: row.origin_type,
      sourcePromptId: row.source_generator_id,
      rootPromptId: row.root_generator_id,
      isDeleted: false,
      isAccessible: true,
      remixCount: row.remix_count,
      createdAt: row.created_at,
      contentType: "generator",
      slug: row.slug,
    }));
  } catch (err) {
    console.error("fetchGeneratorRemixGraph", err);
    return [];
  }
}

/** The real root id to fetch a generator's remix graph for — mirrors `resolveGraphRootId`. */
export function resolveGeneratorGraphRootId(generator: Pick<Generator, "id" | "origin">): string {
  return generator.origin.type === "remix" ? generator.origin.rootGeneratorId : generator.id;
}
