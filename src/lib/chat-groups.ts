/**
 * Grup sohbetinin SAF kuralları (docs/history/172-*; topluluk kuralları için bkz. `communities.ts`): rol/yetki tabloları, doğrulama, davet bağlantısı,
 * sunucu hata kodları ve görünürlük değişikliği sonucunun ayrıştırılması. Çerçeveden bağımsızdır,
 * `npm test` ile sınanır.
 *
 * ÖNEMLİ: buradaki yetki fonksiyonları yalnızca arayüzün NE GÖSTERECEĞİNİ belirler. Gerçek yetki
 * veritabanında (SECURITY DEFINER RPC'ler + RLS) uygulanır; aynı tablo orada da vardır
 * (`supabase/migrations/20260919990000_chat_groups_functions.sql`).
 */
import type { GroupCapability, GroupPostingPolicy, GroupRole, GroupVisibility, RolePermissions } from "@/types";

export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 500;
export const GROUP_REQUEST_MESSAGE_MAX = 300;
export const GROUP_MEMBER_LIMIT_MIN = 2;
export const GROUP_MEMBER_LIMIT_MAX = 1000;
export const GROUP_MEMBER_LIMIT_DEFAULT = 256;
/** Bir seferde en çok kaç kişi davet edilebilir (sunucu da 50'de keser). */
export const GROUP_INVITE_BATCH_MAX = 50;

export const GROUP_ROLES: readonly GroupRole[] = ["owner", "admin", "moderator", "member"];

const ROLE_RANK: Record<GroupRole, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };

export function roleRank(role: GroupRole | null | undefined): number {
  return role ? ROLE_RANK[role] : 0;
}

// ---------------------------------------------------------------------------------------------
// Yetenekler (owner'ın admin/moderatöre verip geri alabildiği yetkiler) — sunucudaki `_group_default_permissions` ile aynı
// ---------------------------------------------------------------------------------------------

export const GROUP_CAPABILITIES: readonly GroupCapability[] = [
  "edit_settings",
  "change_visibility",
  "manage_invites",
  "manage_requests",
  "remove_members",
  "ban_members",
  "manage_roles",
  "delete_messages",
  "pin_messages",
  "moderate_posts",
  "pin_posts",
  "manage_announcements",
  "manage_events",
  "edit_rules",
  "view_stats",
];

/** Moderatöre `manage_roles` verilemez (rütbe kuralı gereği anlamsız; sunucu da reddeder). */
export function capabilitiesFor(role: "admin" | "moderator"): readonly GroupCapability[] {
  return role === "moderator" ? GROUP_CAPABILITIES.filter((cap) => cap !== "manage_roles") : GROUP_CAPABILITIES;
}

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  admin: {
    edit_settings: true, change_visibility: true, manage_invites: true, manage_requests: true, remove_members: true, ban_members: true, manage_roles: true, delete_messages: true, pin_messages: true,
    moderate_posts: true, pin_posts: true, manage_announcements: true, manage_events: true, edit_rules: true, view_stats: true,
  },
  moderator: {
    edit_settings: false, change_visibility: false, manage_invites: false, manage_requests: true, remove_members: true, ban_members: false, manage_roles: false, delete_messages: true, pin_messages: true,
    moderate_posts: true, pin_posts: true, manage_announcements: false, manage_events: false, edit_rules: false, view_stats: false,
  },
};

/** Sunucudan gelen `role_permissions` jsonb'sini tam ve güvenli bir nesneye çevirir (eksik/bozuk anahtar → varsayılan). */
export function normalizeRolePermissions(raw: unknown): RolePermissions {
  const result: RolePermissions = { admin: { ...DEFAULT_ROLE_PERMISSIONS.admin }, moderator: { ...DEFAULT_ROLE_PERMISSIONS.moderator } };
  if (!raw || typeof raw !== "object") return result;
  for (const role of ["admin", "moderator"] as const) {
    const stored = (raw as Record<string, unknown>)[role];
    if (!stored || typeof stored !== "object") continue;
    for (const cap of GROUP_CAPABILITIES) {
      const value = (stored as Record<string, unknown>)[cap];
      if (typeof value === "boolean") result[role][cap] = value;
    }
  }
  return result;
}

/** Bu rol bu yeteneğe sahip mi: owner her zaman; admin/moderator saklı ayara göre; üye hiçbir zaman. `perms` verilmezse varsayılanlar. */
export function can(role: GroupRole | null | undefined, cap: GroupCapability, perms: RolePermissions = DEFAULT_ROLE_PERMISSIONS): boolean {
  if (role === "owner") return true;
  if (role === "admin" || role === "moderator") return perms[role][cap];
  return false;
}

/** Ayarlar sekmesi görünür mü: ayar düzenleme ya da görünürlük yetkisi olan, ya da owner (owner'a özel bölümler). */
export function canSeeSettingsTab(role: GroupRole | null | undefined, perms?: RolePermissions): boolean {
  return role === "owner" || can(role, "edit_settings", perms) || can(role, "change_visibility", perms);
}

