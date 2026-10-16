import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import { REQUEST_SELECT, mapRequestRow, type RequestRow } from "./requests";
import { WORKFLOW_SELECT, mapWorkflowRow, type WorkflowRow } from "./workflows";
import { PRESET_SELECT, mapPresetRow, type PresetRow } from "./presets";
import { callRpc, fetchCommunityCards, PROFILE_EMBED, toGroupError, type CommunityCard } from "./chat-groups";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/chat-groups";
import { parseInviteResult, parseGroupJoinToken, type InviteResult } from "@/lib/chat-groups";
import {
  normalizeCategory,
  normalizeVisibility,
  normalizeNotifyLevel,
  parseCommunityStats,
  type CommunityStats,
  type RsvpStatus,
} from "@/lib/communities";
import type {
  ChatGroup,
  CommunityCategory,
  CommunityFeedPolicy,
  CommunityNotifyLevel,
  GroupRole,
  GroupVisibility,
  Preset,
  Prompt,
  PromptRequest,
  UserProfile,
  Workflow,
} from "@/types";

/**
 * Topluluk veri erişimi (docs/history/175-*). Yazma işlemleri SECURITY DEFINER RPC'lerdir (kimlik auth.uid()'den, yetki ve kurallar
 * veritabanında); burası yalnızca çağırır, sonucu tiplendirir ve sunucunun makine kodlarını çevrilmiş mesaja dönüştürür
 * (`toGroupError`: bilinmeyen hata → genel mesaj, ham SQL metni asla gösterilmez). Okumalar RLS'e tabidir.
 */

// ---------------------------------------------------------------------------------------------
// Oluşturma / ayar / kapatma
// ---------------------------------------------------------------------------------------------

export interface CreateCommunityInput {
  name: string;
  description: string;
  visibility: GroupVisibility;
  avatarUrl: string | null;
  memberLimit: number;
  inviteUserIds: string[];
  category: CommunityCategory;
  postingPolicy: "members" | "admins";
  feedPolicy: CommunityFeedPolicy;
  rules: string;
  rulesRequired: boolean;
}

export async function createCommunity(input: CreateCommunityInput): Promise<{ groupId: string; invite: InviteResult }> {
  const data = await callRpc<{ group_id: string; invited_count: number; skipped: unknown }>("create_community", {
    p_name: input.name.trim(),
    p_description: input.description.trim() || null,
    p_visibility: input.visibility,
    p_avatar_url: input.avatarUrl,
    p_member_limit: input.memberLimit,
    p_invite_user_ids: input.inviteUserIds,
    p_category: input.category,
    p_posting_policy: input.postingPolicy,
    p_feed_policy: input.feedPolicy,
    p_rules: input.rules.trim() || null,
    p_rules_required: input.rulesRequired,
  });
  return { groupId: data.group_id, invite: parseInviteResult(data) };
}

export interface UpdateCommunityPatch {
  category?: CommunityCategory;
  feedPolicy?: CommunityFeedPolicy;
  rules?: string | null;
  rulesRequired?: boolean;
}

export async function updateCommunity(groupId: string, patch: UpdateCommunityPatch): Promise<{ changed: boolean; rulesVersion: number | null }> {
  const body: Record<string, unknown> = {};
  if (patch.category !== undefined) body.category = patch.category;
  if (patch.feedPolicy !== undefined) body.feed_policy = patch.feedPolicy;
  if (patch.rules !== undefined) body.rules = patch.rules === null ? null : patch.rules.trim();
  if (patch.rulesRequired !== undefined) body.rules_required = patch.rulesRequired;
  const data = await callRpc<{ changed: boolean; rules_version?: number }>("update_community", { p_group_id: groupId, p_patch: body });
  return { changed: Boolean(data?.changed), rulesVersion: typeof data?.rules_version === "number" ? data.rules_version : null };
}

export async function closeCommunity(groupId: string): Promise<void> {
  await callRpc("close_community", { p_group_id: groupId });
}

export async function reopenCommunity(groupId: string): Promise<void> {
  await callRpc("reopen_community", { p_group_id: groupId });
}

export async function acceptCommunityRules(groupId: string): Promise<void> {
  await callRpc("accept_community_rules", { p_group_id: groupId });
}

// ---------------------------------------------------------------------------------------------
// Katılım (kural kabulüyle)
// ---------------------------------------------------------------------------------------------

