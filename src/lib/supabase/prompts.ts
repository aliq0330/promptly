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
  origin_type: "original" | "request_response";
  request_id: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  show_on_profile: boolean;
  deleted_at: string | null;
  generator_id: string | null;
  generator_version_id: string | null;
  generator_run_id: string | null;
  profiles: ProfileRow;
  prompt_media: { id: string; url: string; width: number; height: number; alt: string | null }[];
  prompt_tags: { tags: { slug: string; label: string } }[];
  /** Only present when generator_id is set — the "Generated with" link's title/slug (Generator Builder module). */
  generators: { title: string; slug: string } | null;
}

export const PROMPT_SELECT = `
  id, title, description, prompt_text, tool, content_type, status,
  origin_type, request_id,
  like_count, comment_count, created_at, show_on_profile,
  deleted_at, generator_id, generator_version_id, generator_run_id,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  prompt_media ( id, url, width, height, alt ),
  prompt_tags ( tags ( slug, label ) ),
  generators ( title, slug )
`;

/**
 * Excludes a historically soft-deleted prompt (`deleted_at` set — see
 * 20260919190000_prompt_safe_delete.sql; nothing produces a new one of
 * these anymore since the remix system that trigger protected was fully
 * removed) from a normal listing. Never applied to `fetchPromptById` (a
 * direct link must still resolve to show a "Bu paylaşım silindi." page) —
 * that needs to see the row exists, just emptied.
 */
function filterNotDeleted(prompts: Prompt[]): Prompt[] {
  return prompts.filter((prompt) => !prompt.deletedAt);
}

/**
 * Excludes a request-answer prompt whose author chose to keep it out of
 * normal profile/feed/discover/search results (`show_on_profile = false`)
 * — applied (after mapping) by every query below that represents "this
 * author's normal posts" or a general content stream. Done client-side
 * rather than as a second `.or(...)` query filter: PostgREST ANDs a single
 * `.or()` group with plain column filters just fine, but stacking two
 * independent `.or()` calls in the same query has no clearly documented,
 * verifiable combination behavior — not worth risking on a query that
 * can't be tested against a live Supabase project from this environment.
 * Never applied to `fetchPromptsForRequest` (the request's own answer
 * list) or `fetchPromptById` (a direct link). Irrelevant for original
 * prompts, which always have `show_on_profile = true`.
 */
function filterProfileVisible(prompts: Prompt[]): Prompt[] {
  return prompts.filter((prompt) => prompt.origin.type === "original" || prompt.showOnProfile);
}

function mapOrigin(row: PromptRow): PromptOrigin {
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
    showOnProfile: row.show_on_profile,
    deletedAt: row.deleted_at,
    generatedFrom:
      row.generator_id && row.generator_version_id && row.generator_run_id && row.generators
        ? {
            generatorId: row.generator_id,
            generatorVersionId: row.generator_version_id,
            generatorRunId: row.generator_run_id,
            generatorTitle: row.generators.title,
            generatorSlug: row.generators.slug,
          }
        : null,
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

/**
 * Deletes a real prompt the caller owns (RLS, Bölüm 19, enforces
 * ownership) — a real, permanent DELETE. (The database used to route this
 * through a soft-delete when the prompt still had real remixes pointing at
 * it — Bölüm 9.7 — but that protection existed only for the remix system,
 * which has since been fully removed; every delete is a genuine removal
 * now.)
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
  /**
   * Per-tag source (`manual` | `automatic`), keyed by slug — from the live
   * tag picker (CLAUDE.md Bölüm 9.23 §8/§18: track whether each tag
   * relationship was user-picked or auto-detected). A slug missing from
   * this map (or the map itself being omitted) defaults to `manual` at the
   * database layer.
   */
  tagSources?: Record<string, "manual" | "automatic">;
  /** A real uploaded file, when the author picked one. */
  imageFile: File | null;
  /** Used for `contentType === "image"` when no file was uploaded — the same auto-generated placeholder the live preview already shows. */
  fallbackImage: { url: string; width: number; height: number } | null;
  /** Set only when answering a real request (CLAUDE.md Bölüm 21 Faz 5) — produces `origin_type = 'request_response'` instead of `'original'`, and `handle_prompt_origin_change` (Bölüm 19) increments the request's `response_count`. */
  requestId?: string;
  /** Only meaningful when `requestId` is set — whether this answer should also appear in the author's normal profile/feed/discover results (`prompts.show_on_profile`). Defaults to `true`; irrelevant for an original prompt. */
  showOnProfile?: boolean;
  /** Set only when this prompt is "Open in Prompt" from a real generator run (Generator Builder module) — purely informational provenance, orthogonal to origin/requestId (a generator output is normally `origin: "original"`). `generatorTitle`/`generatorSlug` are only needed to build the immediate return value (the caller already has them from the generator it just ran) — never trusted for anything written to the database. */
  generatedFrom?: { generatorId: string; generatorVersionId: string; generatorRunId: string; generatorTitle: string; generatorSlug: string };
}

