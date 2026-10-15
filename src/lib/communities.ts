/**
 * Topluluk modülünün SAF kuralları (docs/history/175-*): kategori/alan sınırları, sekme erişimi, gönderi/moderasyon yetkisi,
 * bildirim tercihi, etkinlik zamanı (saat dilimi) ve sunucu sonuçlarının ayrıştırılması. Çerçeveden bağımsızdır, `npm test` ile sınanır.
 *
 * ÖNEMLİ: buradaki yetki fonksiyonları yalnızca arayüzün NE GÖSTERECEĞİNİ belirler. Gerçek yetki veritabanındadır
 * (SECURITY DEFINER RPC'ler + RLS: `supabase/migrations/20260920040000…60000_communities_*.sql`); aynı tablo orada da vardır.
 * Grup sohbetinin rol/yetenek kuralları `chat-groups.ts`'te kalır; topluluk onları yeniden kullanır, ikinci bir tablo kurmaz.
 */
import { can, isGroupStaff, roleRank } from "./chat-groups.ts";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { CommunityCategory, CommunityFeedPolicy, CommunityNotifyLevel, GroupRole, GroupVisibility, RolePermissions } from "@/types";

export const COMMUNITY_RULES_MAX = 5000;
export const COMMUNITY_NOTE_MAX = 500;
export const COMMUNITY_TITLE_MAX = 120;
export const COMMUNITY_ANNOUNCEMENT_BODY_MAX = 2000;
export const COMMUNITY_EVENT_DESCRIPTION_MAX = 2000;
export const COMMUNITY_EVENT_LOCATION_MAX = 200;
export const COMMUNITY_EVENT_URL_MAX = 500;
export const COMMUNITY_REPORT_REASON_MIN = 3;
export const COMMUNITY_REPORT_REASON_MAX = 300;
export const COMMUNITY_PINNED_POSTS_MAX = 3;
export const COMMUNITY_PINNED_ANNOUNCEMENTS_MAX = 3;
/** Hatırlatma penceresi (sunucudaki `dispatch_my_event_reminders` ile aynı). */
export const EVENT_REMINDER_WINDOW_HOURS = 24;

// ---------------------------------------------------------------------------------------------
// Kategoriler
// ---------------------------------------------------------------------------------------------

export const COMMUNITY_CATEGORIES: readonly CommunityCategory[] = ["general", "image", "text", "audio", "video", "workflow", "learning", "showcase"];

export const CATEGORY_LABEL_KEYS: Record<CommunityCategory, TranslationKey> = {
  general: "communities.category.general",
  image: "communities.category.image",
  text: "communities.category.text",
  audio: "communities.category.audio",
  video: "communities.category.video",
  workflow: "communities.category.workflow",
  learning: "communities.category.learning",
  showcase: "communities.category.showcase",
};

// ---------------------------------------------------------------------------------------------
// Görünürlük (docs/history/176-*)
// ---------------------------------------------------------------------------------------------

/** Seçicilerde gösterim sırası: en açıktan en kapalıya. */
export const VISIBILITY_OPTIONS: readonly GroupVisibility[] = ["public", "restricted", "private"];

export const VISIBILITY_LABEL_KEYS: Record<GroupVisibility, TranslationKey> = {
  public: "groups.visibility.public",
  restricted: "groups.visibility.restricted",
  private: "groups.visibility.private",
};

export const VISIBILITY_HELP_KEYS: Record<GroupVisibility, TranslationKey> = {
  public: "groups.visibility.publicHelp",
  restricted: "groups.visibility.restrictedHelp",
  private: "groups.visibility.privateHelp",
};

/** Sunucudan gelen değeri güvenli bir değere çevirir; bilinmeyen → en kapalı düzey (sızdırmaz). */
export function normalizeVisibility(value: unknown): GroupVisibility {
  return value === "public" || value === "restricted" ? value : "private";
}