export async function joinCommunity(groupId: string, acceptRules: boolean): Promise<"joined" | "already_member"> {
  const data = await callRpc<{ outcome: "joined" | "already_member" }>("join_community", { p_group_id: groupId, p_accept_rules: acceptRules });
  return data.outcome;
}

/**
 * Kapalı (`restricted`) topluluğa aramadan/öneriden katılma BAŞVURUSU. Sonuç: `requested` (yönetici onayı bekler) · `already_requested`
 * · `joined` (herkese açık çıktı ya da bekleyen davet vardı) · `already_member`. Tamamen kapalı topluluk "bulunamadı" der.
 */
export async function requestJoinCommunity(
  groupId: string,
  acceptRules: boolean,
  message?: string,
): Promise<"requested" | "already_requested" | "joined" | "already_member"> {
  const data = await callRpc<{ outcome: "requested" | "already_requested" | "joined" | "already_member" }>("request_join_community", {
    p_group_id: groupId,
    p_message: message?.trim() || null,
    p_accept_rules: acceptRules,
  });
  return data.outcome;
}

/** Bu topluluğa gönderdiğim bekleyen başvuruyu geri çeker (başvuru kimliği kullanıcıya yalnız kendi satırı olarak okunur). */
export async function cancelMyJoinRequest(groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("chat_group_join_requests")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  await callRpc("cancel_chat_group_join_request", { p_request_id: (data as { id: string }).id });
  return true;
}

export async function respondToCommunityInvitation(
  invitationId: string,
  accept: boolean,
  acceptRules: boolean,
): Promise<{ outcome: "accepted" | "declined" | "already_member" | "expired"; groupId: string | null }> {
  const data = await callRpc<{ outcome: "accepted" | "declined" | "already_member" | "expired"; group_id?: string }>("respond_community_invitation", {
    p_invitation_id: invitationId,
    p_accept: accept,
    p_accept_rules: acceptRules,
  });
  return { outcome: data.outcome, groupId: data.group_id ?? null };
}

export async function joinCommunityViaLink(
  token: string,
  message: string,
  acceptRules: boolean,
): Promise<{ outcome: "joined" | "already_member" | "requested" | "already_requested"; groupId: string | null }> {
  const data = await callRpc<{ outcome: "joined" | "already_member" | "requested" | "already_requested"; group_id?: string | null }>("join_community_via_link", {
    p_token: token,
    p_message: message.trim() || null,
    p_accept_rules: acceptRules,
  });
  return { outcome: data.outcome, groupId: data.group_id ?? null };
}

/** Tek kart; görülemeyen / tamamen kapalı / olmayan topluluk için null. */
export { type CommunityCard };
export async function fetchCommunityCard(id: string): Promise<CommunityCard | null> {
  return (await fetchCommunityCards([id]))[0] ?? null;
}

/** Kartı sayfanın kullandığı `ChatGroup` biçimine çevirir: yönetim alanları güvenli varsayılanlardır (üye olmayanın hiçbir yetkisi yoktur). */
export function cardToChatGroup(card: CommunityCard): ChatGroup {
  return {
    id: card.id,
    name: card.name,
    description: card.description,
    avatarUrl: card.avatarUrl,
    visibility: card.visibility,
    postingPolicy: "members",
    memberLimit: card.memberLimit,
    memberCount: card.memberCount,
    pendingRequestCount: 0,
    historyVisible: false,
    membersCanPin: false,
    rolePermissions: DEFAULT_ROLE_PERMISSIONS,
    createdAt: card.createdAt,
    myRole: "member",
    category: card.category,
    feedPolicy: "members",
    rules: card.rules,
    rulesVersion: card.rulesVersion,
    rulesRequired: card.rulesRequired,
    closedAt: card.closedAt,
    postCount: card.postCount ?? 0,
    origin: card.origin,
  };
}

export interface CommunityLinkPreview {
  valid: boolean;
  groupId: string | null;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  visibility: GroupVisibility;
  memberCount: number;
  memberLimit: number;
  myStatus: "member" | "requested" | "none";
  category: CommunityCategory;
  rules: string | null;
  rulesRequired: boolean;
  closed: boolean;
}

