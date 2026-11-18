import { isGroupedKey, notificationGroupKey, parseNotificationHref } from "./notification-mirror.ts";
import { commentReplyTarget } from "./notification-actions.ts";
import { milestoneInfo } from "./notification-card.ts";
import type { NotificationCard, NotificationType, UserProfile } from "../types/index.ts";

/**
 * Canlı bildirim kartı (docs/history/434-*) — SAF kurallar. Sitedeyken gelen bildirim, ekranın üst köşesinde kısa bir kart olarak çıkar ve kendiliğinden kapanır.
 * Bu dosya yalnız KARARI verir (gösterilsin mi, aynı karta birleşsin mi, en çok kaç kart, hangi hızlı eylem); çizim `features/notifications/live-toasts.tsx`'tedir.
 * Bildirimin kendisi ve gruplama kuralı sunucudadır (`notifications` tablosu, `notification-mirror.ts`); bu kart yalnız gelen satırı gösterir, hiçbir şey yazmaz.
 */

/** Ekranda aynı anda en çok bu kadar kart durur; yenisi gelince en eskisi yer açmak için kapanır. */
export const LIVE_TOAST_MAX = 3;
/** Kartın ekranda kalma süresi (üstüne gelince/basılı tutunca durur). */
export const LIVE_TOAST_DURATION_MS = 5000;
/** Kilometre taşı (kutlama) kartı biraz uzun kalır. */
export const LIVE_TOAST_MILESTONE_MS = 8000;
/** Kart kapanırken yükseklik/saydamlık animasyonunun süresi; sonra DOM'dan kalkar. */
export const LIVE_TOAST_EXIT_MS = 300;
/** Yukarı kaydırarak kapatma eşiği (px, telefon). */
export const LIVE_TOAST_SWIPE_PX = 36;

/** Tercihin cihazdaki anahtarı (`localStorage`); yazılmamışsa kart AÇIKTIR. */
export const LIVE_TOAST_PREF_KEY = "promptly-live-toasts";

export function parseLiveToastPref(raw: string | null | undefined): boolean {
  return raw !== "off";
}

/** Realtime `INSERT` olayındaki `notifications` satırı (yalnız kartın ihtiyacı olan alanlar). */
export interface IncomingNotificationRow {
  id: string;
  type: NotificationType;
  actorId: string | null;
  message: string;
  targetHref: string;
  createdAt: string;
  reaction: string | null;
  dedupeKey: string | null;
  snoozedUntil: string | null;
  isRead: boolean;
}

/** Realtime yükünden satırı okur; eksik/bozuk alan varsa `null` (kart hiç çıkmaz, bildirim yine de listede durur). */
export function parseIncomingRow(raw: unknown): IncomingNotificationRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const id = str(r.id);
  const type = str(r.type);
  const message = str(r.message);
  const createdAt = str(r.created_at);
  if (!id || !type || message === null || !createdAt) return null;
  return {
    id,
    type: type as NotificationType,
    actorId: str(r.actor_id),
    message,
    targetHref: str(r.target_href) ?? "",
    createdAt,
    reaction: str(r.reaction),
    dedupeKey: str(r.dedupe_key),
    snoozedUntil: str(r.snoozed_until),
    isRead: r.is_read === true,
  };
}

export type LiveToastSkipReason = "read" | "snoozed" | "digest" | "hidden" | "busy" | "panel" | "inbox" | "in-chat" | "type-off" | "quiet";

