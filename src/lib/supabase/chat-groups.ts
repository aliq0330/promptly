import { supabase } from "./client";
import { translateForRuntime, type TranslationKey } from "@/lib/i18n/translations";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { resizeImageToSquareBlob } from "@/lib/utils";
import {
  extractGroupErrorCode,
  normalizeRolePermissions,
  parseInviteResult,
  parseVisibilityResult,
  type GroupErrorCode,
  type InviteResult,
  type VisibilityChangeResult,
} from "@/lib/chat-groups";
import { normalizeCategory, normalizeFeedPolicy, normalizeVisibility } from "@/lib/communities";
import type { ChatGroup, CommunityCategory, GroupCapability, GroupPostingPolicy, GroupRole, GroupVisibility, UserProfile } from "@/types";

/**
 * Grup sohbeti veri erişimi (docs/history/172-*). Her yazma işlemi bir SECURITY DEFINER RPC'dir
 * (kimlik auth.uid()'den, yetki ve kurallar veritabanında); burası yalnızca çağırır, sonucu tiplendirir
 * ve sunucunun makine kodlarını kullanıcıya çevrilmiş mesaja dönüştürür.
 */

/** Sunucu hata kodu → çeviri anahtarı. `Record<GroupErrorCode, …>` yeni bir kod eklenip çevrilmezse derlemeyi kırar. */
const ERROR_KEYS: Record<GroupErrorCode, TranslationKey> = {
  not_authenticated: "groups.error.not_authenticated",
  account_suspended: "groups.error.account_suspended",
  group_not_found: "groups.error.group_not_found",
  forbidden: "groups.error.forbidden",
  invalid_name: "groups.error.invalid_name",
  invalid_description: "groups.error.invalid_description",
  invalid_visibility: "groups.error.generic",
  invalid_member_limit: "groups.error.invalid_member_limit",
  invalid_avatar: "groups.error.invalid_avatar",
  invalid_patch: "groups.error.generic",
  invalid_posting_policy: "groups.error.generic",
  invalid_role: "groups.error.generic",
  invalid_reason: "groups.error.invalid_reason",
  invalid_message: "groups.error.invalid_message",
  invalid_link: "groups.error.invalid_link",
  invalid_expiry: "groups.error.generic",
  invalid_max_uses: "groups.error.generic",
  group_limit_reached: "groups.error.group_limit_reached",
  member_limit_reached: "groups.error.member_limit_reached",
  member_limit_below_count: "groups.error.member_limit_below_count",
  member_groups_limit: "groups.error.member_groups_limit",
  already_member: "groups.error.already_member",
  not_a_member: "groups.error.not_a_member",
  cannot_join: "groups.error.cannot_join",
  cannot_target_self: "groups.error.cannot_target_self",
  owner_must_transfer: "groups.error.owner_must_transfer",
  request_not_found: "groups.error.request_not_found",
  request_cooldown: "groups.error.request_cooldown",
  request_limit_reached: "groups.error.request_limit_reached",
  invitation_not_found: "groups.error.invitation_not_found",
  invalid_state: "groups.error.invalid_state",
  link_not_found: "groups.error.link_not_found",
  link_limit_reached: "groups.error.link_limit_reached",
  user_banned: "groups.error.user_banned",
  not_banned: "groups.error.invalid_state",
  blocked: "groups.error.blocked",
  no_users: "groups.error.no_users",
  message_not_found: "groups.error.message_not_found",
  // Topluluk (docs/history/175-*)
  community_closed: "communities.error.community_closed",
  rules_not_accepted: "communities.error.rules_not_accepted",
  rules_missing: "communities.error.rules_missing",
  invalid_rules: "communities.error.invalid_rules",
  invalid_category: "communities.error.generic",
  invalid_feed_policy: "communities.error.generic",
  invalid_content: "communities.error.generic",
  invalid_note: "communities.error.invalid_note",
  content_not_found: "communities.error.content_not_found",
  content_not_public: "communities.error.content_not_public",
  already_shared: "communities.error.already_shared",
  post_rate_limit: "communities.error.post_rate_limit",
  invalid_parent: "communities.error.generic",
  community_draft_not_allowed: "communities.error.community_draft_not_allowed",
  community_immutable: "communities.error.community_immutable",
  community_content_not_readable: "communities.error.community_content_not_readable",
  community_post_not_savable: "communities.error.community_post_not_savable",
  community_post_not_found: "communities.error.post_not_found",
  post_not_found: "communities.error.post_not_found",
  pin_limit_reached: "communities.error.pin_limit_reached",
  invalid_title: "communities.error.invalid_title",
  invalid_body: "communities.error.invalid_body",
  announcement_not_found: "communities.error.announcement_not_found",
  announcement_limit: "communities.error.announcement_limit",
  event_not_found: "communities.error.event_not_found",
  event_limit: "communities.error.event_limit",
  event_cancelled: "communities.error.event_cancelled",
  event_over: "communities.error.event_over",
  invalid_event_time: "communities.error.invalid_event_time",
  invalid_timezone: "communities.error.invalid_timezone",
  invalid_location: "communities.error.invalid_location",
  invalid_url: "communities.error.invalid_url",
  invalid_rsvp: "communities.error.generic",
  report_not_found: "communities.error.report_not_found",
  report_target_not_found: "communities.error.report_target_not_found",
  report_limit: "communities.error.report_limit",
  already_reported: "communities.error.already_reported",
  invalid_action: "communities.error.generic",
};

