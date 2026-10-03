import { normalizeToolRefs } from "@/lib/ai-tool-catalog";
import { supabase } from "./client";
import { withoutBlocked } from "./blocked-users";
import { applyKeysetCursor, nextCursorFrom, type KeysetCursor } from "./pagination";
import { placeholderArt } from "@/lib/placeholder-image";
import { resizeImageToBlob } from "@/lib/utils";
import { translateForRuntime } from "@/lib/i18n/translations";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { resolveMediaInputs, type MediaInput } from "./media-input";
import { normalizeLegacyContentType, sanitizeTaxonomy } from "@/lib/content-taxonomy";
import { applyTaxonomyFilter, taxonomyColumns, type ContentSearchFilters, applyAdvancedFilters, hasSearchFilter, sanitizeSearchText, tagJoinSelect } from "./taxonomy-query";
import type { ContentVisibility, Prompt, PromptContentType, PromptMedia, PromptOrigin, Tag, UserProfile } from "@/types";

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
  tools: string[] | null;
  content_type: string;
  category: string | null;
  subcategory: string | null;
  status: "draft" | "published";
  origin_type: "original" | "request_response";
  request_id: string | null;
  like_count: number;
  save_count: number;
  comment_count: number;
  created_at: string;
  show_on_profile: boolean;
  visibility: "public" | "private";
  deleted_at: string | null;
  generator_id: string | null;
  generator_version_id: string | null;
  generator_run_id: string | null;
  profiles: ProfileRow;
  prompt_media: { id: string; url: string; width: number; height: number; alt: string | null; position: number }[];
  prompt_tags: { tags: { slug: string; label: string } }[];
  /** Only present when generator_id is set — the "Generated with" link's title/slug (Generator Builder module). */
  generators: { title: string; slug: string } | null;
}