/** O an kullanıcının nerede olduğu: kartın çıkıp çıkmayacağını belirler. */
export interface LiveToastContext {
  /** `usePathname()` (basePath'siz). */
  pathname: string;
  /** `window.location.search`. */
  search: string;
  /** Sekme görünür mü. Arka plandaki sekmede kart çıkmaz (zil rozeti ve Telegram yeter). */
  visible: boolean;
  /** Yazma ekranı açık (`html[data-compose-open]`). */
  composeOpen: boolean;
  /** Hikâye görüntüleyicisi açık (`html[data-story-open]`). */
  storyOpen: boolean;
  /** Zilin paneli açık: yeni bildirim panelde "N yeni" olarak görünür. */
  popoverOpen: boolean;
  /** Mesajlar dock'unda açık sohbet. */
  dockConversationId: string | null;
  /** Bu bildirimin tür grubu için kart açık mı (Ayarlar → Canlı bildirim kartı, `live-notification-prefs.ts`). */
  groupEnabled: boolean;
  /** Rahatsız etme saatinde miyiz (hesap başına, `isQuietNow`). */
  quiet: boolean;
}

const MESSAGE_TYPES: readonly NotificationType[] = ["message", "message_request"];

function conversationOf(href: string): string | null {
  const parsed = parseNotificationHref(href);
  return parsed.kind === "message" ? parsed.id : null;
}

/** Karta dönüşmemesi gereken bir durum varsa nedeni, yoksa `null`. */
export function liveToastSkipReason(row: IncomingNotificationRow, ctx: LiveToastContext, now: number = Date.now()): LiveToastSkipReason | null {
  if (row.isRead) return "read";
  if (row.snoozedUntil && new Date(row.snoozedUntil).getTime() > now) return "snoozed";
  // Haftalık özet uygulama açılışında üretilir: açılışta kart çıkarmak yerine yalnız gelen kutusunda durur.
  if ((row.dedupeKey ?? "").startsWith("weekly:")) return "digest";
  if (!ctx.visible) return "hidden";
  if (ctx.composeOpen || ctx.storyOpen) return "busy";
  if (ctx.popoverOpen) return "panel";
  if (/^\/notifications(\/|$)/.test(ctx.pathname)) return "inbox";
  if (MESSAGE_TYPES.includes(row.type)) {
    const conversation = conversationOf(row.targetHref);
    if (conversation) {
      const inPage = /^\/messages\/local\/?$/.test(ctx.pathname) && new URLSearchParams(ctx.search).get("id") === conversation;
      if (inPage || ctx.dockConversationId === conversation) return "in-chat";
    }
  }
  if (!ctx.groupEnabled) return "type-off";
  if (ctx.quiet) return "quiet";
  return null;
}

/** Aynı karta birleşen bildirimlerin anahtarı (sunucunun grup anahtarıyla aynı kural): beğeni/takip/hikâye tepkisi aynı içerik için tek kart. */
export function liveToastKey(row: Pick<IncomingNotificationRow, "type" | "targetHref" | "id">): string {
  return notificationGroupKey(row.type, row.targetHref, row.id);
}

/** Satırdan tek satırlık bir kart kurar (zil panelindeki `NotificationCard` ile aynı biçim, başlık/avatar bileşenleri paylaşılır). */
export function toastCardFromRow(row: IncomingNotificationRow, actor: NotificationCard["latestActor"]): NotificationCard {
  const reactionCounts: NotificationCard["reactionCounts"] = {};
  if (row.reaction) reactionCounts[row.reaction as keyof NotificationCard["reactionCounts"]] = 1;
  return {
    key: liveToastKey(row),
    type: row.type,
    targetHref: row.targetHref,
    sortAt: row.createdAt,
    rowCount: 1,
    unreadCount: 1,
    latestId: row.id,
    latestMessage: row.message,
    latestActor: actor,
    actors: actor ? [actor] : [],
    reactionCounts,
  };
}

