import { supabase } from "./client";
import { chunk } from "./paged";
import { fetchAttachmentCards, attachmentKey, type AttachmentCard } from "./comment-attachments";
import { isReactionKey, type ReactionKey } from "@/lib/reactions";
import { linkedContent, notificationCommentId, quickActionKind, suggestionId } from "@/lib/notification-actions";
import type { NotificationCard } from "@/types";

/**
 * Bildirim kartlarının görünür kısmı için gereken EK veri (docs/history/326-*): yorum gövdesi + benim tepkim, takip-geri durumu, düzenleme
 * önerisi + prompt metni (fark için), bağlı içerik önizlemesi. Bir sayfadaki tüm kartlar için TÜR BAŞINA TEK toplu sorgu (100'lük parçalar):
 * kart başına istek yok. Sorgular okuyucunun RLS'inden geçer; okunamayan hiç dönmez (arayüz kartı bunsuz da çizer).
 */
export interface CommentContext {
  id: string;
  body: string;
  deleted: boolean;
  /** Benim bu yoruma verdiğim tepki; `null` = vermedim. */
  myReaction: ReactionKey | null;
}

export interface SuggestionContext {
  id: string;
  promptId: string;
  note: string;
  /** Önerenin yazdığı tam yeni metin (yoksa not yalnız bir yorumdur; kabul için sahibin kendi metni gerekir). */
  proposedText: string | null;
  /** Promptun şu anki metni (farkın "önce" tarafı). */
  currentText: string | null;
  status: "pending" | "accepted" | "rejected";
}

export interface NotificationContext {
  comments: Map<string, CommentContext>;
  /** Takip ettiğim kullanıcı kimlikleri (yalnız kartların son aktörleri sorulur). */
  following: Set<string>;
  suggestions: Map<string, SuggestionContext>;
  linked: Map<string, AttachmentCard>;
}

export const EMPTY_NOTIFICATION_CONTEXT: NotificationContext = {
  comments: new Map(),
  following: new Set(),
  suggestions: new Map(),
  linked: new Map(),
};

/** Kimlik listesini 100'lük parçalara bölüp sorguları paralel çalıştırır; ilk hatada fırlatır. */
async function inChunks<T>(ids: string[], run: (part: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const pages = await Promise.all(
    chunk(ids, 100).map(async (part) => {
      const { data, error } = await run(part);
      if (error) throw new Error(error.message);
      return (data ?? []) as T[];
    }),
  );
  return pages.flat();
}

export async function fetchNotificationContext(cards: NotificationCard[], userId: string): Promise<NotificationContext> {
  const commentIds = new Set<string>();
  const followActorIds = new Set<string>();
  const suggestionIds = new Set<string>();
  for (const card of cards) {
    const commentId = notificationCommentId(card);
    if (commentId) commentIds.add(commentId);
    const action = quickActionKind(card);
    if (action === "followBack" && card.latestActor) followActorIds.add(card.latestActor.id);
    const sid = suggestionId(card);
    if (sid) suggestionIds.add(sid);
  }
  const linkedItems = cards.flatMap((card) => (card.type === "follow" ? [] : [linkedContent(card)])).filter((item): item is NonNullable<typeof item> => item != null);

  const out: NotificationContext = { comments: new Map(), following: new Set(), suggestions: new Map(), linked: new Map() };

  await Promise.all([
    (async () => {
      if (commentIds.size === 0) return;
      try {
        const ids = [...commentIds];
        const [rows, likes] = await Promise.all([
          inChunks<{ id: string; body: string; deleted_at: string | null }>(ids, (part) => supabase.from("prompt_comments").select("id, body, deleted_at").in("id", part)),
          inChunks<{ comment_id: string; reaction?: string | null }>(ids, (part) => supabase.from("comment_likes").select("comment_id, reaction").eq("user_id", userId).in("comment_id", part)),
        ]);
        const mine = new Map(likes.map((row) => [row.comment_id, row.reaction && isReactionKey(row.reaction) ? row.reaction : "love"] as const));
        for (const row of rows) out.comments.set(row.id, { id: row.id, body: row.body, deleted: Boolean(row.deleted_at), myReaction: mine.get(row.id) ?? null });
      } catch (err) {
        console.error("notification context: comments", err);
      }
    })(),
    (async () => {
      if (followActorIds.size === 0) return;
      try {
        const rows = await inChunks<{ following_id: string }>([...followActorIds], (part) => supabase.from("follows").select("following_id").eq("follower_id", userId).in("following_id", part));
        for (const row of rows) out.following.add(row.following_id);
      } catch (err) {
        console.error("notification context: follows", err);
      }
    })(),
    (async () => {
      if (suggestionIds.size === 0) return;
      try {
        const rows = await inChunks<{ id: string; prompt_id: string; suggestion_text: string; proposed_prompt_text: string | null; status: SuggestionContext["status"] }>(
          [...suggestionIds],
          (part) => supabase.from("prompt_edit_suggestions").select("id, prompt_id, suggestion_text, proposed_prompt_text, status").in("id", part),
        );
        const prompts = await inChunks<{ id: string; prompt_text: string }>([...new Set(rows.map((row) => row.prompt_id))], (part) => supabase.from("prompts").select("id, prompt_text").in("id", part));
        const text = new Map(prompts.map((row) => [row.id, row.prompt_text] as const));
        for (const row of rows) {
          out.suggestions.set(row.id, {
            id: row.id,
            promptId: row.prompt_id,
            note: row.suggestion_text,
            proposedText: row.proposed_prompt_text,
            currentText: text.get(row.prompt_id) ?? null,
            status: row.status,
          });
        }
      } catch (err) {
        console.error("notification context: suggestions", err);
      }
    })(),
    (async () => {
      if (linkedItems.length === 0) return;
      try {
        const { cards: map } = await fetchAttachmentCards(linkedItems);
        for (const [key, card] of map) out.linked.set(key, card);
      } catch (err) {
        console.error("notification context: linked", err);
      }
    })(),
  ]);
  return out;
}

/** Bir kartın bağlı içerik önizlemesi (varsa). */
export function linkedCardFor(context: NotificationContext, card: NotificationCard): AttachmentCard | null {
  const item = linkedContent(card);
  return item ? (context.linked.get(attachmentKey(item)) ?? null) : null;
}