export const PROMPT_SELECT = `
  id, title, description, prompt_text, tool, tools, content_type, category, subcategory, status,
  origin_type, request_id,
  like_count, save_count, comment_count, created_at, show_on_profile, visibility,
  deleted_at, generator_id, generator_version_id, generator_run_id,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  prompt_media ( id, url, width, height, alt, position ),
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
  return prompts.filter((prompt) => !prompt.deletedAt && prompt.status !== "draft");
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
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ id: m.id, url: m.url, width: m.width, height: m.height, alt: m.alt ?? row.title }));
  const tags: Tag[] = (row.prompt_tags ?? []).map((pt) => ({ slug: pt.tags.slug, label: pt.tags.label }));
  // Rows written before the 4-type taxonomy may still say code/music — read them as their new type.
  const { contentType, category } = normalizeLegacyContentType(row.content_type);

  return {
    id: row.id,
    author: mapProfileRow(row.profiles),
    title: row.title,
    description: row.description,
    promptText: row.prompt_text,
    tool: row.tool,
    tools: normalizeToolRefs(row.tools),
    contentType,
    ...sanitizeTaxonomy(contentType, row.category ?? category, row.subcategory),
    media,
    tags,
    origin: mapOrigin(row),
    likeCount: row.like_count,
    saveCount: row.save_count,
    commentCount: row.comment_count,
    showOnProfile: row.show_on_profile,
    visibility: row.visibility ?? "public",
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

export interface PromptsPage {
  items: Prompt[];
  /** Pass this back as `cursor` to fetch the next page; `null` once there's nothing left. */
  nextCursor: KeysetCursor | null;
}

/**
 * Most recent published prompts, keyset-paginated by `created_at`/`id` — the
 * real "Daha fazla yükle" source behind `/prompts`'s browse view (and the
 * feed/discover pages' initial, unfiltered load). `withoutBlocked`/
 * `filterNotDeleted`/`filterProfileVisible` run AFTER the DB query, so a
 * page can legitimately come back with fewer items than `limit` even when
 * more real rows exist further back — `nextCursor` is derived from the raw
 * DB rows (before that filtering), never from `items.length`, so "load
 * more" still reaches them on the next call.
 */
export async function fetchRecentPublishedPrompts(limit = 24, cursor?: KeysetCursor): Promise<PromptsPage> {
  try {
    const request = applyKeysetCursor(
      supabase
        .from("prompts")
        .select(PROMPT_SELECT)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
      "created_at",
      cursor,
    );
    const { data, error } = await request;
    if (error) {
      console.error("fetchRecentPublishedPrompts", error);
      return { items: [], nextCursor: null };
    }
    const rows = (data ?? []) as unknown as PromptRow[];
    const items = await withoutBlocked(filterNotDeleted(filterProfileVisible(rows.map(mapPromptRow))), (p) => p.author.id);
    return { items, nextCursor: nextCursorFrom(rows, limit, (row) => row.created_at) };
  } catch (err) {
    // A real network failure (e.g. no route to Supabase) throws instead of
    // resolving with a structured error — without this, a visitor with no
    // connectivity would see the feed hang loading forever instead of
    // gracefully falling back gracefully.
    console.error("fetchRecentPublishedPrompts", err);
    return { items: [], nextCursor: null };
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
    return withoutBlocked(filterNotDeleted((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow))), (p) => p.author.id);
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
    return withoutBlocked(filterNotDeleted(filterProfileVisible((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)))), (p) => p.author.id);
  } catch (err) {
    console.error("fetchPromptsByAuthors", err);
    return [];
  }
}

/** Title/description substring search over published prompts — backs the real `/search` page. */
export async function searchPrompts(query: string, filters: ContentSearchFilters = {}, limit = 40): Promise<Prompt[]> {
  const escaped = sanitizeSearchText(query);
  if (!escaped && !hasSearchFilter(filters)) return [];
  try {
    let request = supabase
      .from("prompts")
      .select(PROMPT_SELECT + tagJoinSelect("prompt_tags", filters.tagSlugs))
      .eq("status", "published");
    if (escaped) request = request.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    if (filters.authorId) request = request.eq("author_id", filters.authorId);
    request = applyAdvancedFilters(applyTaxonomyFilter(request, filters.taxonomy), filters, "author_id");
    const { data, error } = await request
      .order(filters.sort === "popular" ? "like_count" : "created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("searchPrompts", error);
      return [];
    }
    return withoutBlocked(filterNotDeleted(filterProfileVisible((data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)))), (p) => p.author.id);
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
  tools?: string[];
  contentType: PromptContentType;
  category?: string | null;
  subcategory?: string | null;
  tags: Tag[];
  /**
   * Per-tag source (`manual` | `automatic`), keyed by slug — from the live
   * tag picker (CLAUDE.md Bölüm 9.23 §8/§18: track whether each tag
   * relationship was user-picked or auto-detected). A slug missing from
   * this map (or the map itself being omitted) defaults to `manual` at the
   * database layer.
   */
  tagSources?: Record<string, "manual" | "automatic">;
  /**
   * Zero or more images, in the order the author arranged them — only
   * meaningful for `contentType === "image"`. Empty falls back to the same
   * auto-generated placeholder the live preview already shows (one row).
   */
  images: MediaInput[];
  /** Set only when answering a real request (CLAUDE.md Bölüm 21 Faz 5) — produces `origin_type = 'request_response'` instead of `'original'`, and `handle_prompt_origin_change` (Bölüm 19) increments the request's `response_count`. */
  requestId?: string;
  /** Only meaningful when `requestId` is set — whether this answer should also appear in the author's normal profile/feed/discover results (`prompts.show_on_profile`). Defaults to `true`; irrelevant for an original prompt. */
  showOnProfile?: boolean;
  /** Set only when this prompt is "Open in Prompt" from a real generator run (Generator Builder module) — purely informational provenance, orthogonal to origin/requestId (a generator output is normally `origin: "original"`). `generatorTitle`/`generatorSlug` are only needed to build the immediate return value (the caller already has them from the generator it just ran) — never trusted for anything written to the database. */
  generatedFrom?: { generatorId: string; generatorVersionId: string; generatorRunId: string; generatorTitle: string; generatorSlug: string };
  /** "Herkese açık" (default) or "Sadece ben" (`prompts.visibility`); a request answer is always public so the request's owner can see it. */
  visibility?: ContentVisibility;
  /** Saves as a private draft (`status = 'draft'`) instead of publishing — only the author can see it until `publish` is set on an edit. */
  isDraft?: boolean;
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
      tools: input.tools ?? [],
      content_type: input.contentType,
      ...taxonomyColumns(input.contentType, input.category, input.subcategory),
      status: input.isDraft ? "draft" : "published",
      origin_type: input.requestId ? "request_response" : "original",
      request_id: input.requestId ?? null,
      show_on_profile: input.showOnProfile ?? true,
      visibility: input.visibility ?? "public",
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
      const resolved = await resolveMediaInputs(input.images, input.title, async (file, index) => {
        const resized = await resizeImageToBlob(file, 1600);
        const ext = resized.contentType === "image/png" ? "png" : "jpg";
        const path = `${authorId}/${promptId}-${index}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("prompt-media")
          .upload(path, resized.blob, { contentType: resized.contentType, upsert: true });
        if (uploadError) throw new Error(uploadError.message);
        const { data: publicUrlData } = supabase.storage.from("prompt-media").getPublicUrl(path);
        return { url: publicUrlData.publicUrl, width: resized.width, height: resized.height };
      });

      const descriptors =
        resolved.length > 0
          ? resolved
          : [{ url: placeholderArt(input.title || promptId, 900, 1100), width: 900, height: 1100, alt: input.title }];

      const { data: mediaRows, error: mediaError } = await supabase
        .from("prompt_media")
        .insert(
          descriptors.map((d, index) => ({
            prompt_id: promptId,
            url: d.url,
            width: d.width,
            height: d.height,
            alt: d.alt,
            position: index,
          })),
        )
        .select("id, url, width, height, alt");
      if (mediaError || !mediaRows) throw new Error(mediaError?.message ?? translateForRuntime("prompt.imageSaveFailed"));

      media = mediaRows.map((row) => ({
        id: row.id,
        url: row.url,
        width: row.width,
        height: row.height,
        alt: row.alt ?? input.title,
      }));
    } catch (err) {
      // Don't leave a half-published image prompt with no image behind.
      await supabase.from("prompts").delete().eq("id", promptId);
      throw err instanceof Error ? err : new Error(translateForRuntime("prompt.imageUploadFailedShort"));
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
    tools: input.tools ?? [],
    contentType: input.contentType,
    ...sanitizeTaxonomy(input.contentType, input.category, input.subcategory),
    media,
    tags: input.tags,
    origin: input.requestId
      ? { type: "request-response", requestId: input.requestId, responseId: promptId }
      : { type: "original" },
    likeCount: 0,
    saveCount: 0,
    commentCount: 0,
    isLiked: false,
    isSaved: false,
    status: input.isDraft ? "draft" : "published",
    showOnProfile: input.showOnProfile ?? true,
    visibility: input.visibility ?? "public",
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
  /** Taxonomy level(s) — `undefined` leaves the columns untouched, `null` clears them. `content_type` itself is never editable. */
  category?: string | null;
  subcategory?: string | null;
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  tools?: string[];
  tags: Tag[];
  tagSources?: Record<string, "manual" | "automatic">;
  /**
   * The full, final ordered set of images if the owner changed anything
   * about them (added/removed/reordered) — `undefined` leaves the existing
   * media completely untouched (unlike creation, editing never invents a
   * placeholder image in its place). Replace-all, same as creation. Only
   * meaningful for `contentType === "image"`.
   */
  images?: MediaInput[];
  /** Only meaningful for a `request-response` prompt (an answer to a request) — whether it should also appear in the author's normal profile/feed/discover/search results (`prompts.show_on_profile`). `undefined` leaves the column untouched (an `original` prompt is never editable here anyway, so callers editing one simply omit this). */
  showOnProfile?: boolean;
  /** `undefined` leaves the column untouched. */
  visibility?: ContentVisibility;
  /** Publishes a draft (`status` draft → published) once everything else is saved; the database then restarts `created_at` and counts its tags. */
  publish?: boolean;
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
      ...(input.tools === undefined ? {} : { tools: input.tools }),
      ...(input.category === undefined ? {} : { category: input.category, subcategory: input.subcategory ?? null }),
      ...(input.showOnProfile === undefined ? {} : { show_on_profile: input.showOnProfile }),
      ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
    })
    .eq("id", promptId)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error(translateForRuntime("prompt.noEditPermission"));

  if (input.images) {
    try {
      // A fresh timestamp prefix (rather than `-{index}`) avoids colliding
      // with any surviving `.existing` upload at the same index — this is a
      // replace-all, so the old rows (and their storage objects, orphaned
      // but harmless/invisible once nothing points at them) are gone the
      // moment the new `prompt_media` rows are inserted below.
      const stamp = Date.now();
      const resolved = await resolveMediaInputs(input.images, input.title, async (file, index) => {
        const resized = await resizeImageToBlob(file, 1600);
        const ext = resized.contentType === "image/png" ? "png" : "jpg";
        const path = `${authorId}/${promptId}-${stamp}-${index}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("prompt-media")
          .upload(path, resized.blob, { contentType: resized.contentType, upsert: true });
        if (uploadError) throw new Error(uploadError.message);
        const { data: publicUrlData } = supabase.storage.from("prompt-media").getPublicUrl(path);
        return { url: publicUrlData.publicUrl, width: resized.width, height: resized.height };
      });

      await supabase.from("prompt_media").delete().eq("prompt_id", promptId);
      if (resolved.length > 0) {
        const { error: mediaError } = await supabase.from("prompt_media").insert(
          resolved.map((d, index) => ({
            prompt_id: promptId,
            url: d.url,
            width: d.width,
            height: d.height,
            alt: d.alt,
            position: index,
          })),
        );
        if (mediaError) throw new Error(mediaError.message);
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error(translateForRuntime("prompt.imageUpdateFailed"));
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

  if (input.publish) {
    // Last on purpose: the publish trigger counts the tags written above.
    const { error: publishError } = await supabase.from("prompts").update({ status: "published" }).eq("id", promptId).eq("status", "draft");
    if (publishError) throw new Error(publishError.message);
  }

  const fresh = await fetchPromptById(promptId);
  if (!fresh) throw new Error(translateForRuntime("prompt.updatedButReloadFailed"));
  return fresh;
}