/** Bağlantı önizlemesi (kurallar katılmadan önce görülür). Geçersiz / süresi dolmuş / engelli → null. */
export async function previewCommunityLink(token: string): Promise<CommunityLinkPreview | null> {
  if (!parseGroupJoinToken(token)) return null;
  const data = await callRpc<Record<string, unknown> | null>("preview_community_link", { p_token: token });
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
    category: normalizeCategory(data.category),
    rules: typeof data.rules === "string" ? data.rules : null,
    rulesRequired: data.rules_required === true,
    closed: data.closed === true,
  };
}

// ---------------------------------------------------------------------------------------------
// Keşif ve listeler
// ---------------------------------------------------------------------------------------------

export type CommunitySort = "popular" | "newest" | "active";

export interface CommunitySummary {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  category: CommunityCategory;
  visibility: GroupVisibility;
  memberCount: number;
  memberLimit: number;
  postCount: number;
  upcomingEventCount: number;
  rulesRequired: boolean;
  closed: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  myStatus: "member" | "invited" | "requested" | "none";
  myRole: GroupRole | null;
  unreadCount: number;
  pendingRequestCount: number;
  /** Yalnız arama/öneri sonuçlarında: öneri nedeni (`category` ortak kategori · `popular` yaygın). */
  reason?: "category" | "popular";
}

export const COMMUNITY_PAGE_SIZE = 20;

interface DiscoverRow {
  id: string; name: string; description: string | null; avatar_url: string | null; category: string; member_count: number; member_limit: number;
  post_count: number; upcoming_event_count: number; rules_required: boolean; created_at: string; last_activity_at: string | null;
  my_status: CommunitySummary["myStatus"];
}

/** Yalnız herkese açık, kapatılmamış topluluklar (sunucu zorlar). `limit + 1` istenir: fazladan satır "daha var" demektir. */
export async function discoverCommunities(params: {
  query: string;
  sort: CommunitySort;
  category: CommunityCategory | null;
  offset: number;
}): Promise<{ communities: CommunitySummary[]; hasMore: boolean }> {
  const rows = await callRpc<DiscoverRow[]>("discover_communities", {
    p_query: params.query.trim() || null,
    p_sort: params.sort,
    p_category: params.category,
    p_limit: COMMUNITY_PAGE_SIZE + 1,
    p_offset: params.offset,
  });
  const list = rows ?? [];
  return {
    hasMore: list.length > COMMUNITY_PAGE_SIZE,
    communities: list.slice(0, COMMUNITY_PAGE_SIZE).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      avatarUrl: row.avatar_url,
      category: normalizeCategory(row.category),
      visibility: "public",
      memberCount: row.member_count,
      memberLimit: row.member_limit,
      postCount: row.post_count,
      upcomingEventCount: row.upcoming_event_count,
      rulesRequired: row.rules_required,
      closed: false,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      myStatus: row.my_status,
      myRole: null,
      unreadCount: 0,
      pendingRequestCount: 0,
    })),
  };
}

interface SearchRow extends Omit<DiscoverRow, "post_count" | "upcoming_event_count"> {
  visibility: GroupVisibility;
  /** Kapalı topluluğun içerik istatistiği üye olmayana verilmez (sunucu null döner). */
  post_count: number | null;
  upcoming_event_count: number | null;
  reason?: "category" | "popular";
}

function mapSearchRow(row: SearchRow): CommunitySummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    category: normalizeCategory(row.category),
    visibility: normalizeVisibility(row.visibility),
    memberCount: row.member_count,
    memberLimit: row.member_limit,
    postCount: row.post_count ?? 0,
    upcomingEventCount: row.upcoming_event_count ?? 0,
    rulesRequired: row.rules_required,
    closed: false,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    myStatus: row.my_status,
    myRole: null,
    unreadCount: 0,
    pendingRequestCount: 0,
    reason: row.reason,
  };
}

/**
 * Arama: herkese açık VE kapalı topluluklar (tamamen kapalı asla). Boş sorgu sonuç vermez (göz atmak için Keşfet var).
 * Kapalı topluluğun kartında içerik istatistiği yoktur; içeriği üyelik olmadan okunamaz.
 */
export async function searchCommunities(params: {
  query: string;
  category: CommunityCategory | null;
  offset: number;
}): Promise<{ communities: CommunitySummary[]; hasMore: boolean }> {
  const term = params.query.trim();
  if (!term) return { communities: [], hasMore: false };
  const rows = await callRpc<SearchRow[]>("search_communities", {
    p_query: term,
    p_category: params.category,
    p_limit: COMMUNITY_PAGE_SIZE + 1,
    p_offset: params.offset,
  });
  const list = rows ?? [];
  return { hasMore: list.length > COMMUNITY_PAGE_SIZE, communities: list.slice(0, COMMUNITY_PAGE_SIZE).map(mapSearchRow) };
}