/** owner / admin: ayarlar, görünürlük, davet, bağlantı, yasak, rol atama. */
export function isGroupManager(role: GroupRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** owner / admin / moderator: katılma isteklerini yönetir, üye çıkarır, mesaj siler. */
export function isGroupStaff(role: GroupRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "moderator";
}

/** Sunucudaki `remove_chat_group_member` kuralı: kendinden DÜŞÜK rütbeyi çıkarır; moderatör yalnız normal üyeyi. */
export function canRemoveMember(actor: GroupRole | null, target: GroupRole, perms?: RolePermissions): boolean {
  if (!isGroupStaff(actor) || !can(actor, "remove_members", perms)) return false;
  if (roleRank(target) >= roleRank(actor)) return false;
  if (actor === "moderator" && target !== "member") return false;
  return true;
}

/** Yasaklayarak çıkarma yalnız owner/admin'dedir. */
export function canBanMember(actor: GroupRole | null, target: GroupRole, perms?: RolePermissions): boolean {
  return can(actor, "ban_members", perms) && canRemoveMember(actor, target, perms);
}

/**
 * Rol atama (`set_chat_group_member_role`): owner → admin/moderator/member (sahibe dokunamaz);
 * admin → yalnız moderator/member ve yalnız şu an moderatör/üye olanlara. 'owner' buradan verilmez (devir ayrı).
 */
export function assignableRoles(actor: GroupRole | null, target: GroupRole, perms?: RolePermissions): Exclude<GroupRole, "owner">[] {
  if (target === "owner" || !can(actor, "manage_roles", perms)) return [];
  if (actor === "owner") return (["admin", "moderator", "member"] as Exclude<GroupRole, "owner">[]).filter((role) => role !== target);
  if (actor === "admin" && target !== "admin") return (["moderator", "member"] as Exclude<GroupRole, "owner">[]).filter((role) => role !== target);
  return [];
}

/** Yönetici mesaj silme (`moderate_chat_group_message`): kendinden DÜŞÜK rütbedeki göndericinin mesajı. */
export function canModerateMessage(actor: GroupRole | null, senderRole: GroupRole | null, perms?: RolePermissions): boolean {
  if (!isGroupStaff(actor) || !can(actor, "delete_messages", perms)) return false;
  return roleRank(senderRole ?? "member") < roleRank(actor);
}

/** "Kim yazabilir" ayarına göre bu rol yazabilir mi (sunucudaki `can_send_message` ile aynı). */
export function canPostInGroup(role: GroupRole | null, policy: GroupPostingPolicy): boolean {
  if (!role) return false;
  return policy === "members" || isGroupStaff(role);
}

/** Sahip, başka üye varken ayrılamaz (önce devreder); tek kişiyse ayrılmak grubu kapatır. */
export function leaveOutcome(role: GroupRole, memberCount: number): "leave" | "must_transfer" | "closes_group" {
  if (role !== "owner") return "leave";
  return memberCount > 1 ? "must_transfer" : "closes_group";
}

export type GroupFieldProblem = "empty" | "too_long";

export function validateGroupName(raw: string): GroupFieldProblem | null {
  const name = raw.trim();
  if (name.length === 0) return "empty";
  if ([...name].length > GROUP_NAME_MAX) return "too_long";
  return null;
}

export function validateGroupDescription(raw: string): "too_long" | null {
  return [...raw.trim()].length > GROUP_DESCRIPTION_MAX ? "too_long" : null;
}

export function clampMemberLimit(value: number): number {
  if (!Number.isFinite(value)) return GROUP_MEMBER_LIMIT_DEFAULT;
  return Math.min(GROUP_MEMBER_LIMIT_MAX, Math.max(GROUP_MEMBER_LIMIT_MIN, Math.round(value)));
}

// ---------------------------------------------------------------------------------------------
// Davet bağlantısı
// ---------------------------------------------------------------------------------------------

/** Sunucudaki biçimle aynı: yalnızca URL-güvenli base64 karakterleri, 20–100 uzunluk. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

export function isValidGroupToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/**
 * Davet bağlantısı `…/groups/join#<token>` biçimindedir: token URL parçasında (fragment) olduğundan
 * sunucuya, erişim günlüklerine ve Referer'a gitmez. Kullanıcı bağlantının tamamını ya da yalnız token'ı yapıştırabilir.
 */
export function parseGroupJoinToken(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hashIndex = raw.indexOf("#");
  const candidate = hashIndex >= 0 ? raw.slice(hashIndex + 1) : raw;
  const token = candidate.split(/[?&\s]/)[0] ?? "";
  return isValidGroupToken(token) ? token : null;
}

export function buildGroupJoinUrl(origin: string, basePath: string, token: string): string {
  return `${origin}${basePath}/communities/join#${token}`;
}

// ---------------------------------------------------------------------------------------------
// Sunucu hata kodları
// ---------------------------------------------------------------------------------------------

/** `raise exception '<kod>'` ile gelen makine kodları (migration 20260919990000). */
export const GROUP_ERROR_CODES = [
  "not_authenticated",
  "account_suspended",
  "group_not_found",
  "forbidden",
  "invalid_name",
  "invalid_description",
  "invalid_visibility",
  "invalid_member_limit",
  "invalid_avatar",
  "invalid_patch",
  "invalid_posting_policy",
  "invalid_role",
  "invalid_reason",
  "invalid_message",
  "invalid_link",
  "invalid_expiry",
  "invalid_max_uses",
  "group_limit_reached",
  "member_limit_reached",
  "member_limit_below_count",
  "member_groups_limit",
  "already_member",
  "not_a_member",
  "cannot_join",
  "cannot_target_self",
  "owner_must_transfer",
  "request_not_found",
  "request_cooldown",
  "request_limit_reached",
  "invitation_not_found",
  "invalid_state",
  "link_not_found",
  "link_limit_reached",
  "user_banned",
  "not_banned",
  "blocked",
  "no_users",
  "message_not_found",
  // Topluluk (docs/history/175-*)
  "community_closed",
  "rules_not_accepted",
  "rules_missing",
  "invalid_rules",
  "invalid_category",
  "invalid_feed_policy",
  "invalid_content",
  "invalid_note",
  "content_not_found",
  "content_not_public",
  "already_shared",
  "post_rate_limit",
  "post_not_found",
  "pin_limit_reached",
  "invalid_title",
  "invalid_body",
  "announcement_not_found",
  "announcement_limit",
  "event_not_found",
  "event_limit",
  "event_cancelled",
  "event_over",
  "invalid_event_time",
  "invalid_timezone",
  "invalid_location",
  "invalid_url",
  "invalid_rsvp",
  "report_not_found",
  "report_target_not_found",
  "report_limit",
  "already_reported",
  "invalid_action",
  "bookmark_limit",
] as const;

export type GroupErrorCode = (typeof GROUP_ERROR_CODES)[number];

/** Hata metninden (PostgREST `message`) bilinen kodu çıkarır; yoksa null. En uzun eşleşme kazanır (`member_limit_below_count` ⊃ `member_limit`...). */
export function extractGroupErrorCode(message: string | null | undefined): GroupErrorCode | null {
  if (!message) return null;
  const sorted = [...GROUP_ERROR_CODES].sort((a, b) => b.length - a.length);
  return sorted.find((code) => message.includes(code)) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Sunucu sonuçlarının ayrıştırılması
// ---------------------------------------------------------------------------------------------

export type SkippedReason = "blocked" | "banned" | "member_limit";

export interface VisibilityChangeResult {
  changed: boolean;
  visibility: GroupVisibility;
  acceptedCount: number;
  alreadyMemberCount: number;
  skippedCount: number;
  skipped: { requestId: string; userId: string; reason: SkippedReason }[];
  pendingRemaining: number;
  memberCount: number;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** `set_chat_group_visibility` yanıtı; beklenmedik biçimde null döner (arayüz "sonuç okunamadı" göstermez, yeniden çeker). */
export function parseVisibilityResult(raw: unknown): VisibilityChangeResult | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const visibility = row.visibility === "public" || row.visibility === "private" ? row.visibility : null;
  if (!visibility) return null;
  const skippedRaw = Array.isArray(row.skipped) ? row.skipped : [];
  const skipped = skippedRaw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const reason = item.reason;
    if (reason !== "blocked" && reason !== "banned" && reason !== "member_limit") return [];
    if (typeof item.request_id !== "string" || typeof item.user_id !== "string") return [];
    return [{ requestId: item.request_id, userId: item.user_id, reason: reason as SkippedReason }];
  });
  return {
    changed: row.changed === true,
    visibility,
    acceptedCount: asNumber(row.accepted_count),
    alreadyMemberCount: asNumber(row.already_member_count),
    skippedCount: asNumber(row.skipped_count),
    skipped,
    pendingRemaining: asNumber(row.pending_remaining),
    memberCount: asNumber(row.member_count),
  };
}

