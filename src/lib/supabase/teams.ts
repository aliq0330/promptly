import { supabase } from "./client";
import { translateForRuntime, type TranslationKey } from "@/lib/i18n/translations";
import type { TeamRole } from "@/lib/teams";

/**
 * Ekipler veri katmanı (docs/history/353-*). Her çağrı tek bir SECURITY DEFINER/INVOKER RPC'dir; yetki kararı SUNUCUDADIR
 * (`_team_can`), burası yalnız çağırır, satırları camelCase'e çevirir ve veritabanının kısa hata kodlarını okunur cümleye dönüştürür.
 */
export class TeamActionError extends Error {
  readonly code: string | null;
  constructor(code: string | null, message: string) {
    super(message);
    this.name = "TeamActionError";
    this.code = code;
  }
}

const KNOWN_CODES = new Set([
  "not_authenticated", "forbidden", "team_forbidden", "team_not_found", "team_invalid", "team_name_invalid", "team_owner_limit", "team_owner_required",
  "team_member_limit", "team_guest_limit", "team_group_limit", "team_channel_limit", "team_space_limit", "team_invitation_limit", "team_confirm_mismatch",
  "space_not_found", "space_forbidden", "space_invalid", "space_team_managed", "space_item_locked", "team_library_locked", "space_title_required",
  "channel_not_found", "channel_invalid", "channel_default_locked", "channel_name_taken", "group_not_found", "group_invalid", "group_name_taken",
  "member_not_found", "user_not_found", "already_member", "invitation_not_found", "invitation_expired", "link_not_found", "link_unavailable",
  "link_limit_reached", "invite_blocked", "owner_must_transfer", "item_not_approved", "item_deprecated", "pin_limit_reached", "message_not_found",
  "self_vote_not_allowed", "copy_required", "space_approval_forbidden", "space_variable_limit", "space_item_limit", "rate_limit",
]);

function errorCodeOf(message: string | undefined): string | null {
  const first = (message ?? "").trim().split(/[\s:(]/)[0] ?? "";
  return KNOWN_CODES.has(first) ? first : null;
}

export function toTeamError(error: { message?: string } | null | undefined): TeamActionError {
  const code = errorCodeOf(error?.message);
  const key = (code ? `tm.error.${code}` : "tm.error.generic") as TranslationKey;
  return new TeamActionError(code, translateForRuntime(key));
}

const camelKey = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** snake_case → camelCase (iç içe). Kimlik/zaman dizgeleri olduğu gibi kalır; yalnız nesne anahtarları değişir. */
export function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((item) => camelize(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[camelKey(key)] = camelize(item);
    return out as T;
  }
  return value as T;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toTeamError(error);
  return camelize<T>(data);
}

const rows = async <T>(fn: string, args?: Record<string, unknown>): Promise<T[]> => (await rpc<T[] | null>(fn, args)) ?? [];

// ---------------------------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------------------------

export type TeamTone = string;

export interface TeamSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tone: TeamTone;
  myRole: TeamRole;
  memberCount: number;
  guestCount: number;
  spaceCount: number;
  channelCount: number;
  unreadCount: number;
  lastActivityAt: string;
  librarySpaceId: string | null;
  guestUntil: string | null;
  /** Yalnız `listMyTeams` doldurur (Ekipler kartı): ilk üç üye ve herkese açık son etkinlik. */
  membersPreview?: { userId: string; username: string; displayName: string; avatarUrl: string | null }[];
  recent?: { action: string; label: string | null; actorName: string | null; at: string } | null;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  teamTone: string;
  role: TeamRole;
  guestDays: number | null;
  guestOrg: string | null;
  invitedBy: string;
  inviterUsername: string;
  inviterName: string;
  inviterAvatarUrl: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface TeamTodo {
  teamId: string;
  teamName: string;
  teamSlug: string;
  kind: string;
  n: number;
  label: string;
  href: string;
  at: string;
}

export interface TeamMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: TeamRole;
  joinedAt: string;
  guestOrg: string | null;
  guestUntil: string | null;
  groupIds: string[] | null;
  groupNames: string[] | null;
}