export class GroupActionError extends Error {
  code: GroupErrorCode | null;
  constructor(code: GroupErrorCode | null, message: string) {
    super(message);
    this.name = "GroupActionError";
    this.code = code;
  }
}

/** PostgREST/ağ hatasını çevrilmiş `GroupActionError`'a çevirir (bilinmeyen hata → genel mesaj, ham SQL metni asla gösterilmez). */
export function toGroupError(error: { message?: string } | null | undefined): GroupActionError {
  const code = extractGroupErrorCode(error?.message);
  return new GroupActionError(code, translateForRuntime(code ? ERROR_KEYS[code] : "groups.error.generic"));
}

export async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toGroupError(error);
  return data as T;
}

// ---------------------------------------------------------------------------------------------
// Satır → model
// ---------------------------------------------------------------------------------------------

export interface ChatGroupRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  visibility: GroupVisibility;
  posting_policy: GroupPostingPolicy;
  member_limit: number;
  member_count: number;
  pending_request_count: number;
  history_visible: boolean;
  members_can_pin: boolean;
  role_permissions: unknown;
  created_at: string;
  category: string;
  feed_policy: string;
  rules: string | null;
  rules_version: number;
  rules_required: boolean;
  closed_at: string | null;
  post_count: number;
  origin: string;
}

export const CHAT_GROUP_SELECT =
  "id, name, description, avatar_url, visibility, posting_policy, member_limit, member_count, pending_request_count, history_visible, members_can_pin, role_permissions, created_at, category, feed_policy, rules, rules_version, rules_required, closed_at, post_count, origin";

export function mapChatGroupRow(row: ChatGroupRow, myRole: GroupRole): ChatGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    visibility: row.visibility,
    postingPolicy: row.posting_policy,
    memberLimit: row.member_limit,
    memberCount: row.member_count,
    pendingRequestCount: row.pending_request_count,
    historyVisible: Boolean(row.history_visible),
    membersCanPin: Boolean(row.members_can_pin),
    rolePermissions: normalizeRolePermissions(row.role_permissions),
    createdAt: row.created_at,
    myRole,
    category: normalizeCategory(row.category),
    feedPolicy: normalizeFeedPolicy(row.feed_policy),
    rules: row.rules,
    rulesVersion: row.rules_version ?? 1,
    rulesRequired: Boolean(row.rules_required),
    closedAt: row.closed_at,
    postCount: row.post_count ?? 0,
    origin: row.origin === "legacy_group" ? "legacy_group" : "native",
  };
}

// ---------------------------------------------------------------------------------------------
// Oluşturma / ayarlar
// ---------------------------------------------------------------------------------------------

export interface CreateChatGroupInput {
  name: string;
  description: string;
  visibility: GroupVisibility;
  avatarUrl: string | null;
  memberLimit: number;
  inviteUserIds: string[];
}

