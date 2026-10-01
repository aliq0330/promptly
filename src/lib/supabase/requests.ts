import { normalizeToolRefs } from "@/lib/ai-tool-catalog";
import { supabase } from "./client";
import { withoutBlocked } from "./blocked-users";
import { applyKeysetCursor, nextCursorFrom, type KeysetCursor } from "./pagination";
import { resizeImageToBlob } from "@/lib/utils";
import { translateForRuntime } from "@/lib/i18n/translations";
import { normalizeLegacyContentType, sanitizeTaxonomy } from "@/lib/content-taxonomy";
import { applyAdvancedFilters, applyTaxonomyFilter, hasSearchFilter, sanitizeSearchText, tagJoinSelect, taxonomyColumns, type ContentSearchFilters } from "./taxonomy-query";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { PromptContentType, PromptRequest, PromptRequestStatus, Tag } from "@/types";

/**
 * Hand-written mirror of the `public.prompt_requests` row shape — see
 * supabase/migrations/20260919120200_prompts_and_requests.sql. Kept in
 * sync by hand, same as prompts.ts's PromptRow.
 */
export interface RequestRow {
  id: string;
  title: string;
  description: string;
  creative_direction: string | null;
  preferred_tool: string | null;
  tools: string[] | null;
  content_type: string | null;
  category: string | null;
  subcategory: string | null;
  reference_image_url: string | null;
  reference_image_width: number | null;
  reference_image_height: number | null;
  status: PromptRequestStatus;
  selected_response_prompt_id: string | null;
  response_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  deleted_at: string | null;
  is_draft: boolean;
  profiles: ProfileRow;
  prompt_request_tags: { tags: { slug: string; label: string } }[];
}

export const REQUEST_SELECT = `
  id, title, description, creative_direction, preferred_tool, tools, content_type, category, subcategory,
  reference_image_url, reference_image_width, reference_image_height,
  status, selected_response_prompt_id, response_count, like_count, comment_count, created_at, deleted_at, is_draft,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  prompt_request_tags ( tags ( slug, label ) )
`;

/**
 * Excludes a soft-deleted request (`deleted_at` set — see
 * 20260919350000_request_safe_delete.sql) from normal listings, mirroring
 * `filterNotDeleted()` in prompts.ts. Deliberately NOT applied to
 * `fetchRequestById` — a direct link must still resolve the row so
 * `LocalRequestView` can render its honest "Bu istek silindi" placeholder
 * instead of a generic "not found".
 */
function filterNotDeleted(requests: PromptRequest[]): PromptRequest[] {
  return requests.filter((request) => !request.deletedAt && !request.isDraft);
}

export function mapRequestRow(row: RequestRow): PromptRequest {
  const tags: Tag[] = (row.prompt_request_tags ?? []).map((rt) => ({ slug: rt.tags.slug, label: rt.tags.label }));
  // Rows written before the 4-type taxonomy may still say code/music — read them as their new type.
  const legacy = row.content_type ? normalizeLegacyContentType(row.content_type) : null;
  return {
    id: row.id,
    author: mapProfileRow(row.profiles),
    title: row.title,
    description: row.description,
    creativeDirection: row.creative_direction ?? "",
    preferredTool: row.preferred_tool,
    tools: normalizeToolRefs(row.tools),
    contentType: legacy?.contentType,
    ...(legacy ? sanitizeTaxonomy(legacy.contentType, row.category ?? legacy.category, row.subcategory) : { category: null, subcategory: null }),
    referenceImage: row.reference_image_url
      ? {
          id: `${row.id}-reference`,
          url: row.reference_image_url,
          width: row.reference_image_width ?? 0,
          height: row.reference_image_height ?? 0,
          alt: row.title,
        }
      : undefined,
    tags,
    status: row.status,
    responseCount: row.response_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    createdAt: row.created_at,
    selectedResponsePromptId: row.selected_response_prompt_id ?? undefined,
    deletedAt: row.deleted_at,
    isDraft: row.is_draft ?? false,
  };
}

export interface RequestsPage {
  items: PromptRequest[];
  nextCursor: KeysetCursor | null;
}