/**
 * Genuinely, permanently publishes a prompt: a real row in `public.prompts`
 * (plus `prompt_media`/`prompt_tags`), visible to every visitor per Bölüm
 * 19's RLS policies — not a mock array, not localStorage. Called for
 * `origin: "original"` prompts (plain "Prompt Oluştur" and "Kopyasını
 * Oluştur") and, since Faz 5, answering a real request.
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
      origin_type: input.requestId ? "request_response" : "original",
      request_id: input.requestId ?? null,
      show_on_profile: input.showOnProfile ?? true,
      generator_id: input.generatedFrom?.generatorId ?? null,
      generator_version_id: input.generatedFrom?.generatorVersionId ?? null,
      generator_run_id: input.generatedFrom?.generatorRunId ?? null,
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
    await supabase.from("prompt_tags").insert(
      input.tags.map((tag) => ({
        prompt_id: promptId,
        tag_slug: tag.slug,
        source: input.tagSources?.[tag.slug] ?? "manual",
      })),
    );
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
    origin: input.requestId
      ? { type: "request-response", requestId: input.requestId, responseId: promptId }
      : { type: "original" },
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
    isSaved: false,
    status: "published",
    showOnProfile: input.showOnProfile ?? true,
    deletedAt: null,
    generatedFrom: input.generatedFrom
      ? {
          generatorId: input.generatedFrom.generatorId,
          generatorVersionId: input.generatedFrom.generatorVersionId,
          generatorRunId: input.generatedFrom.generatorRunId,
          generatorTitle: input.generatedFrom.generatorTitle,
          generatorSlug: input.generatedFrom.generatorSlug,
        }
      : null,
    createdAt: inserted.created_at,
  };
}

export interface UpdateRealPromptInput {
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  tags: Tag[];
  tagSources?: Record<string, "manual" | "automatic">;
  /** A real newly-uploaded file, if the owner chose to replace the image — `undefined`/`null` leaves the existing media untouched (unlike creation, editing never invents a placeholder image in its place). Only meaningful for `contentType === "image"`. */
  imageFile?: File | null;
}

/**
 * Genuinely, permanently edits a real prompt the caller owns — the first
 * "edit an existing prompt" capability this app has ever had (see
 * CLAUDE.md's "Prompt Değişken Sistemi" module). Deliberately narrower than
 * creation: `content_type`/`origin` (request-answer relationship) can never
 * change here, and an image is only replaced when a new file is actually
 * provided. Ownership is
 * verified by re-selecting the row after the UPDATE (RLS silently affects 0
 * rows for a non-owner instead of erroring — CLAUDE.md Bölüm 9.0's
 * documented "sessiz no-op" risk class; this function closes that gap for
 * itself instead of assuming success) — a real edit ALSO fires the
 * database's own meaningful-change trigger
 * (`record_prompt_edit`/20260919290000), which is what actually decides
 * whether a `content_edits` row/notification is produced, never this
 * function's own judgement.
 */
export async function updateRealPrompt(promptId: string, authorId: string, input: UpdateRealPromptInput): Promise<Prompt> {
  const { data: updated, error: updateError } = await supabase
    .from("prompts")
    .update({
      title: input.title.trim(),
      description: input.description.trim(),
      prompt_text: input.promptText.trim(),
      tool: input.tool,
    })
    .eq("id", promptId)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("Bu promptu düzenleme yetkin yok.");

  if (input.imageFile) {
    try {
      const resized = await resizeImageToBlob(input.imageFile, 1600);
      const ext = resized.contentType === "image/png" ? "png" : "jpg";
      const path = `${authorId}/${promptId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("prompt-media")
        .upload(path, resized.blob, { contentType: resized.contentType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const { data: publicUrlData } = supabase.storage.from("prompt-media").getPublicUrl(path);

      // Replace-all, same simple pattern as tags/variables below — a prompt
      // only ever has one media row today (a single image), so there's
      // nothing to diff.
      await supabase.from("prompt_media").delete().eq("prompt_id", promptId);
      const { error: mediaError } = await supabase.from("prompt_media").insert({
        prompt_id: promptId,
        url: publicUrlData.publicUrl,
        width: resized.width,
        height: resized.height,
        alt: input.title,
        position: 0,
      });
      if (mediaError) throw new Error(mediaError.message);
    } catch (err) {
      throw err instanceof Error ? err : new Error("Görsel güncellenemedi.");
    }
  }

  // Tags: replace-all (soft-fail, same precedent as createRealPrompt — a
  // tag write failure shouldn't undo an otherwise-successful text edit).
  await supabase.from("prompt_tags").delete().eq("prompt_id", promptId);
  if (input.tags.length > 0) {
    await supabase.from("prompt_tags").insert(
      input.tags.map((tag) => ({
        prompt_id: promptId,
        tag_slug: tag.slug,
        source: input.tagSources?.[tag.slug] ?? "manual",
      })),
    );
  }

  const fresh = await fetchPromptById(promptId);
  if (!fresh) throw new Error("Prompt güncellendi ama yeniden yüklenemedi.");
  return fresh;
}