/**
 * Düzeyin davranışı (arayüzün NE GÖSTERECEĞİ; gerçek kural veritabanındadır): Keşfet'te listelenir mi, aramada/öneride bulunur mu,
 * içerik üyelik olmadan okunur mu ve üye olmayan nasıl katılır (`join` doğrudan · `request` yönetici onaylı başvuru · `invite` yalnız davet).
 */
export function visibilityTraits(visibility: GroupVisibility): {
  inDiscover: boolean;
  searchable: boolean;
  publicContent: boolean;
  joinMode: "join" | "request" | "invite";
} {
  if (visibility === "public") return { inDiscover: true, searchable: true, publicContent: true, joinMode: "join" };
  if (visibility === "restricted") return { inDiscover: false, searchable: true, publicContent: false, joinMode: "request" };
  return { inDiscover: false, searchable: false, publicContent: false, joinMode: "invite" };
}

export function isCommunityCategory(value: unknown): value is CommunityCategory {
  return typeof value === "string" && (COMMUNITY_CATEGORIES as readonly string[]).includes(value);
}

/** Sunucudan gelen kategoriyi güvenli bir değere çevirir (bilinmeyen → "general"). */
export function normalizeCategory(value: unknown): CommunityCategory {
  return isCommunityCategory(value) ? value : "general";
}

export function normalizeFeedPolicy(value: unknown): CommunityFeedPolicy {
  return value === "admins" ? "admins" : "members";
}

// ---------------------------------------------------------------------------------------------
// Sekmeler ve erişim
// ---------------------------------------------------------------------------------------------

export type CommunityTab = "overview" | "feed" | "chat" | "members" | "events" | "about" | "manage";

export const COMMUNITY_TABS: readonly CommunityTab[] = ["overview", "feed", "chat", "members", "events", "about", "manage"];

export function isCommunityTab(value: unknown): value is CommunityTab {
  return typeof value === "string" && (COMMUNITY_TABS as readonly string[]).includes(value);
}

/** Yönetim sekmesini açan herhangi bir yetenek (owner her zaman). Gerçek yetki her işlemde sunucudadır. */
const MANAGE_CAPABILITIES = [
  "manage_requests", "manage_invites", "edit_settings", "change_visibility", "remove_members", "ban_members", "manage_roles",
  "delete_messages", "moderate_posts", "pin_posts", "manage_announcements", "manage_events", "edit_rules", "view_stats",
] as const;

export function canSeeManageTab(role: GroupRole | null | undefined, perms?: RolePermissions): boolean {
  if (role === "owner") return true;
  if (role !== "admin" && role !== "moderator") return false;
  return MANAGE_CAPABILITIES.some((cap) => can(role, cap, perms));
}

/**
 * Topluluk sayfasında kullanıcıya hangi sekmeler gösterilir:
 *   üye            → Genel bakış · Akış · Sohbet · Üyeler · Etkinlikler · Hakkında (+ yetkiliyse Yönetim)
 *   üye değil      → herkese açık toplulukta Genel bakış · Akış · Etkinlikler · Hakkında (okuma); kapalı toplulukta yalnızca "geçit" (sekme yok)
 * Sohbet ve üye listesi üyelik gerektirir; kapalı topluluğun içeriği üyelik olmadan okunamaz (RLS de böyle).
 */
export function accessibleTabs(args: { role: GroupRole | null; visibility: GroupVisibility; perms?: RolePermissions }): CommunityTab[] {
  const { role, visibility, perms } = args;
  if (!role) return visibility === "public" ? ["overview", "feed", "events", "about"] : [];
  const tabs: CommunityTab[] = ["overview", "feed", "chat", "members", "events", "about"];
  if (canSeeManageTab(role, perms)) tabs.push("manage");
  return tabs;
}

export function resolveTab(requested: string | null | undefined, allowed: readonly CommunityTab[]): CommunityTab | null {
  if (allowed.length === 0) return null;
  return isCommunityTab(requested) && allowed.includes(requested) ? requested : allowed[0];
}

// ---------------------------------------------------------------------------------------------
// Gönderi / akış yetkileri
// ---------------------------------------------------------------------------------------------