/**
 * Most recent requests (any status), keyset-paginated by `created_at`/`id` —
 * the real "Daha fazla yükle" source behind `/requests`'s browse view (and
 * the feed/discover pages' initial, unfiltered load). See `prompts.ts`'s
 * `fetchRecentPublishedPrompts` for why `nextCursor` is derived from the raw
 * DB rows rather than from `items.length`.
 */
export async function fetchRecentRequests(limit = 24, cursor?: KeysetCursor): Promise<RequestsPage> {
  try {
    const request = applyKeysetCursor(
      supabase
        .from("prompt_requests")
        .select(REQUEST_SELECT)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
      "created_at",
      cursor,
    );
    const { data, error } = await request;
    if (error) {
      console.error("fetchRecentRequests", error);
      return { items: [], nextCursor: null };
    }
    const rows = (data ?? []) as unknown as RequestRow[];
    const items = await withoutBlocked(filterNotDeleted(rows.map(mapRequestRow)), (r) => r.author.id);
    return { items, nextCursor: nextCursorFrom(rows, limit, (row) => row.created_at) };
  } catch (err) {
    console.error("fetchRecentRequests", err);
    return { items: [], nextCursor: null };
  }
}

/** Text and/or taxonomy/author search over real requests (same filter shape as prompts/generators). */
export async function searchRequests(query: string, filters: ContentSearchFilters = {}, limit = 40): Promise<PromptRequest[]> {
  const escaped = sanitizeSearchText(query);
  if (!escaped && !hasSearchFilter(filters)) return [];
  try {
    let request = supabase.from("prompt_requests").select(REQUEST_SELECT + tagJoinSelect("prompt_request_tags", filters.tagSlugs));
    if (escaped) request = request.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    if (filters.authorId) request = request.eq("author_id", filters.authorId);
    request = applyAdvancedFilters(applyTaxonomyFilter(request, filters.taxonomy), filters, "author_id");
    const { data, error } = await request
      .order(filters.sort === "popular" ? "response_count" : "created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("searchRequests", error);
      return [];
    }
    return withoutBlocked(filterNotDeleted(((data ?? []) as unknown as RequestRow[]).map(mapRequestRow)), (r) => r.author.id);
  } catch (err) {
    console.error("searchRequests", err);
    return [];
  }
}

/** A single request by id — for a direct link that fell outside the recent-requests batch above. */
export async function fetchRequestById(id: string): Promise<PromptRequest | null> {
  try {
    const { data, error } = await supabase.from("prompt_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapRequestRow(data as unknown as RequestRow);
  } catch (err) {
    console.error("fetchRequestById", err);
    return null;
  }
}

/**
 * Every real request by one author, newest-first — for that profile's
 * own "Prompt İstekleri" section. Requests have no draft/private concept
 * (unlike prompts) — every request is always fully public per Bölüm 19's
 * RLS ("Requests are publicly readable"), so this is safe to call for any
 * profile, not just the viewer's own.
 */
export async function fetchRequestsByAuthor(authorId: string): Promise<PromptRequest[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_requests")
      .select(REQUEST_SELECT)
      .eq("author_id", authorId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchRequestsByAuthor", error);
      return [];
    }
    return filterNotDeleted(((data ?? []) as unknown as RequestRow[]).map(mapRequestRow));
  } catch (err) {
    console.error("fetchRequestsByAuthor", err);
    return [];
  }
}

export interface CreateRealRequestInput {
  title: string;
  description: string;
  creativeDirection: string;
  contentType: PromptContentType;
  category?: string | null;
  subcategory?: string | null;
  preferredTool: string | null;
  tools?: string[];
  tags: Tag[];
  /** Per-tag source (`manual` | `automatic`), keyed by slug — see `CreateRealPromptInput.tagSources` (Bölüm 9.23). */
  tagSources?: Record<string, "manual" | "automatic">;
  /** A real uploaded file, when the requester picked one. */
  imageFile: File | null;
  /** Saves as a private draft (`is_draft = true`) instead of publishing. */
  isDraft?: boolean;
}

/**
 * Genuinely, permanently publishes a prompt request: a real row in
 * `public.prompt_requests` (plus `prompt_request_tags`), visible to every
 * visitor per Bölüm 19's RLS policies — not a mock array or localStorage.
 */
