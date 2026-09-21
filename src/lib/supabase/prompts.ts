import { supabase } from "./client";
import { placeholderArt } from "@/lib/placeholder-image";
import { resizeImageToBlob } from "@/lib/utils";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { Prompt, PromptContentType, PromptMedia, PromptOrigin, Tag, UserProfile } from "@/types";

/**
 * Hand-written mirror of the `public.prompts` row shape (joined with its
 * author profile, media and tags) — see
 * supabase/migrations/20260919120200_prompts_and_requests.sql. Kept in
 * sync by hand, same as mappers.ts's ProfileRow.
 */
export interface PromptRow {
  id: string;
  title: string;
  description: string;
  prompt_text: string;
  tool: string | null;
  content_type: PromptContentType;
  status: "draft" | "published";
  origin_type: "original" | "remix" | "request_response";
  source_prompt_id: string | null;
  root_prompt_id: string | null;
  request_id: string | null;
  like_count: number;
  comment_count: number;
  remix_count: number;
  created_at: string;
  show_on_profile: boolean;
  deleted_at: string | null;
  profiles: ProfileRow;
  prompt_media: { id: string; url: string; width: number; height: number; alt: string | null }[];
  prompt_tags: { tags: { slug: string; label: string } }[];
}

export const PROMPT_SELECT = `
  id, title, description, prompt_text, tool, content_type, status,
  origin_type, source_prompt_id, root_prompt_id, request_id,
  like_count, comment_count, remix_count, created_at, show_on_profile,
  deleted_at,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  prompt_media ( id, url, width, height, alt ),
  prompt_tags ( tags ( slug, label ) )
`;

/**
 * Excludes a safely-deleted prompt (`deleted_at` set — see
 * 20260919190000_prompt_safe_delete.sql) from a normal listing. Never
 * applied to `fetchPromptById` (a direct link must still resolve to show a
 * "Bu paylaşım silindi." page) or the remix-source lookup used by
 * `RemixContext` — both need to see the row exists, just emptied.
 */
function filterNotDeleted(prompts: Prompt[]): Prompt[] {
  return prompts.filter((prompt) => !prompt.deletedAt);
}

/**
 * Excludes a request-answer or remix prompt whose author chose to keep it
 * out of normal profile/feed/discover/search results (`show_on_profile =
 * false`) — applied (after mapping) by every query below that represents
 * "this author's normal posts" or a general content stream. Done
 * client-side rather than as a second `.or(...)` query filter: PostgREST
 * ANDs a single `.or()` group with plain column filters just fine, but
 * stacking two independent `.or()` calls in the same query has no clearly
 * documented, verifiable combination behavior — not worth risking on a
 * query that can't be tested against a live Supabase project from this
 * environment. Never applied to `fetchPromptsForRequest` (the request's
 * own answer list), `fetchRemixesOf`/`fetchRemixChain` (a remix's own
 * relationship to its ancestors/descendants must always resolve
 * regardless of this preference), or `fetchPromptById` (a direct link).
 * Irrelevant for original prompts, which always have `show_on_profile =
 * true`.
 */
function filterProfileVisible(prompts: Prompt[]): Prompt[] {
  return prompts.filter((prompt) => prompt.origin.type === "original" || prompt.showOnProfile);
}

function mapOrigin(row: PromptRow): PromptOrigin {
  if (row.origin_type === "remix" && row.source_prompt_id && row.root_prompt_id) {
    return { type: "remix", sourcePromptId: row.source_prompt_id, rootPromptId: row.root_prompt_id };
  }
  if (row.origin_type === "request_response" && row.request_id) {
    return { type: "request-response", requestId: row.request_id, responseId: row.id };
  }
  return { type: "original" };
}