export interface TeamSpaceRow {
  id: string;
  ownerId: string;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  title: string;
  description: string | null;
  kind: string;
  visibility: string;
  coverUrl: string | null;
  coverItemUrl: string | null;
  previewUrls: string[] | null;
  imageCount: number;
  promptCount: number;
  noteCount: number;
  memberCount: number;
  myRole: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  accessMode: string;
  guestCount: number;
  isLibrary: boolean;
}

export interface TeamGroup {
  id: string;
  name: string;
  tone: string;
  leadId: string | null;
  leadName: string | null;
  leadsApprove: boolean;
  memberCount: number;
  memberIds: string[] | null;
  spaces: { id: string; title: string }[] | null;
  folders: { id: string; name: string; spaceId: string }[] | null;
}

export interface TeamGuest {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  guestOrg: string | null;
  guestUntil: string | null;
  joinedAt: string;
  expired: boolean;
  spaces: { id: string; title: string }[] | null;
  channels: { id: string; name: string }[] | null;
}

export interface TeamChannel {
  id: string;
  name: string;
  description: string | null;
  mode: "open" | "private" | "space";
  spaceId: string | null;
  spaceTitle: string | null;
  postingPolicy: "members" | "admins";
  notifyDefault: "all" | "mentions" | "none";
  isDefault: boolean;
  position: number;
  archivedAt: string | null;
  unreadCount: number;
  muted: boolean;
  notifyLevel: "all" | "mentions" | "none";
  lastMessageAt: string | null;
  memberCount: number;
  canPost: boolean;
}

export interface TeamLibraryItem {
  id: string;
  title: string;
  groupId: string | null;
  groupName: string | null;
  state: "draft" | "pending" | "approved" | "deprecated";
  contentRev: number;
  useCount: number;
  worksYes: number;
  worksNo: number;
  approvals: number;
  approvalsNeeded: number;
  updatedAt: string;
  updatedBy: string | null;
  updatedByName: string | null;
  createdBy: string | null;
  reviewRequestedAt: string | null;
  approvedAt: string | null;
  deprecatedAt: string | null;
  locked: boolean;
}

export interface TeamLibraryCounts {
  total: number;
  approved: number;
  pending: number;
  draft: number;
  deprecated: number;
  oldestPendingAt: string | null;
}

export interface TeamPolicy {
  requireApproval: boolean;
  approvalsNeeded: number;
  hideUnapproved: boolean;
  contentOwner: "team" | "author";
  offboardDefault: "ask" | "team" | "admin";
  versionKeep: number;
  defaultMemberRole: "member" | "editor";
  inviteLinkTtlDays: number;
  publishExternalRole: "owner" | "admin" | "editor";
  guestInviteRole: "owner" | "admin" | "editor";
  exportRole: "owner" | "admin";
  mcpEnabled: boolean;
  mcpAudience: "members" | "editors" | "admins";
}

export interface TeamAuditEntry {
  id: string;
  createdAt: string;
  category: string;
  action: string;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  actorId: string | null;
  actorUsername: string | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
}

export interface TeamInviteLink {
  id: string;
  role: TeamRole;
  createdBy: string;
  createdByName: string;
  expiresAt: string;
  revokedAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
}

export interface TeamPendingInvite {
  id: string;
  inviteeId: string;
  inviteeUsername: string;
  inviteeName: string;
  inviteeAvatarUrl: string | null;
  role: TeamRole;
  guestDays: number | null;
  guestOrg: string | null;
  invitedByName: string;
  createdAt: string;
}

export interface AccessEntry {
  type: "member" | "group";
  id: string;
  level: "edit" | "view";
  /** Yalnız okuma: sunucu ad/alt metin/konuk bitişini ekler (yazarken gönderilmez). */
  name?: string;
  username?: string | null;
  sub?: string | null;
  guestUntil?: string | null;
}

export interface ReviewComment {
  id: string;
  userId: string | null;
  name: string | null;
  username: string | null;
  kind: string;
  body: string;
  rev: number;
  at: string;
}