export async function createRealRequest(
  input: CreateRealRequestInput,
  authorId: string,
  authorProfile: PromptRequest["author"],
): Promise<PromptRequest> {
  let referenceImage: { url: string; width: number; height: number } | null = null;

  if (input.imageFile) {
    const resized = await resizeImageToBlob(input.imageFile, 1000);
    const ext = resized.contentType === "image/png" ? "png" : "jpg";
    const path = `${authorId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("request-references")
      .upload(path, resized.blob, { contentType: resized.contentType, upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    const { data: publicUrlData } = supabase.storage.from("request-references").getPublicUrl(path);
    referenceImage = { url: publicUrlData.publicUrl, width: resized.width, height: resized.height };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("prompt_requests")
    .insert({
      author_id: authorId,
      title: input.title.trim(),
      description: input.description.trim(),
      creative_direction: input.creativeDirection.trim() || null,
      preferred_tool: input.preferredTool,
      tools: input.tools ?? [],
      content_type: input.contentType,
      ...taxonomyColumns(input.contentType, input.category, input.subcategory),
      reference_image_url: referenceImage?.url ?? null,
      reference_image_width: referenceImage?.width ?? null,
      reference_image_height: referenceImage?.height ?? null,
      is_draft: input.isDraft ?? false,
    })
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? translateForRuntime("request.saveFailed"));
  }

  const requestId = inserted.id as string;

  if (input.tags.length > 0) {
    await supabase.from("prompt_request_tags").insert(
      input.tags.map((tag) => ({
        request_id: requestId,
        tag_slug: tag.slug,
        source: input.tagSources?.[tag.slug] ?? "manual",
      })),
    );
  }

  return {
    id: requestId,
    author: authorProfile,
    title: input.title.trim(),
    description: input.description.trim(),
    creativeDirection: input.creativeDirection.trim(),
    preferredTool: input.preferredTool,
    tools: input.tools ?? [],
    contentType: input.contentType,
    ...sanitizeTaxonomy(input.contentType, input.category, input.subcategory),
    referenceImage: referenceImage
      ? { id: `${requestId}-reference`, url: referenceImage.url, width: referenceImage.width, height: referenceImage.height, alt: input.title }
      : undefined,
    tags: input.tags,
    status: "open",
    responseCount: 0,
    likeCount: 0,
    commentCount: 0,
    createdAt: inserted.created_at,
    deletedAt: null,
    isDraft: input.isDraft ?? false,
  };
}

export interface UpdateRealRequestInput {
  /** Taxonomy level(s) — `undefined` leaves the columns untouched, `null` clears them. `content_type` itself is never editable. */
  category?: string | null;
  subcategory?: string | null;
  title: string;
  description: string;
  creativeDirection: string;
  preferredTool: string | null;
  tools?: string[];
  tags: Tag[];
  tagSources?: Record<string, "manual" | "automatic">;
  /** Publishes a draft (`is_draft` → false) once everything else is saved; the database then restarts `created_at` and counts its tags. */
  publish?: boolean;
}

/**
 * Genuinely, permanently edits a real request the caller owns — the first
 * "edit an existing request" capability this app has ever had (Bölüm 21 Faz
 * 5/9.2 deliberately left this out; the "Prompt Değişken Sistemi" module
 * adds it for real). Deliberately narrow: `content_type`/`status`/
 * `selected_response_prompt_id`/`reference_image_*` are never touched here
 * — those have their own dedicated, already-working flows
 * (`updateRealRequestStatus`/`selectRealRequestResponse`), and mixing them
 * into a generic "edit" would blur exactly the distinction CLAUDE.md's own
 * `record_request_edit` trigger is built to keep clean. Ownership is
 * verified by re-selecting the row after the UPDATE, same as
 * `updateRealPrompt` — a non-owner's call fails loudly instead of RLS's
 * silent 0-rows-affected.
 */
export async function updateRealRequest(requestId: string, input: UpdateRealRequestInput): Promise<PromptRequest> {
  const { data: updated, error: updateError } = await supabase
    .from("prompt_requests")
    .update({
      title: input.title.trim(),
      description: input.description.trim(),
      creative_direction: input.creativeDirection.trim() || null,
      preferred_tool: input.preferredTool,
      ...(input.tools === undefined ? {} : { tools: input.tools }),
      ...(input.category === undefined ? {} : { category: input.category, subcategory: input.subcategory ?? null }),
    })
    .eq("id", requestId)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error(translateForRuntime("request.noEditPermission"));

  await supabase.from("prompt_request_tags").delete().eq("request_id", requestId);
  if (input.tags.length > 0) {
    await supabase.from("prompt_request_tags").insert(
      input.tags.map((tag) => ({
        request_id: requestId,
        tag_slug: tag.slug,
        source: input.tagSources?.[tag.slug] ?? "manual",
      })),
    );
  }

  if (input.publish) {
    // Last on purpose: the publish trigger counts the tags written above.
    const { error: publishError } = await supabase.from("prompt_requests").update({ is_draft: false }).eq("id", requestId).eq("is_draft", true);
    if (publishError) throw new Error(publishError.message);
  }

  const fresh = await fetchRequestById(requestId);
  if (!fresh) throw new Error(translateForRuntime("request.updatedButReloadFailed"));
  return fresh;
}

/**
 * Genuinely, permanently opens/closes a real request MANUALLY (the
 * "İsteği kapat"/"Açık olarak işaretle" toggle) — distinct from a request
 * auto-closing because a response got selected (`selectRealRequestResponse`
 * below). Only ever called with `"open"`/`"closed"`, never `"answered"` —
 * the UI hides this toggle whenever a response is currently selected (see
 * `RequestDetailView`), and the database's own `prompt_requests_status_
 * shape` CHECK constraint (Bölüm 21 prompt-request hardening) would reject
 * an attempt to set `"closed"`/`"open"` while a selection still exists
 * anyway. `closed_by_owner` records that this was a deliberate manual
 * close, so that later selecting-then-clearing a response doesn't
 * accidentally reopen it (see the RPC below).
 */
export async function updateRealRequestStatus(
  requestId: string,
  status: Extract<PromptRequestStatus, "open" | "closed">,
): Promise<void> {
  // `.select()` so a silent RLS "0 rows affected" surfaces as an error
  // instead of the UI reporting success on an unchanged row.
  const { data, error } = await supabase
    .from("prompt_requests")
    .update({ status, closed_by_owner: status === "closed" })
    .eq("id", requestId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(translateForRuntime("request.noEditPermission"));
}

/** Genuinely, permanently deletes a real request the caller owns. */
export async function deleteRealRequest(requestId: string): Promise<void> {
  const { data, error } = await supabase.from("prompt_requests").delete().eq("id", requestId).select("id");
  if (error) throw new Error(error.message);
  if (data && data.length > 0) return;
  // A request with real answers is soft-deleted by a BEFORE DELETE trigger
  // (the DELETE itself reports 0 rows) — that's a success. Anything else
  // with 0 rows means RLS silently refused.
  const { data: remaining } = await supabase
    .from("prompt_requests")
    .select("id, deleted_at")
    .eq("id", requestId)
    .maybeSingle();
  if (remaining && !(remaining as { deleted_at: string | null }).deleted_at) {
    throw new Error(translateForRuntime("request.noEditPermission"));
  }
}

/**
 * Genuinely, permanently selects, changes, or clears (`promptId = null`)
 * a real request's chosen answer — via the `select_prompt_request_
 * response` RPC (Bölüm 21 prompt-request hardening), not a direct
 * `.update()`. That function does, atomically and server-side, everything
 * a direct update couldn't safely do on its own: verifies the caller
 * actually owns the request (a clear error instead of RLS's silent
 * "0 rows affected"), verifies the chosen prompt is genuinely a real
 * answer to *this* request (never some unrelated prompt), and — the part
 * that matters most — decides the right status to fall back to when
 * clearing a selection: `'open'` normally, but `'closed'` if the owner
 * had manually closed the request before ever selecting a response, so
 * that clearing a selection can never accidentally reopen a request the
 * owner deliberately closed.
 */
export async function selectRealRequestResponse(
  requestId: string,
  promptId: string | null,
): Promise<{ status: PromptRequestStatus; selectedResponsePromptId?: string }> {
  const { data, error } = await supabase.rpc("select_prompt_request_response", {
    p_request_id: requestId,
    p_response_prompt_id: promptId,
  });
  if (error || !data) throw new Error(error?.message ?? translateForRuntime("request.responseSelectFailed"));
  const row = data as { status: PromptRequestStatus; selected_response_prompt_id: string | null };
  return { status: row.status, selectedResponsePromptId: row.selected_response_prompt_id ?? undefined };
}
