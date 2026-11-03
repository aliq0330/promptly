import { isGroupedKey, notificationPrefKey, parseNotificationHref, type NotificationPrefKeyName, type NotificationTargetKind } from "./notification-mirror.ts";
import type { NotificationCard } from "../types/index.ts";

/**
 * Bildirim kartında hangi hızlı eylemler çizilir ve hangi hedefe yazılır (docs/history/326-*). Saf: yalnız kartın türü + adresi okunur;
 * sunucu her eylemi kendi kuralıyla (RLS, askı, engel, hız sınırı) yeniden doğrular — buradaki karar yalnız hangi düğmenin gösterileceğidir.
 */

export type QuickActionKind =
  /** Yorum/yanıt bildirimi: yoruma tepki ver + yanıtla. */
  | "comment"
  /** Beğeni/tepki/takip/hikâye sayı kartı: "Kimler beğendi?" (Ayrıntı'nın üye listesi). */
  | "members"
  /** Tek kişilik takip kartı: "Sen de takip et". */
  | "followBack"
  /** Düzenleme önerisi: fark + Kabul et / Reddet. */
  | "suggestion"
  /** Mesaj isteği: Kabul / Reddet. */
  | "messageRequest"
  /** Kilometre taşı: İstatistiği gör + Paylaş. */
  | "milestone"
  /** Hızlı eylemi olmayan kart (yalnız Ayrıntı). */
  | "none";

/** Yoruma yanıt yazılabilen hedefler (`postCommentOn*` ailesi); Space etkinliği ve bilinmeyenler dışarıda. */
export const REPLYABLE_KINDS: readonly NotificationTargetKind[] = ["prompt", "request", "result", "workflow", "preset", "quote", "community_post", "space"];

export function quickActionKind(card: Pick<NotificationCard, "type" | "targetHref" | "rowCount">): QuickActionKind {
  const href = parseNotificationHref(card.targetHref);
  switch (card.type) {
    case "comment":
    case "comment_reply":
      return href.hlKind === "comment" && href.hlId && REPLYABLE_KINDS.includes(href.kind) ? "comment" : "none";
    case "like":
    case "story_reaction":
    case "story_poll_vote":
      return "members";
    case "follow":
      if (href.kind === "collection") return card.rowCount > 1 ? "members" : "none";
      return card.rowCount > 1 ? "members" : "followBack";
    case "edit_suggestion_received":
      return href.hlKind === "suggestion" && href.hlId ? "suggestion" : "none";
    case "message_request":
      return href.kind === "message" && href.id ? "messageRequest" : "none";
    case "system":
      return href.kind === "insights" ? "milestone" : "none";
    default:
      return "none";
  }
}

export interface CommentReplyTarget {
  kind: NotificationTargetKind;
  /** Hedef içeriğin kimliği (`?id=`). */
  contentId: string;
  /** Yanıtlanan yorum (`hl=comment:<id>`). */
  parentCommentId: string;
}

/** Yorum bildirimine yanıt yazılacak hedef; yazılamıyorsa null. */
export function commentReplyTarget(card: Pick<NotificationCard, "type" | "targetHref">): CommentReplyTarget | null {
  if (card.type !== "comment" && card.type !== "comment_reply") return null;
  const href = parseNotificationHref(card.targetHref);
  if (href.hlKind !== "comment" || !href.hlId || !href.id || !REPLYABLE_KINDS.includes(href.kind)) return null;
  return { kind: href.kind, contentId: href.id, parentCommentId: href.hlId };
}

/** Beğenilen yorumun kimliği (yorum beğenisi kartında); yoksa null. */
export function likedCommentId(card: Pick<NotificationCard, "type" | "targetHref">): string | null {
  if (card.type !== "like") return null;
  const href = parseNotificationHref(card.targetHref);
  return href.hlKind === "comment" ? href.hlId : null;
}

/** Yorum bildirimindeki yorumun kimliği (tepki + gövde için). */
export function notificationCommentId(card: Pick<NotificationCard, "type" | "targetHref">): string | null {
  if (card.type !== "comment" && card.type !== "comment_reply") return null;
  const href = parseNotificationHref(card.targetHref);
  return href.hlKind === "comment" ? href.hlId : null;
}

/** Düzenleme önerisinin kimliği (`hl=suggestion:<id>`); yoksa null. */
export function suggestionId(card: Pick<NotificationCard, "type" | "targetHref">): string | null {
  if (card.type !== "edit_suggestion_received") return null;
  const href = parseNotificationHref(card.targetHref);
  return href.hlKind === "suggestion" ? href.hlId : null;
}

/** Mesaj isteğinin sohbet kimliği. */
export function messageRequestConversationId(card: Pick<NotificationCard, "type" | "targetHref">): string | null {
  if (card.type !== "message_request") return null;
  const href = parseNotificationHref(card.targetHref);
  return href.kind === "message" ? href.id : null;
}

/** Bağlı içerik önizlemesi (CompactContentCard) çizilebilen türler. */
export type LinkedContentType = "prompt" | "request" | "workflow" | "preset" | "space";

export function linkedContent(card: Pick<NotificationCard, "targetHref">): { type: LinkedContentType; id: string } | null {
  const href = parseNotificationHref(card.targetHref);
  if (!href.id) return null;
  if (href.kind === "prompt" || href.kind === "request" || href.kind === "workflow" || href.kind === "preset" || href.kind === "space") return { type: href.kind, id: href.id };
  return null;
}

/** Sessize alma menüsünün seçenekleri: kişi (aktör varsa) ve/veya içerik (adresten bir içerik çıkıyorsa). */
export function muteOptions(card: Pick<NotificationCard, "targetHref" | "type" | "latestActor" | "rowCount">): { person: boolean; content: boolean } {
  const href = parseNotificationHref(card.targetHref);
  const contentKinds: NotificationTargetKind[] = ["prompt", "request", "result", "workflow", "preset", "quote", "community_post", "space", "insights"];
  return {
    person: card.type !== "system" && card.rowCount === 1 && card.latestActor != null,
    content: contentKinds.includes(href.kind) && Boolean(href.id),
  };
}

/**
 * "Bu tür bildirimleri kapat" anahtarı: sunucudaki `_notification_pref_key` ile aynı karar; kartta `dedupe_key` olmadığından sistem kartları adresten ayrılır
 * (`/insights/local?id=` kilometre taşı, `/insights` haftalık özet). `null` = kapatılamaz.
 */
export function cardPrefKey(card: Pick<NotificationCard, "type" | "targetHref">): NotificationPrefKeyName | null {
  if (card.type === "system") {
    const href = card.targetHref;
    if (href.startsWith("/insights/local")) return notificationPrefKey("system", href, "milestone:");
    if (href === "/insights") return notificationPrefKey("system", href, "weekly:");
    return null;
  }
  return notificationPrefKey(card.type, card.targetHref, null);
}

export { isGroupedKey };