export async function createChatGroup(input: CreateChatGroupInput): Promise<{ groupId: string; invite: InviteResult }> {
  const data = await callRpc<{ group_id: string; invited_count: number; skipped: unknown }>("create_chat_group", {
    p_name: input.name.trim(),
    p_description: input.description.trim() || null,
    p_visibility: input.visibility,
    p_avatar_url: input.avatarUrl,
    p_member_limit: input.memberLimit,
    p_invite_user_ids: input.inviteUserIds,
  });
  return { groupId: data.group_id, invite: parseInviteResult(data) };
}

export interface UpdateChatGroupPatch {
  name?: string;
  description?: string;
  avatarUrl?: string | null;
  memberLimit?: number;
  postingPolicy?: GroupPostingPolicy;
}

/** Yalnızca verilen alanlar gönderilir (sunucu da yalnız varolan anahtarları uygular). */
export async function updateChatGroup(groupId: string, patch: UpdateChatGroupPatch): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.description !== undefined) body.description = patch.description.trim();
  if (patch.avatarUrl !== undefined) body.avatar_url = patch.avatarUrl;
  if (patch.memberLimit !== undefined) body.member_limit = patch.memberLimit;
  if (patch.postingPolicy !== undefined) body.posting_policy = patch.postingPolicy;
  await callRpc("update_chat_group", { p_group_id: groupId, p_patch: body });
}

/**
 * Yalnızca OWNER: geçmiş görünürlüğü ve admin/moderatör yetkileri. `rolePermissions` yalnızca DEĞİŞEN bayrakları taşır
 * (`{ moderator: { edit_settings: true } }`); sunucu bilinmeyen anahtarı reddeder, kalan bayraklar korunur.
 */
export async function updateChatGroupOwnerSettings(
  groupId: string,
  patch: { historyVisible?: boolean; membersCanPin?: boolean; rolePermissions?: Partial<Record<"admin" | "moderator", Partial<Record<GroupCapability, boolean>>>> },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.historyVisible !== undefined) body.history_visible = patch.historyVisible;
  if (patch.membersCanPin !== undefined) body.members_can_pin = patch.membersCanPin;
  if (patch.rolePermissions !== undefined) body.role_permissions = patch.rolePermissions;
  await callRpc("update_chat_group_owner_settings", { p_group_id: groupId, p_patch: body });
}

/** Görünürlük + (kapalı → açıkta) bekleyen isteklerin toplu kabulü: sunucuda TEK atomik işlem. */
export async function setChatGroupVisibility(groupId: string, visibility: GroupVisibility): Promise<VisibilityChangeResult> {
  const data = await callRpc<unknown>("set_chat_group_visibility", { p_group_id: groupId, p_visibility: visibility });
  const parsed = parseVisibilityResult(data);
  if (!parsed) throw toGroupError(null);
  return parsed;
}

/**
 * Grup görselini herkese açık `avatars` bucket'ına yükler (profil avatarıyla aynı altyapı; yalnız kendi klasörüne
 * yazılabilir). Her yükleme benzersiz bir dosya adı alır → eski görsel önbellekte kalsa da yenisi hemen görünür;
 * eski dosya kullanılmadığında yetim temizliği (`orphan_storage_objects`) süpürür.
 */