export function mapPromptRow(row: PromptRow): Prompt {
  const media: PromptMedia[] = (row.prompt_media ?? [])
    .map((m) => ({ id: m.id, url: m.url, width: m.width, height: m.height, alt: m.alt ?? row.title }));
  const tags: Tag[] = (row.prompt_tags ?? []).map((pt) => ({ slug: pt.tags.slug, label: pt.tags.label }));

  return {
    id: row.id,
    author: mapProfileRow(row.profiles),
    title: row.title,
    description: row.description,
    promptText: row.prompt_text,
    tool: row.tool,
    contentType: row.content_type,
    media,
    tags,
    origin: mapOrigin(row),
    likeCount: row.like_count,
    commentCount: row.comment_count,
    remixCount: row.remix_count,
    showOnProfile: row.show_on_profile,
    deletedAt: row.deleted_at,
    // Whether *this viewer* liked/saved it is still decided entirely by the
    // localStorage LikeProvider/SaveProvider (CLAUDE.md Bölüm 14) — real
    // per-user like/save rows aren't wired yet (a later Bölüm 21 phase).
    isLiked: false,
    isSaved: false,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Most recent published prompts, for mixing into the feed/discover pages alongside mock + local content. */
export async function fetchRecentPublishedPrompts(limit = 60): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchRecentPublishedPrompts", error);
      return [];
    }
    return filterNotDeleted(filterProfileVisible((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow))));
  } catch (err) {
    // A real network failure (e.g. no route to Supabase) throws instead of
    // resolving with a structured error — without this, a visitor with no
    // connectivity would see the feed hang loading forever instead of
    // gracefully falling back to mock/local content only.
    console.error("fetchRecentPublishedPrompts", err);
    return [];
  }
}

/** A single prompt by id — used when a direct link points at one that fell outside the recent-prompts batch above. RLS hides other users' drafts automatically. */
export async function fetchPromptById(id: string): Promise<Prompt | null> {
  try {
    const { data, error } = await supabase.from("prompts").select(PROMPT_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapPromptRow(data as unknown as PromptRow);
  } catch (err) {
    console.error("fetchPromptById", err);
    return null;
  }
}

/**
 * Every real prompt by one author, newest first — for a real profile page
 * (CLAUDE.md Bölüm 21 Faz 2). RLS (Bölüm 19) already does the right thing
 * here without any extra filtering: a visitor gets only that author's
 * published prompts, while the author viewing their own profile also sees
 * their own drafts.
 */
export async function fetchPromptsByAuthor(authorId: string): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .eq("author_id", authorId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchPromptsByAuthor", error);
      return [];
    }
    return filterNotDeleted(filterProfileVisible((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow))));
  } catch (err) {
    console.error("fetchPromptsByAuthor", err);
    return [];
  }
}

/** Every real answer (a prompt with `origin_type = 'request_response'`) to one real request, newest-first — for the request's detail page (CLAUDE.md Bölüm 21 Faz 5). */
export async function fetchPromptsForRequest(requestId: string): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchPromptsForRequest", error);
      return [];
    }
    return filterNotDeleted((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)));
  } catch (err) {
    console.error("fetchPromptsForRequest", err);
    return [];
  }
}

/** Every real prompt this user has saved, newest-first — for `/saved` and a real own-profile's "Kaydedilenler" tab (CLAUDE.md Bölüm 21 Faz 3). RLS keeps `prompt_saves` private, so this can only ever return the caller's own saves. */
export async function fetchSavedPrompts(userId: string): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_saves")
      .select(`created_at, prompts ( ${PROMPT_SELECT} )`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchSavedPrompts", error);
      return [];
    }
    return filterNotDeleted(
      ((data ?? []) as unknown as { prompts: PromptRow | null }[])
        .map((row) => row.prompts)
        .filter((row): row is PromptRow => Boolean(row))
        .map((row) => mapPromptRow(row)),
    );
  } catch (err) {
    console.error("fetchSavedPrompts", err);
    return [];
  }
}

/** Every real, published prompt by any of these authors, newest-first — for the "Takip Ettiklerim" feed (only ever the viewer's followed authors). */
export async function fetchPromptsByAuthors(authorIds: string[], limit = 60): Promise<Prompt[]> {
  if (authorIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .in("author_id", authorIds)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchPromptsByAuthors", error);
      return [];
    }
    return filterNotDeleted(filterProfileVisible((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow))));
  } catch (err) {
    console.error("fetchPromptsByAuthors", err);
    return [];
  }
}