/** Sana önerilen topluluklar (herkese açık + kapalı): ortak kategori önce, sonra yaygınlık. Üye olduklarım/bekleyen başvurularım yok. */
export async function suggestCommunities(limit = 6): Promise<CommunitySummary[]> {
  const rows = await callRpc<SearchRow[]>("suggest_communities", { p_limit: limit });
  return (rows ?? []).map(mapSearchRow);
}

export type MyCommunityScope = "member" | "managed";

interface MineRow {
  id: string; name: string; description: string | null; avatar_url: string | null; category: string; visibility: GroupVisibility; member_count: number;
  member_limit: number; post_count: number; upcoming_event_count: number; closed: boolean; created_at: string; last_activity_at: string | null;
  my_role: GroupRole | null; unread_count: number; pending_request_count: number;
}

export async function listMyCommunities(scope: MyCommunityScope, offset = 0): Promise<{ communities: CommunitySummary[]; hasMore: boolean }> {
  const rows = await callRpc<MineRow[]>("list_my_communities", { p_scope: scope, p_limit: COMMUNITY_PAGE_SIZE + 1, p_offset: offset });
  const list = rows ?? [];
  return {
    hasMore: list.length > COMMUNITY_PAGE_SIZE,
    communities: list.slice(0, COMMUNITY_PAGE_SIZE).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      avatarUrl: row.avatar_url,
      category: normalizeCategory(row.category),
      visibility: row.visibility,
      memberCount: row.member_count,
      memberLimit: row.member_limit,
      postCount: row.post_count,
      upcomingEventCount: row.upcoming_event_count,
      rulesRequired: false,
      closed: row.closed,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      myStatus: row.my_role ? "member" : "none",
      myRole: row.my_role,
      unreadCount: row.unread_count,
      pendingRequestCount: row.pending_request_count,
    })),
  };
}

export interface CommunityMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt: string;
}

export const COMMUNITY_MEMBER_PAGE_SIZE = 30;