export async function uploadGroupAvatar(userId: string, file: File): Promise<string> {
  const { blob, contentType } = await resizeImageToSquareBlob(file, 320);
  const path = `${userId}/group-${crypto.randomUUID()}.jpg`;
  // ÖZEL bucket (docs/history/177-*): dosya yalnız topluluğun kartı görülebildiği sürece okunur; satırda saklanan URL kimliktir,
  // gösterirken signed URL'ye çevrilir (`PROTECTED_MEDIA_BUCKETS`). Ortak `avatars` bucket'ı listelenebilir olduğundan kullanılmaz.
  const { error } = await supabase.storage.from("community-avatars").upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("community-avatars").getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------------------------------------
// Katılma, istekler, davetler
// ---------------------------------------------------------------------------------------------

export type JoinOutcome = "joined" | "already_member" | "requested" | "already_requested";

export async function joinChatGroup(groupId: string): Promise<"joined" | "already_member"> {
  const data = await callRpc<{ outcome: string }>("join_chat_group", { p_group_id: groupId });
  return data.outcome === "already_member" ? "already_member" : "joined";
}

export async function joinChatGroupViaLink(token: string, message: string): Promise<{ outcome: JoinOutcome; groupId: string | null }> {
  const data = await callRpc<{ outcome: JoinOutcome; group_id: string | null }>("join_chat_group_via_link", {
    p_token: token,
    p_message: message.trim() || null,
  });
  return { outcome: data.outcome, groupId: data.group_id ?? null };
}

export interface GroupLinkPreview {
  valid: boolean;
  groupId: string | null;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  visibility: GroupVisibility;
  memberCount: number;
  memberLimit: number;
  myStatus: "member" | "requested" | "none";
}

export async function previewChatGroupLink(token: string): Promise<GroupLinkPreview | null> {
  const data = await callRpc<Record<string, unknown>>("preview_chat_group_link", { p_token: token });
  if (!data || data.valid !== true) return null;
  return {
    valid: true,
    groupId: typeof data.group_id === "string" ? data.group_id : null,
    name: String(data.name ?? ""),
    description: typeof data.description === "string" ? data.description : null,
    avatarUrl: typeof data.avatar_url === "string" ? data.avatar_url : null,
    visibility: normalizeVisibility(data.visibility),
    memberCount: Number(data.member_count ?? 0),
    memberLimit: Number(data.member_limit ?? 0),
    myStatus: data.my_status === "member" || data.my_status === "requested" ? data.my_status : "none",
  };
}

export async function cancelJoinRequest(requestId: string): Promise<void> {
  await callRpc("cancel_chat_group_join_request", { p_request_id: requestId });
}

export async function decideJoinRequest(requestId: string, accept: boolean): Promise<"accepted" | "rejected" | "already_member"> {
  const data = await callRpc<{ outcome: "accepted" | "rejected" | "already_member" }>("decide_chat_group_join_request", {
    p_request_id: requestId,
    p_accept: accept,
  });
  return data.outcome;
}

export async function inviteToChatGroup(groupId: string, userIds: string[]): Promise<InviteResult> {
  const data = await callRpc<unknown>("invite_to_chat_group", { p_group_id: groupId, p_user_ids: userIds });
  return parseInviteResult(data);
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  await callRpc("cancel_chat_group_invitation", { p_invitation_id: invitationId });
}

export async function respondToInvitation(
  invitationId: string,
  accept: boolean,
): Promise<{ outcome: "accepted" | "declined" | "expired" | "already_member"; groupId: string | null }> {
  const data = await callRpc<{ outcome: "accepted" | "declined" | "expired" | "already_member"; group_id?: string }>(
    "respond_chat_group_invitation",
    { p_invitation_id: invitationId, p_accept: accept },
  );
  return { outcome: data.outcome, groupId: data.group_id ?? null };
}

// ---------------------------------------------------------------------------------------------
// Bağlantılar
// ---------------------------------------------------------------------------------------------

export interface CreatedGroupLink {
  linkId: string;
  /** Ham token YALNIZCA bu yanıtta vardır; veritabanında yalnız özeti saklanır. */
  token: string;
  expiresAt: string;
  maxUses: number | null;
}

export async function createChatGroupLink(groupId: string, expiresHours: number, maxUses: number | null): Promise<CreatedGroupLink> {
  const data = await callRpc<{ link_id: string; token: string; expires_at: string; max_uses: number | null }>("create_chat_group_link", {
    p_group_id: groupId,
    p_expires_hours: expiresHours,
    p_max_uses: maxUses,
  });
  return { linkId: data.link_id, token: data.token, expiresAt: data.expires_at, maxUses: data.max_uses };
}

export async function revokeChatGroupLink(linkId: string): Promise<void> {
  await callRpc("revoke_chat_group_link", { p_link_id: linkId });
}

export interface GroupLinkInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
}

/** Yönetici için etkin (iptal edilmemiş, süresi dolmamış) bağlantılar. `token_hash` sütunu istemciye verilmez. */
export async function fetchGroupLinks(groupId: string): Promise<GroupLinkInfo[]> {
  const { data, error } = await supabase
    .from("chat_group_links")
    .select("id, created_at, expires_at, revoked_at, max_uses, use_count")
    .eq("group_id", groupId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw toGroupError(error);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    maxUses: (row.max_uses as number | null) ?? null,
    useCount: row.use_count as number,
  }));
}

// ---------------------------------------------------------------------------------------------
// Üyelik yönetimi
// ---------------------------------------------------------------------------------------------

export async function leaveChatGroup(groupId: string): Promise<void> {
  await callRpc("leave_chat_group", { p_group_id: groupId });
}