/** Title/description substring search over published prompts — backs the real `/search` page. */
export async function searchPrompts(query: string, limit = 40): Promise<Prompt[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const escaped = trimmed.replace(/[%,]/g, "");
    const { data, error } = await supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .eq("status", "published")
      .or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("searchPrompts", error);
      return [];
    }
    return filterNotDeleted(filterProfileVisible((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow))));
  } catch (err) {
    console.error("searchPrompts", err);
    return [];
  }
}

/** Every real remix directly sourced from this prompt, newest-first. */
export async function fetchRemixesOf(promptId: string): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .eq("source_prompt_id", promptId)
      .eq("status", "published")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchRemixesOf", error);
      return [];
    }
    return filterNotDeleted((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)));
  } catch (err) {
    console.error("fetchRemixesOf", err);
    return [];
  }
}

/**
 * Walks a real remix chain from the ultimate root down to (and including)
 * `prompt`, one real fetch per link — `root_prompt_id` alone only names the
 * chain's origin, not the intermediate prompts a multi-level remix passed
 * through, so each link has to be fetched to recover its own
 * `source_prompt_id`. Capped to guard against any (should-be-impossible,
 * RLS/FK-enforced) cycle.
 */
export async function fetchRemixChain(prompt: Prompt): Promise<Prompt[]> {
  const chain: Prompt[] = [prompt];
  let current = prompt;
  let guard = 0;
  while (current.origin.type === "remix" && guard < 20) {
    guard += 1;
    const source = await fetchPromptById(current.origin.sourcePromptId);
    if (!source) break;
    chain.unshift(source);
    current = source;
  }
  return chain;
}

/**
 * Deletes a real prompt the caller owns (RLS, Bölüm 19, enforces
 * ownership). Always issues the same plain DELETE — the database itself
 * decides the real outcome (20260919190000_prompt_safe_delete.sql): a
 * prompt with real remixes pointing at it is soft-deleted (content
 * cleared, row survives so the remix chain never breaks) instead of
 * actually removed; one with none is genuinely, permanently deleted.
 */
export async function deleteRealPrompt(promptId: string): Promise<void> {
  const { error } = await supabase.from("prompts").delete().eq("id", promptId);
  if (error) throw new Error(error.message);
}

/** Every real prompt this user has liked, newest-first — for a real own-profile's "Beğeniler" tab. Likes are public (Bölüm 19), but this is always called for "my own" liked list. */
export async function fetchLikedPrompts(userId: string): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_likes")
      .select(`created_at, prompts ( ${PROMPT_SELECT} )`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchLikedPrompts", error);
      return [];
    }
    return filterNotDeleted(
      ((data ?? []) as unknown as { prompts: PromptRow | null }[])
        .map((row) => row.prompts)
        .filter((row): row is PromptRow => Boolean(row))
        .map((row) => mapPromptRow(row)),
    );
  } catch (err) {
    console.error("fetchLikedPrompts", err);
    return [];
  }
}

export interface CreateRealPromptInput {
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  contentType: PromptContentType;
  tags: Tag[];
  /** A real uploaded file, when the author picked one. */
  imageFile: File | null;
  /** Used for `contentType === "image"` when no file was uploaded — the same auto-generated placeholder the live preview already shows. */
  fallbackImage: { url: string; width: number; height: number } | null;
  /** Set only when answering a real request (CLAUDE.md Bölüm 21 Faz 5) — produces `origin_type = 'request_response'` instead of `'original'`, and `handle_prompt_origin_change` (Bölüm 19) increments the request's `response_count`. */
  requestId?: string;
  /** Set only when this is a real remix of a real prompt — produces `origin_type = 'remix'`, and `handle_prompt_origin_change` (Bölüm 19) increments the source's `remix_count`. Mutually exclusive with `requestId`. */
  remixOf?: { sourcePromptId: string; rootPromptId: string };
  /** Only meaningful when `requestId` is set — whether this answer should also appear in the author's normal profile/feed/discover results (`prompts.show_on_profile`). Defaults to `true`; irrelevant for original/remix prompts. */
  showOnProfile?: boolean;
}