/** Akışta paylaşım: üye + (feed_policy=admins ise yönetim kadrosu) + topluluk açık. Sunucudaki `share_to_community` ile aynı. */
export function canSharePost(role: GroupRole | null, feedPolicy: CommunityFeedPolicy, closed: boolean): boolean {
  if (!role || closed) return false;
  return feedPolicy === "members" || isGroupStaff(role);
}

/** Gönderiyi moderasyonla kaldırma: `moderate_posts` yeteneği + kendinden DÜŞÜK rütbedeki yazar (yazar üye değilse en düşük rütbe). */
export function canModeratePost(actor: GroupRole | null, authorRole: GroupRole | null, authorIsSelf: boolean, perms?: RolePermissions): boolean {
  if (!isGroupStaff(actor) || !can(actor, "moderate_posts", perms)) return false;
  if (authorIsSelf) return true;
  return roleRank(authorRole) < roleRank(actor);
}

/** İçerik toplulukta paylaşılabilir mi: yalnızca YAYINDA ve herkese AÇIK (özel/taslak içerik topluluk yoluyla açılmaz). */
export function isShareableContent(content: { visibility?: string | null; status?: string | null; isDraft?: boolean | null }): boolean {
  return content.visibility === "public" && !content.isDraft && (content.status == null || content.status === "published");
}

// ---------------------------------------------------------------------------------------------
// Bildirim tercihi
// ---------------------------------------------------------------------------------------------

export const NOTIFY_LEVELS: readonly CommunityNotifyLevel[] = ["all", "important", "none"];

/** Süreli sessize alma seçenekleri (saat). */
export const MUTE_DURATIONS_HOURS: readonly number[] = [1, 8, 24, 168];

export function normalizeNotifyLevel(value: unknown): CommunityNotifyLevel {
  return value === "important" || value === "none" ? value : "all";
}

/** Etkin düzey: süreli sessize alma sürüyorsa 'none' (sunucudaki `_community_notify_level` ile aynı). */
export function effectiveNotifyLevel(level: CommunityNotifyLevel, mutedUntil: string | null, now: Date = new Date()): CommunityNotifyLevel {
  if (mutedUntil && new Date(mutedUntil).getTime() > now.getTime()) return "none";
  return level;
}

export function muteUntilIso(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

export function isTemporarilyMuted(mutedUntil: string | null, now: Date = new Date()): boolean {
  return Boolean(mutedUntil) && new Date(mutedUntil as string).getTime() > now.getTime();
}

// ---------------------------------------------------------------------------------------------
// Etkinlik zamanı (saat dilimi)
// ---------------------------------------------------------------------------------------------

/** Seçicide sunulan yaygın saat dilimleri (tarayıcınınki ayrıca başa eklenir). Sunucu `pg_timezone_names` ile doğrular. */
export const COMMON_TIMEZONES: readonly string[] = [
  "Europe/Istanbul", "UTC", "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Moscow", "Asia/Dubai", "Asia/Kolkata",
  "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "America/Sao_Paulo", "America/New_York",
  "America/Chicago", "America/Denver", "America/Los_Angeles",
];

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function browserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

export function timezoneOptions(extra?: string | null): string[] {
  const list = [...COMMON_TIMEZONES];
  for (const tz of [extra, browserTimeZone()]) if (tz && isValidTimeZone(tz) && !list.includes(tz)) list.unshift(tz);
  return list;
}

function zonedParts(instant: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const part of fmt.formatToParts(instant)) if (part.type !== "literal") parts[part.type] = Number(part.value);
  return parts;
}

/** `tz`'in `instant` anındaki UTC farkı (ms): duvar saati − UTC. */
function zoneOffsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * `<input type="datetime-local">` değeri ("2026-10-20T19:30"), `tz` saat diliminin DUVAR SAATİ olarak yorumlanır → ISO an.
 * Yaz saati geçişlerinde iki geçişli düzeltme yapılır. Geçersiz girdi → null.
 */