export async function removeChatGroupMember(groupId: string, userId: string, options: { ban?: boolean; reason?: string } = {}): Promise<void> {
  await callRpc("remove_chat_group_member", {
    p_group_id: groupId,
    p_user_id: userId,
    p_ban: Boolean(options.ban),
    p_reason: options.reason?.trim() || null,
  });
}

export async function unbanChatGroupMember(groupId: string, userId: string): Promise<void> {
  await callRpc("unban_chat_group_member", { p_group_id: groupId, p_user_id: userId });
}

export async function setChatGroupMemberRole(groupId: string, userId: string, role: Exclude<GroupRole, "owner">): Promise<void> {
  await callRpc("set_chat_group_member_role", { p_group_id: groupId, p_user_id: userId, p_role: role });
}

export async function transferChatGroupOwnership(groupId: string, userId: string): Promise<void> {
  await callRpc("transfer_chat_group_ownership", { p_group_id: groupId, p_user_id: userId });
}

export async function deleteChatGroup(groupId: string): Promise<void> {
  await callRpc("delete_chat_group", { p_group_id: groupId });
}

/** Yönetici olarak (daha düşük rütbedeki üyenin) mesajını herkes için temizler. */
export async function moderateChatGroupMessage(messageId: string): Promise<void> {
  await callRpc("moderate_chat_group_message", { p_message_id: messageId });
}

/** Kişisel sessize alma: yalnız kendi üyelik satırı (RLS); "0 satır" başarı sayılmaz. */
export async function setChatGroupMuted(groupId: string, userId: string, muted: boolean): Promise<string | null> {
  const mutedAt = muted ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("conversation_members")
    .update({ muted_at: mutedAt })
    .eq("conversation_id", groupId)
    .eq("user_id", userId)
    .select("conversation_id")
    .maybeSingle();
  if (error) throw toGroupError(error);
  if (!data) throw toGroupError(null);
  return mutedAt;
}

// ---------------------------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------------------------

export type DiscoverSort = "popular" | "newest" | "active";

export interface DiscoveredGroup {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  memberLimit: number;
  createdAt: string;
  lastMessageAt: string | null;
  myStatus: "member" | "invited" | "requested" | "none";
}

export const DISCOVER_PAGE_SIZE = 20;

/** Yalnız herkese açık gruplar (sunucu zorlar). `limit + 1` istenir: fazladan satır "daha var" demektir. */
export async function discoverChatGroups(params: { query: string; sort: DiscoverSort; offset: number }): Promise<{ groups: DiscoveredGroup[]; hasMore: boolean }> {
  const rows = await callRpc<
    {
      id: string;
      name: string;
      description: string | null;
      avatar_url: string | null;
      member_count: number;
      member_limit: number;
      created_at: string;
      last_message_at: string | null;
      my_status: DiscoveredGroup["myStatus"];
    }[]
  >("discover_chat_groups", {
    p_query: params.query.trim() || null,
    p_sort: params.sort,
    p_limit: DISCOVER_PAGE_SIZE + 1,
    p_offset: params.offset,
  });
  const list = rows ?? [];
  return {
    hasMore: list.length > DISCOVER_PAGE_SIZE,
    groups: list.slice(0, DISCOVER_PAGE_SIZE).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      avatarUrl: row.avatar_url,
      memberCount: row.member_count,
      memberLimit: row.member_limit,
      createdAt: row.created_at,
      lastMessageAt: row.last_message_at,
      myStatus: row.my_status,
    })),
  };
}

export interface GroupMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt: string;
}

export const MEMBER_PAGE_SIZE = 30;

export async function fetchChatGroupMembers(groupId: string, params: { search: string; offset: number }): Promise<{ members: GroupMember[]; hasMore: boolean }> {
  const rows = await callRpc<
    { user_id: string; username: string; display_name: string; avatar_url: string | null; role: GroupRole; joined_at: string }[]
  >("chat_group_members", {
    p_group_id: groupId,
    p_search: params.search.trim() || null,
    p_limit: MEMBER_PAGE_SIZE + 1,
    p_offset: params.offset,
  });
  const list = rows ?? [];
  return {
    hasMore: list.length > MEMBER_PAGE_SIZE,
    members: list.slice(0, MEMBER_PAGE_SIZE).map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      role: row.role,
      joinedAt: row.joined_at,
    })),
  };
}