/**
 * Genuinely, permanently publishes a prompt: a real row in `public.prompts`
 * (plus `prompt_media`/`prompt_tags`), visible to every visitor per Bölüm
 * 19's RLS policies — not a mock array, not localStorage. Only ever called
 * for `origin: "original"` prompts (plain "Prompt Oluştur" and "Kopyasını
 * Oluştur") and, since Faz 5, answering a real request — see
 * real-prompts-provider.tsx for why remix still doesn't go through here.
 */
export async function createRealPrompt(
  input: CreateRealPromptInput,
  authorId: string,
  authorProfile: UserProfile,
): Promise<Prompt> {
  const { data: inserted, error: insertError } = await supabase
    .from("prompts")
    .insert({
      author_id: authorId,
      title: input.title.trim(),
      description: input.description.trim(),
      prompt_text: input.promptText.trim(),
      tool: input.tool,
      content_type: input.contentType,
      status: "published",
      origin_type: input.remixOf ? "remix" : input.requestId ? "request_response" : "original",
      request_id: input.requestId ?? null,
      source_prompt_id: input.remixOf?.sourcePromptId ?? null,
      root_prompt_id: input.remixOf?.rootPromptId ?? null,
      show_on_profile: input.showOnProfile ?? true,
    })
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Prompt kaydedilemedi.");
  }

  const promptId = inserted.id as string;
  let media: PromptMedia[] = [];

  if (input.contentType === "image") {
    try {
      let descriptor: { url: string; width: number; height: number };

      if (input.imageFile) {
        const resized = await resizeImageToBlob(input.imageFile, 1600);
        const ext = resized.contentType === "image/png" ? "png" : "jpg";
        const path = `${authorId}/${promptId}-0.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("prompt-media")
          .upload(path, resized.blob, { contentType: resized.contentType, upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        const { data: publicUrlData } = supabase.storage.from("prompt-media").getPublicUrl(path);
        descriptor = { url: publicUrlData.publicUrl, width: resized.width, height: resized.height };
      } else if (input.fallbackImage) {
        descriptor = input.fallbackImage;
      } else {
        descriptor = { url: placeholderArt(input.title || promptId, 900, 1100), width: 900, height: 1100 };
      }

      const { data: mediaRow, error: mediaError } = await supabase
        .from("prompt_media")
        .insert({
          prompt_id: promptId,
          url: descriptor.url,
          width: descriptor.width,
          height: descriptor.height,
          alt: input.title,
          position: 0,
        })
        .select("id, url, width, height, alt")
        .single();
      if (mediaError || !mediaRow) throw new Error(mediaError?.message ?? "Görsel kaydedilemedi.");

      media = [
        {
          id: mediaRow.id,
          url: mediaRow.url,
          width: mediaRow.width,
          height: mediaRow.height,
          alt: mediaRow.alt ?? input.title,
        },
      ];
    } catch (err) {
      // Don't leave a half-published image prompt with no image behind.
      await supabase.from("prompts").delete().eq("id", promptId);
      throw err instanceof Error ? err : new Error("Görsel yüklenemedi.");
    }
  }

  if (input.tags.length > 0) {
    // Non-fatal if this fails — the prompt itself is already real and
    // published; missing tags are a lesser problem than losing the post.
    await supabase
      .from("prompt_tags")
      .insert(input.tags.map((tag) => ({ prompt_id: promptId, tag_slug: tag.slug })));
  }

  return {
    id: promptId,
    author: authorProfile,
    title: input.title.trim(),
    description: input.description.trim(),
    promptText: input.promptText.trim(),
    tool: input.tool,
    contentType: input.contentType,
    media,
    tags: input.tags,
    origin: input.remixOf
      ? { type: "remix", sourcePromptId: input.remixOf.sourcePromptId, rootPromptId: input.remixOf.rootPromptId }
      : input.requestId
        ? { type: "request-response", requestId: input.requestId, responseId: promptId }
        : { type: "original" },
    likeCount: 0,
    commentCount: 0,
    remixCount: 0,
    isLiked: false,
    isSaved: false,
    status: "published",
    showOnProfile: input.showOnProfile ?? true,
    deletedAt: null,
    createdAt: inserted.created_at,
  };
}