/** Aynı karta ikinci bir bildirim gelince kartı günceller: en yeni aktör önde (en çok 3), sayı ve tepkiler toplanır. */
export function mergeToastCard(prev: NotificationCard, next: NotificationCard): NotificationCard {
  const seen = new Set<string>();
  const actors = [...next.actors, ...prev.actors].filter((actor) => (seen.has(actor.id) ? false : (seen.add(actor.id), true))).slice(0, 3);
  const reactionCounts = { ...prev.reactionCounts };
  for (const [key, n] of Object.entries(next.reactionCounts)) {
    const k = key as keyof NotificationCard["reactionCounts"];
    reactionCounts[k] = (reactionCounts[k] ?? 0) + (n ?? 0);
  }
  return {
    ...next,
    rowCount: prev.rowCount + next.rowCount,
    unreadCount: prev.unreadCount + next.unreadCount,
    latestActor: next.latestActor ?? prev.latestActor,
    actors,
    reactionCounts,
  };
}

export type LiveToastAction = "reply" | "follow";

/** Kartta hangi hızlı eylem çıkar: yorum/yanıt ve mesajda "Yanıtla", tek kişilik takipte "Takip et"; diğerlerinde eylem yok (kartın kendisi açılır). */
export function liveToastAction(card: Pick<NotificationCard, "type" | "targetHref" | "rowCount">): LiveToastAction | null {
  if (card.type === "message") return conversationOf(card.targetHref) ? "reply" : null;
  if (card.type === "comment" || card.type === "comment_reply") return commentReplyTarget(card) ? "reply" : null;
  if (card.type === "follow" && card.rowCount === 1 && parseNotificationHref(card.targetHref).kind === "profile") return "follow";
  return null;
}

/**
 * "Yanıtla" kartın içinde mi yazılsın (bilgisayar)? Yorum/yanıtta yoruma yanıt (`postCommentOn*`), düz birebir/grup sohbet mesajında mesaj. Topluluk odası ya da ekip/proje
 * kanalı mesajı (adreste `room`/`hub`/`team`/`project`) yanlış odaya yazılmasın diye satır içi DEĞİL, sohbeti açar.
 */
export function liveToastInlineReply(card: Pick<NotificationCard, "type" | "targetHref" | "rowCount">): "comment" | "message" | null {
  if (card.type === "comment" || card.type === "comment_reply") return commentReplyTarget(card) ? "comment" : null;
  if (card.type !== "message") return null;
  const query = card.targetHref.includes("?") ? card.targetHref.slice(card.targetHref.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query.split("#")[0]);
  if (["room", "hub", "team", "project", "channel"].some((key) => params.has(key))) return null;
  return conversationOf(card.targetHref) ? "message" : null;
}

/** "Yanıtla"nın gideceği adres: yorumda bildirim ayrıntısı (yanıt kutusu orada), mesajda sohbetin kendisi. */
export function liveToastReplyHref(card: Pick<NotificationCard, "type" | "targetHref" | "key">): string {
  return card.type === "message" ? card.targetHref : `/notifications?n=${encodeURIComponent(card.key)}`;
}

/** Ekrandaki bir kart. `seq` birleşmede artar (süre ve çizgi yeniden başlar), `leaving` kapanma animasyonudur. */
export interface LiveToastEntry {
  /** Yoğunlukta çıkan özet kartı: `card.rowCount` = kaç bildirim, `card.actors` = en yeni kişiler. */
  summary: boolean;
  /** Kartın benzersiz kimliği (ilk bildirimin kimliği): React anahtarı ve kapatma bununla yapılır; `key` birleşme anahtarıdır. */
  id: string;
  key: string;
  card: NotificationCard;
  seq: number;
  leaving: boolean;
  /** "Takip et" düğmesi görünsün mü (zaten takip ediliyorsa ya da ikinci kişi gelince kapanır). */
  canFollow: boolean;
}

export const liveEntries = (entries: readonly LiveToastEntry[]) => entries.filter((entry) => !entry.leaving);

/**
 * Yeni bir bildirimi yığına ekler. Aynı gruplanabilir karta gelen bildirim kartı yerinde günceller (süre yeniden başlar); aksi hâlde sona eklenir ve
 * `max`'ı aşan en eski kartlar kapanmaya alınır. Dönüş: yeni yığın.
 */