export const PROFILE_EMBED = "id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests";

export interface GroupJoinRequest {
  id: string;
  groupId: string;
  user: UserProfile;
  message: string | null;
  createdAt: string;
}

/** Bekleyen başvurular (yetkili için), eskiden yeniye. */
export async function fetchGroupJoinRequests(groupId: string): Promise<GroupJoinRequest[]> {
  const { data, error } = await supabase
    .from("chat_group_join_requests")
    .select(`id, group_id, message, created_at, profiles:user_id ( ${PROFILE_EMBED} )`)
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw toGroupError(error);
  return ((data ?? []) as unknown as { id: string; group_id: string; message: string | null; created_at: string; profiles: ProfileRow | null }[])
    .filter((row) => row.profiles)
    .map((row) => ({ id: row.id, groupId: row.group_id, user: mapProfileRow(row.profiles as ProfileRow), message: row.message, createdAt: row.created_at }));
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  group: { name: string; avatarUrl: string | null; memberCount: number; description: string | null; rules: string | null; rulesRequired: boolean } | null;
  user: UserProfile | null;
  inviter: UserProfile | null;
  createdAt: string;
  expiresAt: string;
}

/** Bir grubun bekleyen davetleri (owner/admin; RLS zaten yalnız onlara verir). */
export async function fetchGroupInvitations(groupId: string): Promise<GroupInvitation[]> {
  const { data, error } = await supabase
    .from("chat_group_invitations")
    .select(`id, group_id, created_at, expires_at, invitee:invitee_id ( ${PROFILE_EMBED} )`)
    .eq("group_id", groupId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw toGroupError(error);
  return ((data ?? []) as unknown as { id: string; group_id: string; created_at: string; expires_at: string; invitee: ProfileRow | null }[]).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    group: null,
    user: row.invitee ? mapProfileRow(row.invitee) : null,
    inviter: null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

// ---------------------------------------------------------------------------------------------
// Topluluk KARTI (üye olmayanın gördüğü tek şey)
// ---------------------------------------------------------------------------------------------

/**
 * Üye olmayanın (ziyaretçi, yabancı, davetli, başvuran) bir topluluktan görebildiği alanlar. `chat_groups` satırı yalnız üyelere okunur;
 * kart `community_cards` RPC'sinden gelir ve yönetim alanlarını (oluşturan, bekleyen başvuru sayısı, yetki matrisi…) HİÇ içermez.
 * Görülemeyen / tamamen kapalı / olmayan topluluk için kart yoktur (`null`): ayırt edilemez.
 */
export interface CommunityCard {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  category: CommunityCategory;
  visibility: GroupVisibility;
  memberCount: number;
  memberLimit: number;
  rules: string | null;
  rulesRequired: boolean;
  rulesVersion: number;
  closedAt: string | null;
  origin: "native" | "legacy_group";
  /** Yalnız herkese açık topluluk ya da üye için; kapalı topluluğun içerik sayacı üye olmayana verilmez. */
  postCount: number | null;
  createdAt: string;
}

interface CardRow {
  id: string; name: string; description: string | null; avatar_url: string | null; category: string; visibility: string; member_count: number; member_limit: number;
  rules: string | null; rules_required: boolean; rules_version: number; closed_at: string | null; origin: string; post_count: number | null; created_at: string;
}

export async function fetchCommunityCards(ids: string[]): Promise<CommunityCard[]> {
  const unique = [...new Set(ids)].slice(0, 50);
  if (unique.length === 0) return [];
  const rows = await callRpc<CardRow[]>("community_cards", { p_ids: unique });
  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    category: normalizeCategory(row.category),
    visibility: normalizeVisibility(row.visibility),
    memberCount: row.member_count,
    memberLimit: row.member_limit,
    rules: row.rules,
    rulesRequired: Boolean(row.rules_required),
    rulesVersion: row.rules_version ?? 1,
    closedAt: row.closed_at,
    origin: row.origin === "legacy_group" ? "legacy_group" : "native",
    postCount: row.post_count,
    createdAt: row.created_at,
  }));
}

