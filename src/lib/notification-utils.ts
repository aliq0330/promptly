import {
  Ban,
  Bell,
  CheckCircle2,
  Code2,
  GitBranch,
  GitMerge,
  Heart,
  Lock,
  Mail,
  MessageCircle,
  MessageCircleHeart,
  MessageCircleReply,
  RotateCcw,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { AppNotification, NotificationType } from "@/types";

/**
 * The bildirim merkezi's category filter (Aşama 1.2) groups the existing
 * `NotificationType` values — no new backend concept, just a client-side
 * grouping of what's already there.
 */
export type NotificationCategory = "posts" | "requests" | "follow" | "messages" | "system";

export const NOTIFICATION_CATEGORY: Record<NotificationType, NotificationCategory> = {
  like: "posts",
  comment: "posts",
  comment_reply: "posts",
  remix: "posts",
  request_response: "requests",
  follow: "follow",
  message: "messages",
  message_request: "messages",
  system: "system",
  // Remix Dallanma Haritası / Merge sistemi (Aşama 14) — kendi ayrı bir
  // kategori filtresi icat etmek yerine "posts" altına katıldı: bunlar
  // hepsi bir promptun/remixin başına gelen olaylar, tıpkı like/comment/
  // remix gibi — yeni bir kategori, kullanıcıya yeni bir filtre öğrenmesi
  // gerektirirdi ama gerçek bir ayrım katmazdı.
  merge_request_received: "posts",
  merge_request_accepted: "posts",
  merge_request_rejected: "posts",
  merge_request_withdrawn: "posts",
  merge_request_cancelled: "posts",
};

export const CATEGORY_FILTERS: { key: "all" | NotificationCategory; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "posts", label: "Gönderiler" },
  { key: "requests", label: "İstekler" },
  { key: "follow", label: "Takip" },
  { key: "messages", label: "Mesajlar" },
  { key: "system", label: "Sistem" },
];

/**
 * What exact content a notification points at, beyond just "which page" —
 * carried as a single `hl=<kind>:<id>` query param on `target_href` (see
 * `supabase/migrations/20260919230000_notification_targeting_and_previews.
 * sql`) rather than a dozen separate `post_id`/`comment_id`/`reply_id`/…
 * columns, since every route here already resolves its subject from a
 * query-string id (`promptHref`/`requestHref`/`messageHref`, Bölüm 21) —
 * `hl` is the same pattern, just for the thing *inside* that page the
 * notification is actually about.
 */
export interface ParsedHighlight {
  kind: "post" | "comment" | "response_new" | "response_selected" | "response_unselected" | "message" | "merge";
  id: string;
}

const HIGHLIGHT_KINDS = new Set<ParsedHighlight["kind"]>([
  "post",
  "comment",
  "response_new",
  "response_selected",
  "response_unselected",
  "message",
  "merge",
]);

/** Parses a raw `hl` query param VALUE (e.g. from `useSearchParams().get("hl")` on the page the notification actually navigated to). */
export function parseHighlightValue(raw: string | null | undefined): ParsedHighlight | null {
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep === -1) return null;
  const kind = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!id || !HIGHLIGHT_KINDS.has(kind as ParsedHighlight["kind"])) return null;
  return { kind: kind as ParsedHighlight["kind"], id };
}

/** Parses the `hl` param out of a full stored `target_href` string — used where a notification is still just a row in a list, not yet navigated to. */
export function parseHighlightFromHref(targetHref: string): ParsedHighlight | null {
  const queryIndex = targetHref.indexOf("?");
  if (queryIndex === -1) return null;
  const params = new URLSearchParams(targetHref.slice(queryIndex + 1));
  return parseHighlightValue(params.get("hl"));
}

/**
 * Every distinct icon this notification center actually shows, keyed by a
 * short string built from `type` (+ the parsed `hl` kind, for the two types
 * that need it) — a plain object lookup rather than a function that
 * branches and returns a component, so the icon a given row renders is
 * always one of these same, statically-known references (never a
 * freshly-constructed one per render).
 */
export const NOTIFICATION_ICONS = {
  like_post: Heart,
  like_comment: MessageCircleHeart,
  comment: MessageCircle,
  comment_reply: MessageCircleReply,
  remix: GitBranch,
  follow: UserPlus,
  request_response_new: Code2,
  request_response_selected: CheckCircle2,
  request_response_unselected: RotateCcw,
  request_response_closed: Lock,
  message: Mail,
  message_request: Mail,
  system: Bell,
  merge_request_received: GitMerge,
  merge_request_accepted: CheckCircle2,
  merge_request_rejected: XCircle,
  merge_request_withdrawn: RotateCcw,
  merge_request_cancelled: Ban,
} as const satisfies Record<string, LucideIcon>;

/**
 * The key into `NOTIFICATION_ICONS` for one real event, never a single
 * generic bell for everything (Aşama 2). `type` alone doesn't fully
 * disambiguate two cases — a `like` can be on a post OR a comment/reply,
 * and `request_response` covers four different moments in that workflow —
 * so those two also consult the parsed `hl` (present on every notification
 * created since the migration above; older rows created before it simply
 * fall back to the most common case for that type, a small,
 * honestly-documented cosmetic gap for historical data).
 */
export function getNotificationIconKey(notification: AppNotification): keyof typeof NOTIFICATION_ICONS {
  const highlight = parseHighlightFromHref(notification.targetHref);

  switch (notification.type) {
    case "like":
      return highlight?.kind === "comment" ? "like_comment" : "like_post";
    case "comment":
      return "comment";
    case "comment_reply":
      return "comment_reply";
    case "remix":
      return "remix";
    case "follow":
      return "follow";
    case "request_response":
      if (highlight?.kind === "response_selected") return "request_response_selected";
      if (highlight?.kind === "response_unselected") return "request_response_unselected";
      if (highlight?.kind === "response_new") return "request_response_new";
      return "request_response_closed"; // no hl on this type → the "istek kapandı" case
    case "message":
      return "message";
    case "message_request":
      return "message_request";
    case "merge_request_received":
      return "merge_request_received";
    case "merge_request_accepted":
      return "merge_request_accepted";
    case "merge_request_rejected":
      return "merge_request_rejected";
    case "merge_request_withdrawn":
      return "merge_request_withdrawn";
    case "merge_request_cancelled":
      return "merge_request_cancelled";
    case "system":
    default:
      return "system";
  }
}
