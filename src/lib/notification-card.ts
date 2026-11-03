import type { TFunction } from "./i18n/language-provider.tsx";
import type { TranslationKey } from "./i18n/translations.ts";
import { parseNotificationHref, type NotificationTargetKind } from "./notification-mirror.ts";
import { REACTION_KEYS, REACTION_LABEL } from "./reactions.ts";
import type { NotificationCard } from "../types/index.ts";

/**
 * Bildirim kartının metni (docs/history/326-*). Tek satırlık kartlar (yorum, yanıt, mesaj…) ve tek kişilik sayı kartları mevcut sunucu cümlesini
 * (`localizeNotificationMessage`) olduğu gibi kullanır; ≥2 kişilik sayı kartları ("Ali, Veli ve 10 kişi daha promptunu beğendi") burada kurulur.
 * Saf: çeviri `t` ile gelir, kullanıcı adları çevrilmez.
 */

export interface CardHeadline {
  /** Kalın yazılan kısım: aktör adı / "Ali, Veli ve 10 kişi daha". Aktörsüz (sistem) kartta boş. */
  names: string;
  /** Cümlenin devamı (çevrilmiş). Tek kişilik kartta `localizeMessage` sonucu. */
  text: string;
}

/** "Ali" · "Ali ve Veli" · "Ali, Veli ve 10 kişi daha": en çok iki ad gösterilir, kalanı sayıdır. `count` = kişi (satır) sayısı. */
export function namesLabel(displayNames: string[], count: number, t: TFunction): string {
  const names = displayNames.filter(Boolean);
  const total = Math.max(count, names.length);
  if (names.length === 0) return "";
  if (total <= 1) return names[0];
  if (total === 2 && names.length >= 2) return t("nc.names.two", { a: names[0], b: names[1] });
  if (names.length >= 2) return t("nc.names.more", { a: names[0], b: names[1], n: total - 2 });
  return t("nc.names.moreOne", { a: names[0], n: total - 1 });
}

const LIKED_OBJECT: Partial<Record<NotificationTargetKind, TranslationKey>> = {
  prompt: "nc.obj.prompt",
  request: "nc.obj.request",
  workflow: "nc.obj.workflow",
  preset: "nc.obj.preset",
  result: "nc.obj.result",
  quote: "nc.obj.quote",
  space: "nc.obj.space",
  community_post: "nc.obj.post",
};

/** Beğeni kartının nesnesi ("promptunu", "yorumunu"…): `hl=comment` yorum, aksi hâlde adresin türü. */
export function likedObjectKey(href: string): TranslationKey {
  const parsed = parseNotificationHref(href);
  if (parsed.hlKind === "comment") return "nc.obj.comment";
  return LIKED_OBJECT[parsed.kind] ?? "nc.obj.post";
}

/**
 * ≥2 kişilik sayı kartının cümlesi; `null` = tek satırlık kart ya da tek kişi (çağıran sunucu cümlesini kullanır).
 */
export function groupedHeadline(card: NotificationCard, t: TFunction): CardHeadline | null {
  if (card.rowCount <= 1) return null;
  const names = namesLabel(card.actors.map((actor) => actor.displayName), card.rowCount, t);
  switch (card.type) {
    case "like":
      return { names, text: t("nc.liked", { obj: t(likedObjectKey(card.targetHref)) }) };
    case "follow":
      return { names, text: t(parseNotificationHref(card.targetHref).kind === "collection" ? "nc.followedCollection" : "nc.followed") };
    case "story_reaction":
      return { names, text: t("nc.storyReaction") };
    case "story_poll_vote":
      return { names, text: t("nc.storyPoll") };
    default:
      return null;
  }
}

/** "3 aşk · 2 ateş": en çok verilen tepkiler, tepki sırasıyla; hiç yoksa boş. */
export function reactionSummary(counts: NotificationCard["reactionCounts"], t: TFunction): string {
  return REACTION_KEYS.filter((key) => (counts[key] ?? 0) > 0)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || REACTION_KEYS.indexOf(a) - REACTION_KEYS.indexOf(b))
    .map((key) => `${counts[key]} ${t(REACTION_LABEL[key]).toLocaleLowerCase()}`)
    .join(" · ");
}

/** Kilometre taşı cümlesinden sayı + tür: `Promptun "X" 100 kopyalamaya ulaştı.` → { count: 100, kind: "copies" }. */
export function milestoneInfo(message: string): { title: string; count: number; kind: "copies" | "reactions" } | null {
  const match = /^Promptun "([\s\S]*)" (\d+) (kopyalamaya|tepkiye) ulaştı\.$/.exec(message);
  if (!match) return null;
  return { title: match[1], count: Number(match[2]), kind: match[3] === "kopyalamaya" ? "copies" : "reactions" };
}

/** Karttaki alıntı kutusunun ham sunucu önizlemesi: `Yorumunu beğendi: "x"` / `Paylaşımına yorum yaptı: "güzel"` → `x` / `güzel` (tırnaksız); yoksa null. */
export function quotedPreview(message: string): string | null {
  const match = /: "([\s\S]*)"$/.exec(message);
  return match ? match[1] : null;
}

/** Ayrıntı başlığındaki tür etiketi ("Yorum · Bugün 19:49"). */
export function cardKindKey(card: Pick<NotificationCard, "type" | "targetHref">): TranslationKey {
  const href = parseNotificationHref(card.targetHref);
  switch (card.type) {
    case "comment":
      return "nc.kind.comment";
    case "comment_reply":
      return "nc.kind.reply";
    case "like":
      return "nc.kind.like";
    case "follow":
      return "nc.kind.follow";
    case "edit_suggestion_received":
    case "edit_suggestion_accepted":
    case "edit_suggestion_rejected":
    case "prompt_edited":
      return "nc.kind.suggestion";
    case "message_request":
    case "message":
      return "nc.kind.message";
    case "request_response":
    case "request_edited":
      return "nc.kind.request";
    case "story_reaction":
    case "story_poll_vote":
    case "story_question_answer":
      return "nc.kind.story";
    case "quote":
      return "nc.kind.quote";
    case "prompt_result_shared":
      return "nc.kind.result";
    case "system":
      return href.kind === "insights" && card.targetHref.startsWith("/insights/local") ? "nc.kind.milestone" : card.targetHref === "/insights" ? "nc.kind.digest" : "nc.kind.system";
    default:
      return "nc.kind.system";
  }
}

/** Alıntı kutusu zaten gösterilen kartlarda (yorum, yanıt, düzenleme önerisi) başlık cümlesinden sondaki `: "önizleme"` kısmı atılır. */
export function withoutQuotedPreview(text: string): string {
  return text.replace(/:\s*["“][\s\S]*["”]\s*$/, "").trimEnd();
}

export const QUOTED_PREVIEW_TYPES: readonly string[] = ["comment", "comment_reply", "edit_suggestion_received"];