/** Bana gelen bekleyen davetler. Topluluk kartı `community_cards` RPC'sinden gelir (`chat_groups` satırı üye olmayana okunmaz). */
export async function fetchMyInvitations(userId: string): Promise<GroupInvitation[]> {
  const { data, error } = await supabase
    .from("chat_group_invitations")
    .select(
      `id, group_id, created_at, expires_at, inviter:inviter_id ( ${PROFILE_EMBED} )`,
    )
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw toGroupError(error);
  type Row = {
    id: string;
    group_id: string;
    created_at: string;
    expires_at: string;
    inviter: ProfileRow | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const cards = new Map((await fetchCommunityCards(rows.map((row) => row.group_id))).map((card) => [card.id, card]));
  return rows.map((row) => {
    const card = cards.get(row.group_id);
    return {
    id: row.id,
    groupId: row.group_id,
    group: card
      ? {
          name: card.name,
          description: card.description,
          avatarUrl: card.avatarUrl,
          memberCount: card.memberCount,
          rules: card.rules,
          rulesRequired: card.rulesRequired,
        }
      : null,
    user: null,
    inviter: row.inviter ? mapProfileRow(row.inviter) : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    };
  });
}

export interface MyJoinRequest {
  id: string;
  groupId: string;
  groupName: string;
  groupAvatarUrl: string | null;
  createdAt: string;
}

/** Benim bekleyen başvurularım (iptal edilebilir). */
export async function fetchMyJoinRequests(userId: string): Promise<MyJoinRequest[]> {
  const { data, error } = await supabase
    .from("chat_group_join_requests")
    .select("id, group_id, created_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw toGroupError(error);
  const rows = (data ?? []) as unknown as { id: string; group_id: string; created_at: string }[];
  const cards = new Map((await fetchCommunityCards(rows.map((row) => row.group_id))).map((card) => [card.id, card]));
  return rows
    .filter((row) => cards.has(row.group_id))
    .map((row) => ({
      id: row.id,
      groupId: row.group_id,
      groupName: cards.get(row.group_id)?.name ?? "",
      groupAvatarUrl: cards.get(row.group_id)?.avatarUrl ?? null,
      createdAt: row.created_at,
    }));
}

export interface GroupBan {
  userId: string;
  user: UserProfile | null;
  reason: string | null;
  createdAt: string;
}

export async function fetchGroupBans(groupId: string): Promise<GroupBan[]> {
  const { data, error } = await supabase
    .from("chat_group_bans")
    .select(`user_id, reason, created_at, profiles:user_id ( ${PROFILE_EMBED} )`)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw toGroupError(error);
  return ((data ?? []) as unknown as { user_id: string; reason: string | null; created_at: string; profiles: ProfileRow | null }[]).map((row) => ({
    userId: row.user_id,
    user: row.profiles ? mapProfileRow(row.profiles) : null,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

/** Tek grubun güncel TAM satırı (ayar/sayaç yenileme) — yalnız ÜYE okuyabilir; üye değilse null (kart için `fetchCommunityCard`). */
export async function fetchChatGroupRow(groupId: string): Promise<ChatGroupRow | null> {
  const { data, error } = await supabase.from("chat_groups").select(CHAT_GROUP_SELECT).eq("id", groupId).maybeSingle();
  if (error || !data) return null;
  return data as ChatGroupRow;
}

/** Gönderen kimlikleri → profil (grup mesajlarında ad/avatar göstermek için). Tek sorgu, ≤ 100 kimlik. */
export async function fetchProfilesByIds(ids: string[]): Promise<UserProfile[]> {
  const unique = [...new Set(ids)].slice(0, 100);
  if (unique.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(PROFILE_EMBED).in("id", unique);
  if (error) {
    console.error("fetchProfilesByIds", error);
    return [];
  }
  return (data ?? []).map((row) => mapProfileRow(row as ProfileRow));
}

/** Grubun TÜM üye kimlikleri (davet listesinde "zaten üye" göstermek için); 100'lük sayfalarla, en çok 1000 (grup üst sınırı). */
export async function fetchGroupMemberIds(groupId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; offset < 1000; offset += 100) {
    const rows = await callRpc<{ user_id: string }[]>("chat_group_members", { p_group_id: groupId, p_search: null, p_limit: 100, p_offset: offset });
    for (const row of rows ?? []) ids.add(row.user_id);
    if ((rows ?? []).length < 100) break;
  }
  return ids;
}