export interface ItemReview {
  item: { id: string; title: string; body: string; rev: number; state: string; reviewRequestedAt: string | null; requestedBy: string | null; requestedByName?: string | null; createdBy: string | null; updatedAt: string };
  /** Gönderenin eklediği örnek çıktı (satır başına bir örnek); yoksa null. */
  sample?: { body: string; author: string | null; at: string } | null;
  needed: number;
  /** Onay verebilecek kişilerin adları (en çok 6). */
  approvers?: string[];
  canDecide: boolean;
  base: { title: string; body: string; wasApproved: boolean; at: string; author: string | null } | null;
  approvals: { userId: string; name: string; decision: string; note: string | null; checklist: { key: string; done: boolean }[] | null; at: string }[];
  comments: ReviewComment[];
}

export interface TeamInsightsData {
  days: number;
  copies: number;
  copiesPrev: number;
  approvalHours: number | null;
  approvalHoursPrev: number | null;
  contributors: number;
  contributorsPrev: number;
  members: number;
  stale: number;
  daily: { day: string; n: number }[];
  alerts: { pending: number; oldestPendingDays: number | null; stale: number; deprecatedUsed: number };
  top: { id: string; title: string; copies: number; worksYes: number; worksNo: number; rev: number; updatedAt: string; stale: boolean }[];
}

export interface TeamAccessOverviewRow {
  spaceId: string;
  title: string;
  kind: string;
  isLibrary: boolean;
  mode: string;
  memberCount: number;
  guestCount: number;
  entryCount: number;
  creatorName: string | null;
  updatedAt: string;
  archivedAt: string | null;
}

// ---------------------------------------------------------------------------------------------
// Ekip
// ---------------------------------------------------------------------------------------------

export const PAGE = 30;

export async function listMyTeams(offset = 0): Promise<{ items: TeamSummary[]; total: null; nextOffset: number | null }> {
  const data = await rows<TeamSummary>("my_teams", { p_limit: PAGE + 1, p_offset: offset });
  const items = data.slice(0, PAGE);
  // Kart önizlemesi (avatar yığını + son etkinlik) ayrı, ekleyici bir RPC'dir; okunamazsa kart onsuz çizilir.
  const preview = items.length
    ? await rows<{ teamId: string; membersPreview: TeamSummary["membersPreview"]; recent: TeamSummary["recent"] }>("my_teams_preview", { p_ids: items.map((team) => team.id) }).catch(() => [])
    : [];
  const byTeam = new Map((Array.isArray(preview) ? preview : []).map((row) => [row.teamId, row]));
  return {
    items: items.map((team) => ({ ...team, membersPreview: byTeam.get(team.id)?.membersPreview ?? [], recent: byTeam.get(team.id)?.recent ?? null })),
    total: null,
    nextOffset: data.length > PAGE ? offset + PAGE : null,
  };
}

export const createTeam = (name: string, description: string, tone: string) => rpc<string>("team_create", { p_name: name, p_description: description, p_tone: tone });

export const updateTeam = (team: string, patch: Record<string, unknown>) => rpc<void>("team_update", { p_team: team, p_patch: patch });

/** Bir ekibin kimliği ya da kısa adıyla özeti (listeden bulunur; üye olmayan için varlığı sızmaz → null). */
export async function fetchMyTeam(idOrSlug: string): Promise<TeamSummary | null> {
  for (let offset = 0; offset < 600; offset += PAGE) {
    const page = await listMyTeams(offset);
    const found = page.items.find((team) => team.id === idOrSlug || team.slug === idOrSlug);
    if (found) return found;
    if (page.nextOffset === null) return null;
  }
  return null;
}

export const fetchTeamPolicy = async (team: string): Promise<TeamPolicy> => {
  const { data, error } = await supabase
    .from("teams")
    .select(
      "require_approval, approvals_needed, hide_unapproved, content_owner, offboard_default, version_keep, default_member_role, invite_link_ttl_days, publish_external_role, guest_invite_role, export_role, mcp_enabled, mcp_audience",
    )
    .eq("id", team)
    .maybeSingle();
  if (error) throw toTeamError(error);
  if (!data) throw new TeamActionError("team_not_found", translateForRuntime("tm.error.team_not_found"));
  return camelize<TeamPolicy>(data);
};

