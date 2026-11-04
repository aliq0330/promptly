import { supabase } from "./client";
import { chunk } from "./paged";
import { fetchAttachmentCards, attachmentKey, type AttachmentCard } from "./comment-attachments";
import { mapCommentAttachment, mapCommentMedia } from "@/lib/comment-extras-model";
import type { AttachmentState } from "@/features/content/compact-content-card";
import { linkedContent, notificationCommentId, quickActionKind, suggestionId } from "@/lib/notification-actions";
import type { CommentAttachment, CommentMedia, NotificationCard } from "@/types";

/**
 * Bildirim kartlarının görünür kısmı için gereken EK veri (docs/history/326-*): yorum gövdesi + benim tepkim, takip-geri durumu, düzenleme
 * önerisi + prompt metni (fark için), bağlı içerik önizlemesi. Bir sayfadaki tüm kartlar için TÜR BAŞINA TEK toplu sorgu (100'lük parçalar):
 * kart başına istek yok. Sorgular okuyucunun RLS'inden geçer; okunamayan hiç dönmez (arayüz kartı bunsuz da çizer).
 */
export interface CommentContext {
  id: string;
  body: string;
  deleted: boolean;
  /** Toplam tepki sayısı (`prompt_comments.like_count`); benim tepkim `useLikeState`'tedir (gönderideki tepki sistemi, docs/history/327-*). */
  likeCount: number;
  /** Yorumun fotoğrafı/GIF'i ve içerik eki (docs/history/308-*): bildirimde önizlenir. */
  media: CommentMedia | null;
  attachment: CommentAttachment | null;
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
  /** Bağlı içerik kartları + yorum eklerinin kartları (aynı `tür:kimlik` anahtarı). */
  linked: Map<string, AttachmentCard>;
  /** Okuması tamamlanan (kart dönmese de "gizli" sayılan) ve okuması çöken ek anahtarları: `loading` ile `hidden`/`error` ayrımı için. */
  attachmentSettled: Set<string>;
  attachmentFailed: Set<string>;
}

export const EMPTY_NOTIFICATION_CONTEXT: NotificationContext = {
  comments: new Map(),
  following: new Set(),
  suggestions: new Map(),
  linked: new Map(),
  attachmentSettled: new Set(),
  attachmentFailed: new Set(),
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

  const out: NotificationContext = { comments: new Map(), following: new Set(), suggestions: new Map(), linked: new Map(), attachmentSettled: new Set(), attachmentFailed: new Set() };
  /** Yorum eklerinin içerik kartları, yorumlar okununca eklenir (aynı toplu okumaya katılır). */
  const commentAttachments: CommentAttachment[] = [];
  const commentsDone = (async () => {
    if (commentIds.size === 0) return;
    try {
      const rows = await inChunks<{
        id: string;
        body: string;
        deleted_at: string | null;
        like_count: number;
        media_kind: string | null;
        media_ref: string | null;
        media_width: number | null;
        media_height: number | null;
        attach_type: string | null;
        attach_id: string | null;
      }>([...commentIds], (part) =>
        supabase.from("prompt_comments").select("id, body, deleted_at, like_count, media_kind, media_ref, media_width, media_height, attach_type, attach_id").in("id", part),
      );
      // Okunamayan (silinmiş ya da RLS'in gizlediği) yorum da "yerleşmiş" sayılır: yoksa kart sonsuza dek "yükleniyor" kalırdı.
      const seen = new Set(rows.map((row) => row.id));
      for (const id of commentIds) {
        if (!seen.has(id)) out.comments.set(id, { id, body: "", deleted: true, likeCount: 0, media: null, attachment: null });
      }
      for (const row of rows) {
        const deleted = Boolean(row.deleted_at);
        const attachment = deleted ? null : mapCommentAttachment(row);
        out.comments.set(row.id, { id: row.id, body: row.body, deleted, likeCount: row.like_count ?? 0, media: deleted ? null : mapCommentMedia(row), attachment });
        if (attachment) commentAttachments.push(attachment);
      }
    } catch (err) {
      console.error("notification context: comments", err);
    }
  })();

  await Promise.all([
    commentsDone,
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
      // Bağlı içerik + yorum ekleri tek toplu okumada (tür başına tek sorgu); yorum ekleri yorumlar okununca bilinir.
      await commentsDone;
      const wanted = new Map<string, CommentAttachment>();
      for (const item of [...linkedItems, ...commentAttachments]) wanted.set(attachmentKey(item), item);
      if (wanted.size === 0) return;
      try {
        const { cards: map, failed } = await fetchAttachmentCards([...wanted.values()]);
        for (const [key, card] of map) out.linked.set(key, card);
        for (const [key, item] of wanted) {
          out.attachmentSettled.add(key);
          if (failed.has(item.type)) out.attachmentFailed.add(key);
        }
      } catch (err) {
        console.error("notification context: linked", err);
      }
    })(),
  ]);
  return out;
}

/** Bir yorum ekinin o anki hâli (`CompactContentCard` durumu): okunmadıysa `loading`, okundu ama dönmediyse `hidden`, sorgu çöktüyse `error`. */
export function attachmentStateIn(context: NotificationContext, attachment: CommentAttachment): AttachmentState {
  const key = attachmentKey(attachment);
  const card = context.linked.get(key);
  if (card) return { status: "ready", card };
  if (context.attachmentFailed.has(key)) return { status: "error" };
  return context.attachmentSettled.has(key) ? { status: "hidden" } : { status: "loading" };
}

/** Bir kartın bağlı içerik önizlemesi (varsa). */
export function linkedCardFor(context: NotificationContext, card: NotificationCard): AttachmentCard | null {
  const item = linkedContent(card);
  return item ? (context.linked.get(attachmentKey(item)) ?? null) : null;
}