/** Atlanan başvuruların nedene göre sayısı (sonuç penceresinde "2 üye sınırı, 1 engel…" için). */
export function countSkippedByReason(result: VisibilityChangeResult): Record<SkippedReason, number> {
  const counts: Record<SkippedReason, number> = { blocked: 0, banned: 0, member_limit: 0 };
  for (const entry of result.skipped) counts[entry.reason] += 1;
  return counts;
}

export type InviteSkipReason =
  | "self"
  | "not_found"
  | "blocked"
  | "already_member"
  | "banned"
  | "already_invited"
  | "invite_limit_reached";

export interface InviteResult {
  invitedCount: number;
  skipped: { userId: string; reason: InviteSkipReason }[];
}

const INVITE_SKIP_REASONS: readonly string[] = ["self", "not_found", "blocked", "already_member", "banned", "already_invited", "invite_limit_reached"];

export function parseInviteResult(raw: unknown): InviteResult {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const skippedRaw = Array.isArray(row.skipped) ? row.skipped : [];
  const skipped = skippedRaw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.user_id !== "string" || typeof item.reason !== "string" || !INVITE_SKIP_REASONS.includes(item.reason)) return [];
    return [{ userId: item.user_id, reason: item.reason as InviteSkipReason }];
  });
  return { invitedCount: asNumber(row.invited_count), skipped };
}