export const myTeamCan = async (team: string, cap: string): Promise<boolean> => Boolean(await rpc<boolean>("team_my_can", { p_team: team, p_cap: cap }));

export const deleteTeam = (team: string, confirm: string, deleteSpaces: boolean) => rpc<void>("team_delete", { p_team: team, p_confirm: confirm, p_delete_spaces: deleteSpaces });

export const leaveTeam = (team: string) => rpc<void>("team_leave", { p_team: team });

export const transferOwnership = (team: string, user: string) => rpc<void>("team_transfer_ownership", { p_team: team, p_new_owner: user });

// ---------------------------------------------------------------------------------------------
// Space'ler ve erişim
// ---------------------------------------------------------------------------------------------

export async function listTeamSpaces(team: string, offset = 0): Promise<{ items: TeamSpaceRow[]; total: null; nextOffset: number | null }> {
  const data = await rows<TeamSpaceRow>("team_list_spaces", { p_team: team, p_limit: PAGE + 1, p_offset: offset });
  return { items: data.slice(0, PAGE), total: null, nextOffset: data.length > PAGE ? offset + PAGE : null };
}

export const createTeamSpace = (team: string, title: string, description: string, kind: string, groups: string[], mode: string) =>
  rpc<string>("team_create_space", { p_team: team, p_title: title, p_description: description, p_kind: kind, p_groups: groups, p_mode: mode });

export const fetchSpaceAccess = (space: string) => rpc<{ mode: string; isLibrary: boolean; entries: AccessEntry[] }>("team_space_access", { p_space: space });

const entriesOut = (entries: AccessEntry[]) => entries.map((e) => ({ type: e.type, id: e.id, level: e.level }));

export const setSpaceAccess = (space: string, mode: "all" | "selected" | "admins", entries: AccessEntry[]) => rpc<void>("team_set_space_access", { p_space: space, p_mode: mode, p_entries: entriesOut(entries) });

export const fetchAccessOverview = (team: string) => rows<TeamAccessOverviewRow>("team_access_overview", { p_team: team });

// ---------------------------------------------------------------------------------------------
// Üyeler, davetler, gruplar, konuklar
// ---------------------------------------------------------------------------------------------

export async function listTeamMembers(team: string, search: string, role: string | null, offset = 0): Promise<{ items: TeamMember[]; total: null; nextOffset: number | null }> {
  const data = await rows<TeamMember>("team_list_members", { p_team: team, p_search: search || null, p_role: role, p_limit: PAGE + 1, p_offset: offset });
  return { items: data.slice(0, PAGE), total: null, nextOffset: data.length > PAGE ? offset + PAGE : null };
}

export const setMemberRole = (team: string, user: string, role: TeamRole) => rpc<void>("team_set_member_role", { p_team: team, p_user: user, p_role: role });

export const memberContentSummary = (team: string, user: string) => rpc<Record<string, number>>("team_member_content_summary", { p_team: team, p_user: user });

export const removeMember = (team: string, user: string, mode: "team" | "member" | "personal", newOwner: string | null, notify: boolean) =>
  rpc<Record<string, unknown>>("team_remove_member", { p_team: team, p_user: user, p_mode: mode, p_new_owner: newOwner, p_notify: notify });

export const inviteUser = (team: string, username: string, role: TeamRole, guestDays: number | null, guestOrg: string | null) =>
  rpc<string>("team_invite_user", { p_team: team, p_username: username.replace(/^@/, "").trim(), p_role: role, p_guest_days: guestDays, p_guest_org: guestOrg });

export const listMyInvitations = () => rows<TeamInvitation>("my_team_invitations");

export const respondInvitation = (invitation: string, accept: boolean) => rpc<{ status: "accepted" | "declined"; teamId?: string; slug?: string }>("team_respond_invitation", { p_invitation: invitation, p_accept: accept });

export const listPendingInvites = (team: string) => rows<TeamPendingInvite>("team_list_invitations", { p_team: team });

export const cancelInvitation = (invitation: string) => rpc<void>("team_cancel_invitation", { p_invitation: invitation });

export const listInviteLinks = (team: string) => rows<TeamInviteLink>("team_list_invite_links", { p_team: team });

