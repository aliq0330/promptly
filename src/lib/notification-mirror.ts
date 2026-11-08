/**
 * Bildirim merkezinin SAF kuralları (docs/history/326-*) — veritabanındaki aynı adlı SQL fonksiyonlarının TS aynaları.
 * `supabase/migrations/20261103110000_notification_center.sql`: `_notification_href_base`, `_notification_category`,
 * `_notification_pref_key`, `_notification_group_key`. `notification-mirror.test.ts` ikisini (listeleri ve örnek tabloyu) karşılaştırır:
 * birini değiştirirsen diğerini de değiştir.
 */

import { isCommunityNotification, isTeamNotification } from "./notification-scope.ts";

/** Sunucuda tek karta birleşen (sayı) bildirim türleri. */
export const GROUPABLE_NOTIFICATION_TYPES = ["like", "follow", "story_reaction", "story_poll_vote"] as const;

export const NOTIFICATION_PREF_KEYS = [
  "reactions",
  "comment_likes",
  "comments",
  "follows",
  "suggestions",
  "requests",
  "stories",
  "quotes",
  "results",
  "milestones",
  "weekly_digest",
] as const;
export type NotificationPrefKeyName = (typeof NOTIFICATION_PREF_KEYS)[number];

export function isNotificationPrefKey(value: unknown): value is NotificationPrefKeyName {
  return typeof value === "string" && (NOTIFICATION_PREF_KEYS as readonly string[]).includes(value);
}

/** Adresin `hl=` parametresiz tabanı: "aynı içerik" bu taban üzerinden eşleşir (sessize alma anahtarı). */
export function notificationHrefBase(href: string): string {
  return (href ?? "").replace(/&hl=[^&#]*/g, "").replace(/\?hl=[^&#]*$/, "");
}

export function notificationGroupKey(type: string, href: string, id: string): string {
  return (GROUPABLE_NOTIFICATION_TYPES as readonly string[]).includes(type) ? `${type}|${href ?? ""}` : `n|${id}`;
}

export function isGroupedKey(key: string): boolean {
  return !key.startsWith("n|");
}

/** Tür tercihi anahtarı; `null` = kapatılamaz (güvenlik/sistem, mesaj, topluluk). */
export function notificationPrefKey(type: string, href: string, dedupeKey: string | null = null): NotificationPrefKeyName | null {
  switch (type) {
    case "like":
      return (href ?? "").includes("hl=comment:") ? "comment_likes" : "reactions";
    case "comment":
    case "comment_reply":
      return "comments";
    case "follow":
      return "follows";
    case "edit_suggestion_received":
    case "edit_suggestion_accepted":
    case "edit_suggestion_rejected":
    case "prompt_edited":
      return "suggestions";
    case "request_response":
    case "request_edited":
      return "requests";
    case "story_reaction":
    case "story_poll_vote":
    case "story_question_answer":
      return "stories";
    case "quote":
      return "quotes";
    case "prompt_result_shared":
      return "results";
    case "system":
      if ((dedupeKey ?? "").startsWith("milestone:")) return "milestones";
      if ((dedupeKey ?? "").startsWith("weekly:")) return "weekly_digest";
      return null;
    default:
      return null;
  }
}

/** Adresten ayrıştırılan hedef (hızlı eylemler ve ayrıntı görünümü için). */
export type NotificationTargetKind =
  | "prompt"
  | "request"
  | "result"
  | "workflow"
  | "preset"
  | "quote"
  | "community_post"
  | "space"
  | "story"
  | "message"
  | "profile"
  | "collection"
  | "insights"
  | "other";

export interface ParsedNotificationHref {
  kind: NotificationTargetKind;
  /** `?id=` (profilde kullanıcı adı `username`). */
  id: string | null;
  username: string | null;
  /** `hl=<tür>:<kimlik>`. */
  hlKind: string | null;
  hlId: string | null;
}

const PATH_KINDS: [prefix: string, kind: NotificationTargetKind][] = [
  ["/prompts/local", "prompt"],
  ["/requests/local", "request"],
  ["/results/local", "result"],
  ["/workflows/local", "workflow"],
  ["/presets/local", "preset"],
  ["/quotes/local", "quote"],
  ["/communities/post/local", "community_post"],
  ["/spaces/local", "space"],
  ["/stories", "story"],
  ["/messages/local", "message"],
  ["/profile/real", "profile"],
  ["/collections/local", "collection"],
  ["/insights/local", "insights"],
];

export function parseNotificationHref(href: string): ParsedNotificationHref {
  const raw = href ?? "";
  const queryIndex = raw.indexOf("?");
  const path = (queryIndex === -1 ? raw : raw.slice(0, queryIndex)).replace(/\/+$/, "");
  const params = new URLSearchParams(queryIndex === -1 ? "" : raw.slice(queryIndex + 1).split("#")[0]);
  const kind = PATH_KINDS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? "other";
  const hl = params.get("hl");
  const sep = hl ? hl.indexOf(":") : -1;
  return {
    kind,
    id: params.get("id"),
    username: params.get("username"),
    hlKind: hl && sep > 0 ? hl.slice(0, sep) : null,
    hlId: hl && sep > 0 ? hl.slice(sep + 1) : null,
  };
}

export type NotificationCategoryName = "posts" | "requests" | "follow" | "messages" | "community" | "teams" | "system";

/** Kategori menüsü: tür + (topluluğa giden adres). SQL `_notification_category` ile aynı. */
export function notificationCategoryOf(type: string, href: string): NotificationCategoryName {
  if (isTeamNotification(type, href)) return "teams";
  if (isCommunityNotification(type, href)) return "community";
  switch (type) {
    case "request_response":
    case "request_edited":
      return "requests";
    case "follow":
      return "follow";
    case "message":
    case "message_request":
      return "messages";
    case "like":
    case "comment":
    case "comment_reply":
    case "prompt_edited":
    case "edit_suggestion_received":
    case "edit_suggestion_accepted":
    case "edit_suggestion_rejected":
    case "prompt_result_shared":
    case "story_reaction":
    case "story_poll_vote":
    case "story_question_answer":
    case "quote":
      return "posts";
    default:
      return "system";
  }
}