export function addLiveToast(entries: readonly LiveToastEntry[], card: NotificationCard, canFollow: boolean, max: number = LIVE_TOAST_MAX): LiveToastEntry[] {
  const index = isGroupedKey(card.key) ? entries.findIndex((entry) => entry.key === card.key && !entry.leaving && !entry.summary) : -1;
  if (index !== -1) {
    const next = entries.slice();
    const prev = entries[index];
    next[index] = { ...prev, card: mergeToastCard(prev.card, card), seq: prev.seq + 1, canFollow: false };
    return next;
  }
  const next: LiveToastEntry[] = [...entries, { id: card.latestId, key: card.key, summary: false, card, seq: 0, leaving: false, canFollow }];
  let live = liveEntries(next).length;
  return next.map((entry) => {
    if (!entry.leaving && live > max) {
      live -= 1;
      return { ...entry, leaving: true };
    }
    return entry;
  });
}

/** Kartı kapanmaya alır (animasyon sonunda `dropLiveToast` ile kalkar). */
export function leaveLiveToast(entries: readonly LiveToastEntry[], id: string): LiveToastEntry[] {
  return entries.map((entry) => (entry.id === id && !entry.leaving ? { ...entry, leaving: true } : entry));
}

export function dropLiveToast(entries: readonly LiveToastEntry[], id: string): LiveToastEntry[] {
  return entries.filter((entry) => !(entry.id === id && entry.leaving));
}

/** Kilometre taşı bildirimi mi (sistem türü + "Promptun "X" 100 kopyalamaya ulaştı." cümlesi): kutlama kartı olarak çizilir. */
export function isMilestoneCard(card: Pick<NotificationCard, "type" | "latestMessage">): boolean {
  return card.type === "system" && milestoneInfo(card.latestMessage) !== null;
}

/** Kartın ekranda kalma süresi. */
export function liveToastDurationMs(entry: Pick<LiveToastEntry, "card" | "summary">): number {
  return !entry.summary && isMilestoneCard(entry.card) ? LIVE_TOAST_MILESTONE_MS : LIVE_TOAST_DURATION_MS;
}

export const LIVE_TOAST_SUMMARY_KEY = "summary";

/**
 * Yoğunlukta (kısa sürede çok bildirim) ekrandaki kartlar kapanır ve TEK özet kartı çıkar; sonraki bildirimler aynı özetin sayısını artırır (süre yeniden başlar).
 * `initialCount` özet ilk kez kurulurken sayılan bildirim sayısıdır (pencere içindeki tüm varışlar); `actors` en yeni kişiler (en yeni önce).
 */
export function addSummaryToast(entries: readonly LiveToastEntry[], initialCount: number, actors: UserProfile[], id: string): LiveToastEntry[] {
  const existing = entries.findIndex((entry) => entry.summary && !entry.leaving);
  if (existing !== -1) {
    return entries.map((entry, index) => {
      if (index !== existing) return entry;
      const seen = new Set<string>();
      const merged = [...actors, ...entry.card.actors].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))).slice(0, 3);
      return { ...entry, seq: entry.seq + 1, card: { ...entry.card, rowCount: entry.card.rowCount + 1, unreadCount: entry.card.unreadCount + 1, actors: merged, latestActor: merged[0] ?? null } };
    });
  }
  const card: NotificationCard = {
    key: LIVE_TOAST_SUMMARY_KEY,
    type: "system",
    targetHref: "/notifications",
    sortAt: new Date().toISOString(),
    rowCount: initialCount,
    unreadCount: initialCount,
    latestId: id,
    latestMessage: "",
    latestActor: actors[0] ?? null,
    actors: actors.slice(0, 3),
    reactionCounts: {},
  };
  const closed = entries.map((entry) => (entry.leaving ? entry : { ...entry, leaving: true }));
  return [...closed, { id, key: LIVE_TOAST_SUMMARY_KEY, summary: true, card, seq: 0, leaving: false, canFollow: false }];
}