/** Ham bağlantı jetonu yalnız oluştururken bir kez döner (sunucuda SHA-256 özeti durur). */
export const createInviteLink = (team: string, role: TeamRole, maxUses: number | null, ttlDays: number | null) =>
  rpc<{ token: string; linkId: string; expiresAt: string; maxUses: number | null; role: TeamRole }>("team_create_invite_link", { p_team: team, p_role: role, p_max_uses: maxUses, p_ttl_days: ttlDays });

export const revokeInviteLink = (link: string) => rpc<void>("team_revoke_invite_link", { p_link: link });

export interface TeamLinkPreview {
  teamName: string;
  tone: string;
  role: TeamRole;
  memberCount: number;
  alreadyMember: boolean;
  valid: boolean;
  expiresAt: string;
}

export const previewTeamLink = (token: string) => rpc<TeamLinkPreview>("preview_team_link", { p_token: token });

export const joinTeamViaLink = (token: string) => rpc<{ teamId: string; slug: string }>("join_team_via_link", { p_token: token });

export const listTeamGroups = (team: string) => rows<TeamGroup>("team_list_groups", { p_team: team });

export const createTeamGroup = (team: string, name: string, tone: string, lead: string | null) => rpc<string>("team_create_group", { p_team: team, p_name: name, p_tone: tone, p_lead: lead });

export const updateTeamGroup = (group: string, patch: Record<string, unknown>) => rpc<void>("team_update_group", { p_group: group, p_patch: patch });

export const deleteTeamGroup = (group: string) => rpc<void>("team_delete_group", { p_group: group });

export const setGroupMembers = (group: string, users: string[]) => rpc<void>("team_set_group_members", { p_group: group, p_users: users });

export const linkSpaceGroup = (spaceGroup: string, teamGroup: string | null) => rpc<void>("team_link_space_group", { p_space_group: spaceGroup, p_team_group: teamGroup });

export const listTeamGuests = (team: string) => rows<TeamGuest>("team_list_guests", { p_team: team });

export const extendGuest = (team: string, user: string, days: number) => rpc<string>("team_extend_guest", { p_team: team, p_user: user, p_days: days });

export const pruneExpiredGuests = (team: string) => rpc<number>("team_prune_expired_guests", { p_team: team });

// ---------------------------------------------------------------------------------------------
// Kanallar
// ---------------------------------------------------------------------------------------------

export const listTeamChannels = (team: string) => rows<TeamChannel>("team_list_channels", { p_team: team });

export const createTeamChannel = (team: string, input: { name: string; description: string; mode: string; space: string | null; posting: string; notify: string; entries: AccessEntry[] }) =>
  rpc<string>("team_create_channel", { p_team: team, p_name: input.name, p_description: input.description, p_mode: input.mode, p_space: input.space, p_posting: input.posting, p_notify: input.notify, p_entries: entriesOut(input.entries) });

export const updateTeamChannel = (channel: string, patch: Record<string, unknown>) => rpc<void>("team_update_channel", { p_channel: channel, p_patch: patch });

export const archiveTeamChannel = (channel: string, archived: boolean) => rpc<void>("team_archive_channel", { p_channel: channel, p_archived: archived });

export const deleteTeamChannel = (channel: string) => rpc<void>("team_delete_channel", { p_channel: channel });

export const setChannelNotify = (channel: string, level: "all" | "mentions" | "none" | null) => rpc<void>("team_set_channel_notify", { p_channel: channel, p_level: level });

export const fetchChannelAccess = (channel: string) => rpc<{ mode: string; entries: AccessEntry[] }>("team_channel_access", { p_channel: channel });

export const setChannelAccess = (channel: string, entries: AccessEntry[]) => rpc<void>("team_set_channel_access", { p_channel: channel, p_entries: entriesOut(entries) });

export const moderateTeamMessage = (message: string) => rpc<void>("team_moderate_message", { p_message: message });

// ---------------------------------------------------------------------------------------------
// Kütüphane yönetişimi
// ---------------------------------------------------------------------------------------------