export async function fetchCommunityMembers(
  groupId: string,
  params: { search: string; role: GroupRole | null; offset: number },
): Promise<{ members: CommunityMember[]; hasMore: boolean }> {
  const rows = await callRpc<{ user_id: string; username: string; display_name: string; avatar_url: string | null; role: GroupRole; joined_at: string }[]>(
    "community_members",
    { p_group_id: groupId, p_search: params.search.trim() || null, p_role: params.role, p_limit: COMMUNITY_MEMBER_PAGE_SIZE + 1, p_offset: params.offset },
  );
  const list = rows ?? [];
  return {
    hasMore: list.length > COMMUNITY_MEMBER_PAGE_SIZE,
    members: list.slice(0, COMMUNITY_MEMBER_PAGE_SIZE).map((row) => ({
      userId: row.user_id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, role: row.role, joinedAt: row.joined_at,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Kişisel üyelik durumu: bildirim tercihi ve kural kabulü
// ---------------------------------------------------------------------------------------------

export interface MyCommunityMembership {
  role: GroupRole;
  mutedAt: string | null;
  notifyLevel: CommunityNotifyLevel;
  notifyMutedUntil: string | null;
  acceptedRulesVersion: number | null;
}

/** Kendi üyelik satırım (+ kural kabulüm). Üye değilsem null. */
export async function fetchMyCommunityMembership(groupId: string, userId: string): Promise<MyCommunityMembership | null> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("role, muted_at, notify_level, notify_muted_until")
    .eq("conversation_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw toGroupError(error);
  if (!data) return null;
  const row = data as { role: GroupRole; muted_at: string | null; notify_level: string; notify_muted_until: string | null };
  const accepted = await supabase.from("community_rule_acceptances").select("rules_version").eq("community_id", groupId).eq("user_id", userId).maybeSingle();
  return {
    role: row.role,
    mutedAt: row.muted_at,
    notifyLevel: normalizeNotifyLevel(row.notify_level),
    notifyMutedUntil: row.notify_muted_until,
    acceptedRulesVersion: (accepted.data as { rules_version: number } | null)?.rules_version ?? null,
  };
}

/** Yalnız kendi üyelik satırım (RLS); "0 satır" başarı sayılmaz. */
export async function setCommunityNotifyPrefs(groupId: string, userId: string, level: CommunityNotifyLevel, mutedUntil: string | null): Promise<void> {
  const { data, error } = await supabase
    .from("conversation_members")
    .update({ notify_level: level, notify_muted_until: mutedUntil })
    .eq("conversation_id", groupId)
    .eq("user_id", userId)
    .select("conversation_id")
    .maybeSingle();
  if (error) throw toGroupError(error);
  if (!data) throw toGroupError(null);
}

// ---------------------------------------------------------------------------------------------
// Gönderiler (içerik akışı)
// ---------------------------------------------------------------------------------------------

export type CommunityPostType = "prompt" | "request" | "workflow" | "preset";

export type CommunityPostContent =
  | { type: "prompt"; data: Prompt }
  | { type: "request"; data: PromptRequest }
  | { type: "workflow"; data: Workflow }
  | { type: "preset"; data: Preset };

export interface CommunityPost {
  id: string;
  communityId: string;
  author: UserProfile | null;
  contentType: CommunityPostType;
  /** İçerik artık okunamıyorsa (silindi / özel yapıldı) null — gönderi kaydı yetkililere "kaldır" için yine listelenir. */
  content: CommunityPostContent | null;
  note: string | null;
  pinnedAt: string | null;
  createdAt: string;
}

interface PostRow {
  id: string;
  community_id: string;
  content_type: CommunityPostType;
  note: string | null;
  pinned_at: string | null;
  created_at: string;
  author: ProfileRow | null;
  prompts: PromptRow | null;
  prompt_requests: RequestRow | null;
  workflows: WorkflowRow | null;
  presets: PresetRow | null;
}

const POST_SELECT = `id, community_id, content_type, note, pinned_at, created_at, author:author_id ( ${PROFILE_EMBED} ),
  prompts ( ${PROMPT_SELECT} ), prompt_requests ( ${REQUEST_SELECT} ), workflows ( ${WORKFLOW_SELECT} ), presets ( ${PRESET_SELECT} )`;

function mapPostRow(row: PostRow): CommunityPost {
  let content: CommunityPostContent | null = null;
  if (row.content_type === "prompt" && row.prompts && !row.prompts.deleted_at) content = { type: "prompt", data: mapPromptRow(row.prompts) };
  else if (row.content_type === "request" && row.prompt_requests && !row.prompt_requests.deleted_at) content = { type: "request", data: mapRequestRow(row.prompt_requests) };
  else if (row.content_type === "workflow" && row.workflows) content = { type: "workflow", data: mapWorkflowRow(row.workflows) };
  else if (row.content_type === "preset" && row.presets) content = { type: "preset", data: mapPresetRow(row.presets) };
  return {
    id: row.id,
    communityId: row.community_id,
    author: row.author ? mapProfileRow(row.author) : null,
    contentType: row.content_type,
    content,
    note: row.note,
    pinnedAt: row.pinned_at,
    createdAt: row.created_at,
  };
}

export const POST_PAGE_SIZE = 12;

/** Akış sayfası: yeniden eskiye keyset (`created_at`, `id`). Sabit gönderiler ayrıca `fetchPinnedPosts` ile başa konur. */
export async function fetchCommunityPosts(
  communityId: string,
  cursor: { createdAt: string; id: string } | null,
): Promise<{ posts: CommunityPost[]; hasMore: boolean }> {
  let query = supabase
    .from("community_posts")
    .select(POST_SELECT)
    .eq("community_id", communityId)
    .is("pinned_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(POST_PAGE_SIZE + 1);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) throw toGroupError(error);
  const rows = (data ?? []) as unknown as PostRow[];
  return { hasMore: rows.length > POST_PAGE_SIZE, posts: rows.slice(0, POST_PAGE_SIZE).map(mapPostRow) };
}

export async function fetchPinnedPosts(communityId: string): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from("community_posts")
    .select(POST_SELECT)
    .eq("community_id", communityId)
    .not("pinned_at", "is", null)
    .order("pinned_at", { ascending: false })
    .limit(3);
  if (error) throw toGroupError(error);
  return ((data ?? []) as unknown as PostRow[]).map(mapPostRow);
}

export async function shareToCommunity(groupId: string, type: CommunityPostType, contentId: string, note: string): Promise<string> {
  return callRpc<string>("share_to_community", { p_group_id: groupId, p_content_type: type, p_content_id: contentId, p_note: note.trim() || null });
}

export async function updateCommunityPostNote(postId: string, note: string): Promise<void> {
  await callRpc("update_community_post", { p_post_id: postId, p_note: note.trim() || null });
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  await callRpc("delete_community_post", { p_post_id: postId });
}

export async function moderateCommunityPost(postId: string, reason: string): Promise<void> {
  await callRpc("moderate_community_post", { p_post_id: postId, p_reason: reason.trim() || null });
}

export async function setCommunityPostPinned(postId: string, pinned: boolean): Promise<void> {
  await callRpc("set_community_post_pinned", { p_post_id: postId, p_pinned: pinned });
}

/** Paylaşım penceresi için: kullanıcının KENDİ herkese açık, yayında içerikleri (tür başına en yeni 30). */
export interface ShareableContent {
  id: string;
  type: CommunityPostType;
  title: string;
}

export async function fetchOwnShareableContent(userId: string, type: CommunityPostType): Promise<ShareableContent[]> {
  const table = type === "prompt" ? "prompts" : type === "request" ? "prompt_requests" : type === "workflow" ? "workflows" : "presets";
  const ownerColumn = type === "workflow" || type === "preset" ? "creator_id" : "author_id";
  let query = supabase.from(table).select("id, title").eq(ownerColumn, userId).eq("visibility", "public");
  if (type === "prompt") query = query.eq("status", "published").is("deleted_at", null);
  else if (type === "request") query = query.eq("is_draft", false).is("deleted_at", null);
  else query = query.eq("status", "published");
  const { data, error } = await query.order("created_at", { ascending: false }).limit(30);
  if (error) throw toGroupError(error);
  return ((data ?? []) as { id: string; title: string }[]).map((row) => ({ id: row.id, type, title: row.title }));
}

// ---------------------------------------------------------------------------------------------
// Duyurular
// ---------------------------------------------------------------------------------------------

export interface CommunityAnnouncement {
  id: string;
  communityId: string;
  author: UserProfile | null;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
}

export async function fetchAnnouncements(communityId: string, limit = 20): Promise<CommunityAnnouncement[]> {
  const { data, error } = await supabase
    .from("community_announcements")
    .select(`id, community_id, title, body, pinned, created_at, edited_at, author:author_id ( ${PROFILE_EMBED} )`)
    .eq("community_id", communityId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw toGroupError(error);
  type Row = { id: string; community_id: string; title: string; body: string; pinned: boolean; created_at: string; edited_at: string | null; author: ProfileRow | null };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id, communityId: row.community_id, author: row.author ? mapProfileRow(row.author) : null,
    title: row.title, body: row.body, pinned: row.pinned, createdAt: row.created_at, editedAt: row.edited_at,
  }));
}

export async function publishAnnouncement(groupId: string, input: { title: string; body: string; pinned: boolean; notify: boolean; postToChat: boolean }): Promise<string> {
  return callRpc<string>("publish_community_announcement", {
    p_group_id: groupId, p_title: input.title.trim(), p_body: input.body.trim(), p_pinned: input.pinned, p_notify: input.notify, p_post_to_chat: input.postToChat,
  });
}

export async function updateAnnouncement(announcementId: string, input: { title: string; body: string; pinned: boolean }): Promise<void> {
  await callRpc("update_community_announcement", { p_announcement_id: announcementId, p_title: input.title.trim(), p_body: input.body.trim(), p_pinned: input.pinned });
}

export async function deleteAnnouncement(announcementId: string): Promise<void> {
  await callRpc("delete_community_announcement", { p_announcement_id: announcementId });
}

// ---------------------------------------------------------------------------------------------
// Etkinlikler
// ---------------------------------------------------------------------------------------------

export interface CommunityEvent {
  id: string;
  communityId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  location: string | null;
  onlineUrl: string | null;
  status: "scheduled" | "cancelled";
  goingCount: number;
  maybeCount: number;
  /** Benim cevabım (yalnız üye için; üye değilse null). */
  myRsvp: RsvpStatus | null;
}

interface EventRow {
  id: string; community_id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; timezone: string;
  location: string | null; online_url: string | null; status: "scheduled" | "cancelled"; going_count: number; maybe_count: number;
}

const EVENT_SELECT = "id, community_id, title, description, starts_at, ends_at, timezone, location, online_url, status, going_count, maybe_count";

function mapEventRow(row: EventRow, myRsvp: RsvpStatus | null): CommunityEvent {
  return {
    id: row.id, communityId: row.community_id, title: row.title, description: row.description, startsAt: row.starts_at, endsAt: row.ends_at,
    timezone: row.timezone, location: row.location, onlineUrl: row.online_url, status: row.status, goingCount: row.going_count, maybeCount: row.maybe_count, myRsvp,
  };
}

/** Etkinlikler (yaklaşan önce): `scope` upcoming = bitmemiş, past = bitmiş. Benim cevaplarım tek ek sorguyla eklenir. */
export async function fetchCommunityEvents(communityId: string, userId: string | null, scope: "upcoming" | "past"): Promise<CommunityEvent[]> {
  const cutoff = new Date(Date.now() - 3 * 3_600_000).toISOString();
  let query = supabase.from("community_events").select(EVENT_SELECT).eq("community_id", communityId);
  query = scope === "upcoming" ? query.gte("starts_at", cutoff).order("starts_at", { ascending: true }) : query.lt("starts_at", cutoff).order("starts_at", { ascending: false });
  const { data, error } = await query.limit(50);
  if (error) throw toGroupError(error);
  const rows = (data ?? []) as EventRow[];
  const mine = new Map<string, RsvpStatus>();
  if (userId && rows.length > 0) {
    const rsvps = await supabase.from("community_event_rsvps").select("event_id, status").eq("user_id", userId).in("event_id", rows.map((row) => row.id));
    for (const row of (rsvps.data ?? []) as { event_id: string; status: RsvpStatus }[]) mine.set(row.event_id, row.status);
  }
  return rows.map((row) => mapEventRow(row, mine.get(row.id) ?? null));
}

export interface EventInput {
  title: string;
  description: string;
  startsAtIso: string;
  endsAtIso: string | null;
  timezone: string;
  location: string;
  onlineUrl: string;
}

export async function createCommunityEvent(groupId: string, input: EventInput, notify: boolean): Promise<string> {
  return callRpc<string>("create_community_event", {
    p_group_id: groupId, p_title: input.title.trim(), p_description: input.description.trim() || null, p_starts_at: input.startsAtIso,
    p_ends_at: input.endsAtIso, p_timezone: input.timezone, p_location: input.location.trim() || null, p_online_url: input.onlineUrl.trim() || null, p_notify: notify,
  });
}

export async function updateCommunityEvent(eventId: string, input: EventInput): Promise<void> {
  await callRpc("update_community_event", {
    p_event_id: eventId,
    p_patch: {
      title: input.title.trim(), description: input.description.trim() || null, starts_at: input.startsAtIso, ends_at: input.endsAtIso,
      timezone: input.timezone, location: input.location.trim() || null, online_url: input.onlineUrl.trim() || null,
    },
  });
}

export async function cancelCommunityEvent(eventId: string): Promise<void> {
  await callRpc("cancel_community_event", { p_event_id: eventId });
}

export async function deleteCommunityEvent(eventId: string): Promise<void> {
  await callRpc("delete_community_event", { p_event_id: eventId });
}

export async function setEventRsvp(eventId: string, status: RsvpStatus | "none"): Promise<void> {
  await callRpc("set_community_event_rsvp", { p_event_id: eventId, p_status: status });
}

/** Yaklaşan (24 saat içinde) etkinlik hatırlatmaları: uygulama açılışında bir kez; sunucu yinelemeyi önler. */
export async function dispatchMyEventReminders(): Promise<number> {
  const count = await callRpc<number>("dispatch_my_event_reminders", {});
  return typeof count === "number" ? count : 0;
}

// ---------------------------------------------------------------------------------------------
// Raporlar ve moderasyon kuyruğu
// ---------------------------------------------------------------------------------------------

export async function reportCommunityContent(groupId: string, kind: "post" | "message", targetId: string, reason: string): Promise<void> {
  await callRpc("report_community_content", { p_group_id: groupId, p_kind: kind, p_target_id: targetId, p_reason: reason.trim() });
}

export interface CommunityReport {
  id: string;
  kind: "post" | "message";
  reporter: UserProfile | null;
  targetUserId: string | null;
  postId: string | null;
  messageId: string | null;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** Mesaj raporunda içeriğin kısa özeti (yönetici zaten okuyabilir; silinmişse null). */
  messagePreview: string | null;
  postTitle: string | null;
}

export async function fetchCommunityReports(communityId: string, status: "open" | "closed"): Promise<CommunityReport[]> {
  let query = supabase
    .from("community_reports")
    .select(
      `id, target_kind, post_id, message_id, target_user_id, reason, status, resolution, created_at, resolved_at, reporter:reporter_id ( ${PROFILE_EMBED} ),
       messages ( body, deleted_at ), community_posts ( content_type, prompts ( title ), prompt_requests ( title ), workflows ( title ), presets ( title ) )`,
    )
    .eq("community_id", communityId);
  query = status === "open" ? query.eq("status", "open").order("created_at", { ascending: true }) : query.neq("status", "open").order("resolved_at", { ascending: false });
  const { data, error } = await query.limit(50);
  if (error) throw toGroupError(error);
  type Row = {
    id: string; target_kind: "post" | "message"; post_id: string | null; message_id: string | null; target_user_id: string | null; reason: string;
    status: "open" | "resolved" | "dismissed"; resolution: string | null; created_at: string; resolved_at: string | null; reporter: ProfileRow | null;
    messages: { body: string | null; deleted_at: string | null } | null;
    community_posts: { prompts: { title: string } | null; prompt_requests: { title: string } | null; workflows: { title: string } | null; presets: { title: string } | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const post = row.community_posts;
    return {
      id: row.id, kind: row.target_kind, reporter: row.reporter ? mapProfileRow(row.reporter) : null, targetUserId: row.target_user_id,
      postId: row.post_id, messageId: row.message_id, reason: row.reason, status: row.status, resolution: row.resolution, createdAt: row.created_at, resolvedAt: row.resolved_at,
      messagePreview: row.messages && !row.messages.deleted_at ? row.messages.body : null,
      postTitle: post ? (post.prompts?.title ?? post.prompt_requests?.title ?? post.workflows?.title ?? post.presets?.title ?? null) : null,
    };
  });
}

export async function resolveCommunityReport(reportId: string, action: "dismiss" | "remove", note: string): Promise<void> {
  await callRpc("resolve_community_report", { p_report_id: reportId, p_action: action, p_note: note.trim() || null });
}

// ---------------------------------------------------------------------------------------------
// Yönetim işlem geçmişi ve istatistik
// ---------------------------------------------------------------------------------------------

export interface CommunityAuditEntry {
  id: string;
  action: string;
  actor: UserProfile | null;
  targetUserId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export const AUDIT_PAGE_SIZE = 25;

/** Denetim kaydı (owner/admin; RLS zaten yalnız onlara verir). Yeniden eskiye, `before` imleciyle sayfalanır. */
export async function fetchCommunityAudit(communityId: string, before: string | null): Promise<{ entries: CommunityAuditEntry[]; hasMore: boolean }> {
  let query = supabase
    .from("chat_group_audit")
    .select(`id, action, target_user_id, details, created_at, actor:actor_id ( ${PROFILE_EMBED} )`)
    .eq("group_id", communityId)
    .order("created_at", { ascending: false })
    .limit(AUDIT_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw toGroupError(error);
  type Row = { id: string; action: string; target_user_id: string | null; details: Record<string, unknown> | null; created_at: string; actor: ProfileRow | null };
  const rows = (data ?? []) as unknown as Row[];
  return {
    hasMore: rows.length > AUDIT_PAGE_SIZE,
    entries: rows.slice(0, AUDIT_PAGE_SIZE).map((row) => ({
      id: row.id, action: row.action, actor: row.actor ? mapProfileRow(row.actor) : null, targetUserId: row.target_user_id, details: row.details ?? {}, createdAt: row.created_at,
    })),
  };
}

export async function fetchCommunityStats(groupId: string, days: number): Promise<CommunityStats> {
  const raw = await callRpc<unknown>("community_stats", { p_group_id: groupId, p_days: days });
  const stats = parseCommunityStats(raw);
  if (!stats) throw toGroupError(null);
  return stats;
}

/** Site moderatörü için eski grup → topluluk geçiş raporu (salt okunur). */
export async function fetchMigrationReport(): Promise<unknown> {
  return callRpc<unknown>("community_migration_report", {});
}
