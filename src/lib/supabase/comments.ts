import { supabase } from "./client";
import { chunk, fetchAllRows } from "./paged";
import { withoutBlocked } from "./blocked-users";
import { translateForRuntime } from "@/lib/i18n/translations";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { extrasColumns, mapCommentAttachment, mapCommentMedia, type CommentExtrasInput } from "@/lib/comment-extras-model";
import type { PromptComment } from "@/types";

interface CommentRow {
  id: string;
  body: string;
  parent_id: string | null;
  like_count: number;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  rating?: number | null;
  space_activity_id?: string | null;
  /** Yorum medyası/eki (docs/history/307-*): sütunlar yoksa (migration gecikti) gelmez. */
  media_kind?: string | null;
  media_ref?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  attach_type?: string | null;
  attach_id?: string | null;
  profiles: ProfileRow;
}

const COMMENT_SELECT = `
  id, body, parent_id, like_count, created_at, edited_at, deleted_at, rating, space_activity_id, media_kind, media_ref, media_width, media_height, attach_type, attach_id,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

export type CommentExtras = CommentExtrasInput;
export { mapCommentAttachment, mapCommentMedia };

function mapCommentRow(
  row: CommentRow,
  target: { promptId: string } | { requestId: string } | { resultId: string } | { workflowId: string } | { presetId: string } | { communityPostId: string } | { spaceId: string } | { quoteId: string },
): PromptComment {
  return {
    id: row.id,
    ...target,
    author: mapProfileRow(row.profiles),
    body: row.body,
    parentId: row.parent_id,
    likeCount: row.like_count,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    rating: row.rating ?? null,
    ...(row.space_activity_id ? { spaceActivityId: row.space_activity_id } : {}),
    media: mapCommentMedia(row),
    attachment: mapCommentAttachment(row),
  };
}

/** Genuinely, permanently posts a comment on a real request. */
export async function postCommentOnRequest(
  requestId: string,
  authorId: string,
  body: string,
  parentId: string | null,
  extras?: CommentExtras,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ request_id: requestId, author_id: authorId, body, parent_id: parentId, ...extrasColumns(extras) })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Yorum eklenemedi.");
  return mapCommentRow(data as unknown as CommentRow, { requestId });
}

/** Genuinely, permanently posts a comment on a real prompt. `handle_prompt_comment_change` (Bölüm 19) keeps `prompts.comment_count` in sync, even across users. */
export async function postCommentOnPrompt(
  promptId: string,
  authorId: string,
  body: string,
  parentId: string | null,
  extras?: CommentExtras,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ prompt_id: promptId, author_id: authorId, body, parent_id: parentId, ...extrasColumns(extras) })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Yorum eklenemedi.");
  return mapCommentRow(data as unknown as CommentRow, { promptId });
}

/** Genuinely, permanently posts a comment on a real Kullanıcı Sonucu. `handle_prompt_comment_change` keeps `prompt_results.comment_count` in sync, even across users. */
export async function postCommentOnResult(
  resultId: string,
  authorId: string,
  body: string,
  parentId: string | null,
  extras?: CommentExtras,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ result_id: resultId, author_id: authorId, body, parent_id: parentId, ...extrasColumns(extras) })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Yorum eklenemedi.");
  return mapCommentRow(data as unknown as CommentRow, { resultId });
}

/** Genuinely, permanently posts a comment on a real preset. `handle_prompt_comment_change` keeps `presets.comment_count` in sync, even across users. */
export async function postCommentOnPreset(
  presetId: string,
  authorId: string,
  body: string,
  parentId: string | null,
  extras?: CommentExtras,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ preset_id: presetId, author_id: authorId, body, parent_id: parentId, ...extrasColumns(extras) })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? translateForRuntime("comments.postFailed"));
  return mapCommentRow(data as unknown as CommentRow, { presetId });
}

/** Genuinely, permanently posts a comment on a real workflow. `handle_prompt_comment_change` keeps `workflows.comment_count` in sync, even across users. */
export async function postCommentOnWorkflow(
  workflowId: string,
  authorId: string,
  body: string,
  parentId: string | null,
  extras?: CommentExtras,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ workflow_id: workflowId, author_id: authorId, body, parent_id: parentId, ...extrasColumns(extras) })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? translateForRuntime("comments.postFailed"));
  return mapCommentRow(data as unknown as CommentRow, { workflowId });
}

/** Topluluk gönderisine yorum: yalnız topluluk üyesi (sunucu tetikleyicisi doğrular). `handle_prompt_comment_change` `community_posts.comment_count`'u tutar. */
export async function postCommentOnCommunityPost(
  communityPostId: string,
  authorId: string,
  body: string,
  parentId: string | null,
  extras?: CommentExtras,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ community_post_id: communityPostId, author_id: authorId, body, parent_id: parentId, ...extrasColumns(extras) })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? translateForRuntime("comments.postFailed"));
  return mapCommentRow(data as unknown as CommentRow, { communityPostId });
}

/** Sunucunun bilerek fırlattığı Space yorum kodları (rating tekilliği, sahip, arşiv) kullanıcıya çevrilir. */
function spaceCommentError(error: { message?: string } | null): Error {
  const message = error?.message ?? "";
  if (/prompt_comments_space_rating_uniq/.test(message)) return new Error(translateForRuntime("comments.error.alreadyRated"));
  if (/space_rating_owner/.test(message)) return new Error(translateForRuntime("comments.error.ratingOwner"));
  if (/space_archived/.test(message)) return new Error(translateForRuntime("comments.error.archived"));
  return new Error(message || translateForRuntime("comments.postFailed"));
}

/**
 * Space'e yorum (docs/history/242-*): `rating` yalnız ana yorumda (1–5; kişi başına tek, sahibi veremez), `activityId` verilirse yorum o etkinliğe düşer.
 * Sunucu tetikleyicisi okuma/engel/arşiv kurallarını doğrular; `spaces.comment_count` ya da `space_activity.comment_count` tetikleyiciyle tutulur.
 */
export async function postCommentOnSpace(
  spaceId: string,
  authorId: string,
  body: string,
  parentId: string | null,
  options: { rating?: number | null; activityId?: string | null } & CommentExtras = {},
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({
      space_id: spaceId,
      author_id: authorId,
      body,
      parent_id: parentId,
      ...(options.activityId ? { space_activity_id: options.activityId } : {}),
      ...(options.rating ? { rating: options.rating } : {}),
      ...extrasColumns(options),
    })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw spaceCommentError(error);
  return mapCommentRow(data as unknown as CommentRow, { spaceId });
}

/** Kendi puanlı yorumunun puanını değiştirir ("0 satır etkilendi" sessiz başarı sayılmaz). */
export async function updateCommentRating(commentId: string, authorId: string, rating: number): Promise<void> {
  const { data, error } = await supabase.from("prompt_comments").update({ rating }).eq("id", commentId).eq("author_id", authorId).select("id").maybeSingle();
  if (error) throw spaceCommentError(error);
  if (!data) throw new Error(translateForRuntime("comments.error.rateFailed"));
}

/** Alıntıya yorum: sunucu tetikleyicisi hedefin halka açıklığını ve engeli doğrular; `content_quotes.comment_count` tetikleyiciyle tutulur. */
export async function postCommentOnQuote(quoteId: string, authorId: string, body: string, parentId: string | null, extras?: CommentExtras): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ quote_id: quoteId, author_id: authorId, body, parent_id: parentId, ...extrasColumns(extras) })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? translateForRuntime("comments.postFailed"));
  return mapCommentRow(data as unknown as CommentRow, { quoteId });
}

/**
 * Genuinely, permanently edits a real comment/reply's text — RLS (Bölüm
 * 19) already only lets the real author's own row through, so no extra
 * ownership check is needed here. `handle_comment_body_edit` (Bölüm 9.5)
 * stamps `edited_at` automatically.
 */
export async function updateComment(commentId: string, body: string): Promise<{ editedAt: string }> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .update({ body })
    .eq("id", commentId)
    .select("edited_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? translateForRuntime("comments.updateFailed"));
  return { editedAt: data.edited_at as string };
}

/**
 * Genuinely, permanently deletes a real comment/reply — or, if it still
 * has real replies, the `handle_comment_delete` BEFORE DELETE trigger
 * (Bölüm 9.5) transparently soft-deletes it instead (clears `body`, stamps
 * `deleted_at`) so those replies are never silently lost. Either way this
 * call looks identical from here; the caller can't tell which happened
 * from the response alone, so `CommentSection` always marks the comment
 * "deleted" locally and lets the next real fetch reflect which one it was.
 */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from("prompt_comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------------------------
// Sayfalı yorum ağacı (docs/history/258-*)
// ---------------------------------------------------------------------------------------------
//
// Çok yorumlu bir gönderide (binlerce üst yorum) hepsini tek seferde çekip çizmek yerine ÜST DÜZEY yorumlar 20'şerli sayfa okunur; her sayfanın
// yanıtları (her derinlikte) o sayfayla birlikte gelir — yorum ağacı istemcide aynı düz listeden kurulur. Bildirimden gelen derin bağlantı için
// yorumun bağlı olduğu kök yorum ve tüm altı ayrıca yüklenir (`fetchCommentThread`).

export const COMMENTS_PAGE = 20;

export type CommentScopeKind = "prompt" | "request" | "result" | "workflow" | "preset" | "community_post" | "space" | "space_activity" | "quote";
/** Which discussion a thread belongs to (`spaceId` is also needed for a Space activity). */
export interface CommentScope {
  kind: CommentScopeKind;
  id: string;
  spaceId?: string;
}

const SCOPE_COLUMN: Record<Exclude<CommentScopeKind, "space" | "space_activity">, string> = {
  prompt: "prompt_id",
  request: "request_id",
  result: "result_id",
  workflow: "workflow_id",
  preset: "preset_id",
  community_post: "community_post_id",
  quote: "quote_id",
};

interface Filterable {
  eq(column: string, value: string): Filterable;
  is(column: string, value: null): Filterable;
}
/** The filters that pin a `prompt_comments` query to one discussion. */
function applyScope<Q>(query: Q, scope: CommentScope): Q {
  const q = query as unknown as Filterable;
  if (scope.kind === "space") return q.eq("space_id", scope.id).is("space_activity_id", null) as unknown as Q;
  if (scope.kind === "space_activity") return q.eq("space_id", scope.spaceId ?? "").eq("space_activity_id", scope.id) as unknown as Q;
  return q.eq(SCOPE_COLUMN[scope.kind], scope.id) as unknown as Q;
}

function targetOf(scope: CommentScope): Parameters<typeof mapCommentRow>[1] {
  switch (scope.kind) {
    case "prompt": return { promptId: scope.id };
    case "request": return { requestId: scope.id };
    case "result": return { resultId: scope.id };
    case "workflow": return { workflowId: scope.id };
    case "preset": return { presetId: scope.id };
    case "community_post": return { communityPostId: scope.id };
    case "quote": return { quoteId: scope.id };
    default: return { spaceId: scope.kind === "space" ? scope.id : (scope.spaceId ?? "") };
  }
}

/** Every reply (at any depth) under the given comments, level by level; each level is read in id parts and in full pages. */
async function fetchDescendants(parentIds: string[], scope: CommentScope): Promise<PromptComment[]> {
  const out: PromptComment[] = [];
  let level = parentIds;
  for (let depth = 0; level.length > 0 && depth < 40; depth += 1) {
    const rows = (
      await Promise.all(
        chunk(level, 100).map(async (ids) => {
          const { rows: found } = await fetchAllRows((from, to) =>
            supabase.from("prompt_comments").select(COMMENT_SELECT).in("parent_id", ids).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
          );
          return found as unknown as CommentRow[];
        }),
      )
    ).flat();
    out.push(...rows.map((row) => mapCommentRow(row, targetOf(scope))));
    level = rows.map((row) => row.id);
  }
  return out;
}

/** One page of TOP-LEVEL comments (oldest first) plus all their replies. `nextOffset` null = the last page. */
export async function fetchCommentThreadPage(scope: CommentScope, offset = 0, limit = COMMENTS_PAGE): Promise<{ comments: PromptComment[]; nextOffset: number | null }> {
  const { data, error } = await applyScope(supabase.from("prompt_comments").select(COMMENT_SELECT), scope)
    .is("parent_id", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const tops = (data ?? []) as unknown as CommentRow[];
  const replies = await fetchDescendants(tops.map((row) => row.id), scope);
  const comments = await withoutBlocked([...tops.map((row) => mapCommentRow(row, targetOf(scope))), ...replies], (c) => c.author.id);
  return { comments, nextOffset: tops.length === limit ? offset + limit : null };
}

/** The whole thread (root comment + every reply) that contains `commentId` — the target of a notification link that may sit on a page not loaded yet. `[]` when it is not in this discussion / not readable. */
export async function fetchCommentThread(scope: CommentScope, commentId: string): Promise<PromptComment[]> {
  let current: CommentRow | null = null;
  let rootId = commentId;
  for (let depth = 0; depth < 60; depth += 1) {
    const { data, error } = await supabase.from("prompt_comments").select(COMMENT_SELECT).eq("id", rootId).maybeSingle();
    if (error || !data) return [];
    current = data as unknown as CommentRow;
    if (!current.parent_id) break;
    rootId = current.parent_id;
  }
  if (!current || current.parent_id) return [];
  // The root must belong to THIS discussion (the id came from a link).
  const { data: scoped } = await applyScope(supabase.from("prompt_comments").select("id"), scope).eq("id", current.id).maybeSingle();
  if (!scoped) return [];
  const replies = await fetchDescendants([current.id], scope);
  return withoutBlocked([mapCommentRow(current, targetOf(scope)), ...replies], (c) => c.author.id);
}

/** A Space allows one rating per person: the viewer's own rated comment is always loaded, even when it sits on a page not read yet. */
export async function fetchOwnRatedSpaceComment(spaceId: string, userId: string): Promise<PromptComment | null> {
  const { data } = await supabase
    .from("prompt_comments")
    .select(COMMENT_SELECT)
    .eq("space_id", spaceId)
    .is("space_activity_id", null)
    .eq("author_id", userId)
    .not("rating", "is", null)
    .is("parent_id", null)
    .limit(1);
  const row = (data?.[0] ?? null) as unknown as CommentRow | null;
  return row ? mapCommentRow(row, { spaceId }) : null;
}