export async function listLibraryItems(team: string, status: string | null, search: string, offset = 0): Promise<{ items: TeamLibraryItem[]; total: null; nextOffset: number | null }> {
  const data = await rows<TeamLibraryItem>("team_library_items", { p_team: team, p_status: status, p_search: search || null, p_limit: PAGE + 1, p_offset: offset });
  return { items: data.slice(0, PAGE), total: null, nextOffset: data.length > PAGE ? offset + PAGE : null };
}

export const fetchLibraryCounts = (team: string) => rpc<TeamLibraryCounts>("team_library_counts", { p_team: team });

export const setReviewSample = (item: string, sample: string) => rpc<void>("space_set_review_sample", { p_item: item, p_sample: sample });

/** Ekip kütüphanesindeki bir prompt taslağının metni (Space'i okuyan herkes; gizlenmiş/onaysız öğe RLS ile gelmez). */
export async function fetchLibraryItemBody(item: string): Promise<{ id: string; title: string; body: string; rev: number } | null> {
  const { data, error } = await supabase.from("space_items").select("id, title, body, content_rev").eq("id", item).maybeSingle();
  if (error) throw toTeamError(error);
  return data ? { id: data.id as string, title: String(data.title ?? ""), body: String(data.body ?? ""), rev: Number(data.content_rev ?? 1) } : null;
}

export const requestReview = (item: string, withdraw = false) => rpc<string | null>("space_request_review", { p_item: item, p_withdraw: withdraw });

export const decideItem = (item: string, decision: "approve" | "changes", note: string, checklist: { key: string; done: boolean }[]) =>
  rpc<Record<string, unknown>>("space_decide_item", { p_item: item, p_decision: decision, p_note: note, p_checklist: checklist });

export const setItemDeprecated = (item: string, deprecated: boolean) => rpc<string | null>("space_set_item_deprecated", { p_item: item, p_deprecated: deprecated });

export const addReviewComment = (item: string, body: string) => rpc<string>("space_add_review_comment", { p_item: item, p_body: body });

export const fetchItemReview = (item: string) => rpc<ItemReview>("space_item_review", { p_item: item });

export const canApproveItem = async (item: string) => Boolean(await rpc<boolean>("space_can_approve_item", { p_item: item }));

export const recordItemUse = (item: string) => rpc<boolean>("space_record_item_use", { p_item: item });

export const setItemWorks = (item: string, works: boolean | null) => rpc<Record<string, unknown>>("space_set_item_works", { p_item: item, p_works: works });

// ---------------------------------------------------------------------------------------------
// Panel, denetim, entegrasyon, dışa aktarma
// ---------------------------------------------------------------------------------------------

export const fetchTeamInsights = (team: string, days: number) => rpc<TeamInsightsData>("team_insights", { p_team: team, p_days: days });

export const listMyTodos = () => rows<TeamTodo>("my_team_todos");

export async function listAudit(team: string, category: string | null, days: number, before: string | null): Promise<TeamAuditEntry[]> {
  return rows<TeamAuditEntry>("team_audit_list", { p_team: team, p_category: category, p_days: days, p_limit: PAGE + 1, p_before: before });
}

export const fetchAuditStats = (team: string, days: number) => rpc<Record<string, number>>("team_audit_stats", { p_team: team, p_days: days });

export interface TeamIntegrations {
  slug: string;
  enabled: boolean;
  audience: string;
  monthReads: number;
  apps: { userId: string; userName: string; name: string; via: string; reads: number; lastDay: string; tokenId: string | null; blocked: boolean }[];
}

export const fetchIntegrations = (team: string) => rpc<TeamIntegrations>("team_integrations", { p_team: team });

export const setApiBlock = (team: string, user: string, token: string | null, blocked: boolean) => rpc<void>("team_set_api_block", { p_team: team, p_user: user, p_token: token, p_blocked: blocked });

export const exportTeam = (team: string) => rpc<Record<string, unknown>>("team_export", { p_team: team });

export interface ChannelMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  teamRole: TeamRole;
}

export const listChannelMembers = (channel: string, offset = 0) => rows<ChannelMember>("team_channel_members", { p_channel: channel, p_limit: 200, p_offset: offset });