export function zonedLocalToIso(local: string, tz: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match || !isValidTimeZone(tz)) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let guess = naive - zoneOffsetMs(new Date(naive), tz);
  guess = naive - zoneOffsetMs(new Date(guess), tz);
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** ISO an → `tz` duvar saati olarak "YYYY-MM-DDTHH:mm" (düzenleme formunu doldurmak için). */
export function isoToZonedLocal(iso: string, tz: string): string {
  const p = zonedParts(new Date(iso), tz);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour === 24 ? 0 : p.hour)}:${pad(p.minute)}`;
}

export function formatEventDateTime(iso: string, tz: string, language: "tr" | "en"): string {
  try {
    return new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-US", {
      timeZone: tz, dateStyle: "medium", timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatEventRange(startIso: string, endIso: string | null, tz: string, language: "tr" | "en"): string {
  const start = formatEventDateTime(startIso, tz, language);
  if (!endIso) return start;
  const sameDay = isoToZonedLocal(startIso, tz).slice(0, 10) === isoToZonedLocal(endIso, tz).slice(0, 10);
  if (!sameDay) return `${start} – ${formatEventDateTime(endIso, tz, language)}`;
  try {
    const endTime = new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-US", { timeZone: tz, timeStyle: "short" }).format(new Date(endIso));
    return `${start} – ${endTime}`;
  } catch {
    return start;
  }
}

export type RsvpStatus = "going" | "maybe" | "not_going";
export type EventPhase = "upcoming" | "live" | "past" | "cancelled";

/** Sunucudaki kural: bitiş yoksa başlangıçtan 3 saat sonra "bitti" sayılır. */
export const EVENT_DEFAULT_DURATION_HOURS = 3;

export function eventPhase(event: { status: "scheduled" | "cancelled"; startsAt: string; endsAt: string | null }, now: Date = new Date()): EventPhase {
  if (event.status === "cancelled") return "cancelled";
  const start = new Date(event.startsAt).getTime();
  const end = event.endsAt ? new Date(event.endsAt).getTime() : start + EVENT_DEFAULT_DURATION_HOURS * 3_600_000;
  if (now.getTime() >= end) return "past";
  if (now.getTime() >= start) return "live";
  return "upcoming";
}

export function canRsvp(phase: EventPhase): boolean {
  return phase === "upcoming" || phase === "live";
}

export type EventFieldProblem = "title" | "time" | "timezone" | "url" | "location" | "description";

/** Etkinlik formu doğrulaması (sunucu aynısını yeniden uygular). Sorun yoksa boş dizi. */
export function validateEventInput(input: {
  title: string; description: string; startsAtIso: string | null; endsAtIso: string | null; timezone: string; location: string; onlineUrl: string; mustBeFuture: boolean; now?: Date;
}): EventFieldProblem[] {
  const problems: EventFieldProblem[] = [];
  const now = input.now ?? new Date();
  const title = input.title.trim();
  if (title.length < 1 || [...title].length > COMMUNITY_TITLE_MAX) problems.push("title");
  if ([...input.description.trim()].length > COMMUNITY_EVENT_DESCRIPTION_MAX) problems.push("description");
  if (!input.startsAtIso) problems.push("time");
  else {
    const start = new Date(input.startsAtIso).getTime();
    if (input.mustBeFuture && start <= now.getTime()) problems.push("time");
    if (input.endsAtIso && new Date(input.endsAtIso).getTime() <= start && !problems.includes("time")) problems.push("time");
  }
  if (!isValidTimeZone(input.timezone)) problems.push("timezone");
  if ([...input.location.trim()].length > COMMUNITY_EVENT_LOCATION_MAX) problems.push("location");
  const url = input.onlineUrl.trim();
  if (url && (url.length > COMMUNITY_EVENT_URL_MAX || !/^https?:\/\/\S+$/i.test(url))) problems.push("url");
  return problems;
}

// ---------------------------------------------------------------------------------------------
// İstatistik
// ---------------------------------------------------------------------------------------------

export interface CommunityStats {
  days: number;
  members: { total: number; joined: number; left: number; net: number };
  posts: { total: number; inPeriod: number; authorsInPeriod: number };
  engagement: { likes: number; comments: number };
  events: { total: number; upcoming: number; inPeriod: number; goingInPeriod: number; goingUpcoming: number };
  chat: { messagesInPeriod: number; activeSendersInPeriod: number };
  queue: { pendingRequests: number; pendingInvitations: number; openReports: number };
  series: { day: string; joined: number; posts: number; messages: number }[];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** `community_stats` yanıtını tam ve güvenli bir nesneye çevirir (eksik alan → 0). */
export function parseCommunityStats(raw: unknown): CommunityStats | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const members = obj(row.members), posts = obj(row.posts), engagement = obj(row.engagement), events = obj(row.events), chat = obj(row.chat), queue = obj(row.queue);
  const series = Array.isArray(row.series)
    ? row.series.flatMap((entry) => {
        const item = obj(entry);
        return typeof item.day === "string" ? [{ day: item.day, joined: num(item.joined), posts: num(item.posts), messages: num(item.messages) }] : [];
      })
    : [];
  return {
    days: num(row.days),
    members: { total: num(members.total), joined: num(members.joined), left: num(members.left), net: num(members.net) },
    posts: { total: num(posts.total), inPeriod: num(posts.in_period), authorsInPeriod: num(posts.authors_in_period) },
    engagement: { likes: num(engagement.likes), comments: num(engagement.comments) },
    events: {
      total: num(events.total), upcoming: num(events.upcoming), inPeriod: num(events.in_period),
      goingInPeriod: num(events.going_in_period), goingUpcoming: num(events.going_upcoming),
    },
    chat: { messagesInPeriod: num(chat.messages_in_period), activeSendersInPeriod: num(chat.active_senders_in_period) },
    queue: { pendingRequests: num(queue.pending_requests), pendingInvitations: num(queue.pending_invitations), openReports: num(queue.open_reports) },
    series,
  };
}

// ---------------------------------------------------------------------------------------------
// Yollar
// ---------------------------------------------------------------------------------------------

/** Topluluk detay adresi (statik export: kimlik sorgu parametresindedir). */
export function communityHref(id: string, tab?: CommunityTab): string {
  return `/communities/local?id=${encodeURIComponent(id)}${tab && tab !== "overview" ? `&tab=${tab}` : ""}`;
}

/** Topluluğun sohbeti, Mesajlar çalışma alanındaki grup sohbetidir (ikinci bir sohbet ekranı yoktur). */
export function communityChatHref(id: string): string {
  return `/messages/local?id=${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------------------------------------
// Denetim kaydı eylem adları → çeviri anahtarı
// ---------------------------------------------------------------------------------------------

/** `chat_group_audit.action` değerlerinin bilinenleri; bilinmeyen eylem "diğer işlem" olarak gösterilir (ham kod sızmaz). */
export const AUDIT_ACTIONS = [
  "group_created", "community_created", "community_updated", "community_closed", "community_reopened", "group_deleted", "settings_updated",
  "visibility_changed", "owner_settings_updated", "member_joined", "member_left", "member_removed", "member_banned", "member_unbanned",
  "role_changed", "ownership_transferred", "ownership_auto_transferred", "invitation_sent", "invitation_accepted", "invitation_declined",
  "invitation_cancelled", "request_created", "request_accepted", "request_rejected", "link_created", "link_revoked", "message_deleted",
  "message_pinned", "message_unpinned", "post_removed", "post_pinned", "post_unpinned", "announcement_published", "announcement_updated",
  "announcement_deleted", "event_created", "event_updated", "event_cancelled", "event_deleted", "report_dismiss", "report_remove",
] as const;

export function auditActionKey(action: string): TranslationKey {
  return ((AUDIT_ACTIONS as readonly string[]).includes(action) ? `communities.audit.action.${action}` : "communities.audit.action.other") as TranslationKey;
}
