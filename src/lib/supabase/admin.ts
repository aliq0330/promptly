import { supabase } from "./client";

/**
 * Moderator console data layer (CLAUDE.md §9.140). Every function wraps a
 * SECURITY DEFINER RPC that re-checks `is_moderator()` on the server; nothing
 * here is trusted on its own. Errors propagate (the UI shows the message).
 */

export type AdminContentType = "image" | "text" | "audio" | "video";
export type AdminUserSort = "newest" | "posts" | "storage" | "comments" | "likes" | "messages" | "active";
export type AdminUserStatus = "all" | "suspended" | "blocked" | "moderator";
export type AdminActivityKind = "posts" | "comments" | "likes" | "saves" | "follows" | "reports";

interface CountBlock {
  total: number;
  published: number;
  draft: number;
  private: number;
}
interface TypeRow {
  prompts: number;
  requests: number;
  generators: number;
  workflows: number;
  presets: number;
}

export interface AdminSiteStats {
  users: { total: number; new_7d: number; new_30d: number; suspended: number; posting_blocked: number; moderators: number };
  active_7d: number;
  content: { prompts: CountBlock; requests: CountBlock; generators: CountBlock; workflows: CountBlock; presets: CountBlock };
  by_type: Record<AdminContentType, TypeRow>;
  engagement: { comments: number; likes: number; saves: number; follows: number; conversations: number; messages: number; results: number; reports_open: number };
  storage: {
    total_bytes: number;
    total_files: number;
    by_bucket: { bucket: string; files: number; bytes: number }[];
    by_kind: { kind: string; files: number; bytes: number }[];
  };
  daily: { day: string; posts: number }[];
}

export async function fetchAdminSiteStats(contentType: AdminContentType | null): Promise<AdminSiteStats> {
  const { data, error } = await supabase.rpc("admin_site_stats", { p_content_type: contentType });
  if (error) throw new Error(error.message);
  return data as AdminSiteStats;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  email: string;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  suspendedUntil: string | null;
  suspendedReason: string | null;
  postingBlocked: boolean;
  postingBlockReason: string | null;
  prompts: number;
  requests: number;
  generators: number;
  workflows: number;
  presets: number;
  postsTotal: number;
  comments: number;
  likesGiven: number;
  likesReceived: number;
  saves: number;
  followers: number;
  following: number;
  messages: number;
  conversations: number;
  reportsFiled: number;
  reportsAgainst: number;
  storageFiles: number;
  storageBytes: number;
  imageBytes: number;
  videoBytes: number;
  audioBytes: number;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  email: string | null;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
  suspended_until: string | null;
  suspended_reason: string | null;
  posting_blocked: boolean;
  posting_block_reason: string | null;
  prompts_n: number;
  requests_n: number;
  generators_n: number;
  workflows_n: number;
  presets_n: number;
  posts_total: number;
  comments_n: number;
  likes_given_n: number;
  likes_received_n: number;
  saves_n: number;
  followers_n: number;
  following_n: number;
  messages_n: number;
  conversations_n: number;
  reports_filed_n: number;
  reports_against_n: number;
  storage_files: number;
  storage_bytes: number;
  image_bytes: number;
  video_bytes: number;
  audio_bytes: number;
  total_count: number;
}

function mapUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url,
    bio: row.bio ?? "",
    email: row.email ?? "",
    role: row.role,
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
    suspendedUntil: row.suspended_until,
    suspendedReason: row.suspended_reason,
    postingBlocked: row.posting_blocked,
    postingBlockReason: row.posting_block_reason,
    prompts: row.prompts_n,
    requests: row.requests_n,
    generators: row.generators_n,
    workflows: row.workflows_n,
    presets: row.presets_n,
    postsTotal: row.posts_total,
    comments: row.comments_n,
    likesGiven: row.likes_given_n,
    likesReceived: row.likes_received_n,
    saves: row.saves_n,
    followers: row.followers_n,
    following: row.following_n,
    messages: row.messages_n,
    conversations: row.conversations_n,
    reportsFiled: row.reports_filed_n,
    reportsAgainst: row.reports_against_n,
    storageFiles: row.storage_files,
    storageBytes: Number(row.storage_bytes),
    imageBytes: Number(row.image_bytes),
    videoBytes: Number(row.video_bytes),
    audioBytes: Number(row.audio_bytes),
  };
}

export async function fetchAdminUsers(args: {
  query?: string;
  contentType?: AdminContentType | null;
  sort?: AdminUserSort;
  status?: AdminUserStatus;
  limit?: number;
  offset?: number;
}): Promise<{ users: AdminUser[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_users", {
    p_query: args.query?.trim() || null,
    p_content_type: args.contentType ?? null,
    p_sort: args.sort ?? "newest",
    p_status: args.status ?? "all",
    p_limit: args.limit ?? 30,
    p_offset: args.offset ?? 0,
    p_user_id: null,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as UserRow[];
  return { users: rows.map(mapUser), total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export async function fetchAdminUser(userId: string): Promise<AdminUser | null> {
  const { data, error } = await supabase.rpc("admin_users", {
    p_query: null,
    p_content_type: null,
    p_sort: "newest",
    p_status: "all",
    p_limit: 1,
    p_offset: 0,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as UserRow[];
  return rows[0] ? mapUser(rows[0]) : null;
}

export interface AdminFile {
  bucket: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "video" | "audio" | "other";
  createdAt: string;
}

export async function fetchAdminUserFiles(userId: string): Promise<AdminFile[]> {
  const { data, error } = await supabase.rpc("admin_user_files", { p_user_id: userId, p_limit: 200 });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { bucket: string; name: string; mime: string; size: number; kind: AdminFile["kind"]; created_at: string }[]).map((row) => ({
    bucket: row.bucket,
    name: row.name,
    mime: row.mime,
    size: Number(row.size),
    kind: row.kind,
    createdAt: row.created_at,
  }));
}

/** Public URL for a stored object, or null for private buckets (message photos). */
export function adminFilePublicUrl(file: AdminFile): string | null {
  if (file.bucket === "message-images") return null;
  return supabase.storage.from(file.bucket).getPublicUrl(file.name).data.publicUrl;
}

export interface AdminActivityItem {
  id: string;
  createdAt: string;
  label: string;
  body: string;
  href: string | null;
  meta: Record<string, unknown>;
}

export async function fetchAdminUserActivity(userId: string, kind: AdminActivityKind, before: string | null = null, limit = 30): Promise<AdminActivityItem[]> {
  const { data, error } = await supabase.rpc("admin_user_activity", { p_user_id: userId, p_kind: kind, p_limit: limit, p_before: before });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; created_at: string; label: string; body: string | null; href: string | null; meta: Record<string, unknown> | null }[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    label: row.label,
    body: row.body ?? "",
    href: row.href,
    meta: row.meta ?? {},
  }));
}

export interface AdminConversation {
  id: string;
  counterpartId: string | null;
  counterpartUsername: string | null;
  counterpartName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  lastBody: string | null;
}

/** Logs `view_conversations` in the audit trail. */
export async function fetchAdminUserConversations(userId: string): Promise<AdminConversation[]> {
  const { data, error } = await supabase.rpc("admin_user_conversations", { p_user_id: userId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    conversation_id: string;
    counterpart_id: string | null;
    counterpart_username: string | null;
    counterpart_display_name: string | null;
    message_count: number;
    last_message_at: string | null;
    last_body: string | null;
  }[]).map((row) => ({
    id: row.conversation_id,
    counterpartId: row.counterpart_id,
    counterpartUsername: row.counterpart_username,
    counterpartName: row.counterpart_display_name,
    messageCount: Number(row.message_count),
    lastMessageAt: row.last_message_at,
    lastBody: row.last_body,
  }));
}

export interface AdminMessage {
  id: string;
  senderId: string;
  senderUsername: string | null;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachmentCount: number;
  sharedPromptId: string | null;
  sharedRequestId: string | null;
}

/** Logs `view_conversation` in the audit trail. */
export async function fetchAdminConversationMessages(conversationId: string, userId: string): Promise<AdminMessage[]> {
  const { data, error } = await supabase.rpc("admin_conversation_messages", { p_conversation_id: conversationId, p_user_id: userId, p_limit: 500 });
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    id: string;
    sender_id: string;
    sender_username: string | null;
    body: string | null;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    attachment_count: number;
    shared_prompt_id: string | null;
    shared_request_id: string | null;
  }[]).map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    senderUsername: row.sender_username,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    attachmentCount: row.attachment_count,
    sharedPromptId: row.shared_prompt_id,
    sharedRequestId: row.shared_request_id,
  }));
}

export interface AdminAuditEntry {
  id: string;
  moderatorUsername: string | null;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export async function fetchAdminUserAudit(userId: string): Promise<AdminAuditEntry[]> {
  const { data, error } = await supabase.rpc("admin_user_audit", { p_user_id: userId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; moderator_username: string | null; action: string; details: Record<string, unknown> | null; created_at: string }[]).map((row) => ({
    id: row.id,
    moderatorUsername: row.moderator_username,
    action: row.action,
    details: row.details ?? {},
    createdAt: row.created_at,
  }));
}

export async function setPostingBlock(userId: string, blocked: boolean, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_posting_block", { p_user_id: userId, p_blocked: blocked, p_reason: reason || null });
  if (error) throw new Error(error.message);
}

/** `until = null` lifts the suspension. */
export async function suspendUser(userId: string, until: Date | null, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_suspend_user", { p_user_id: userId, p_until: until ? until.toISOString() : null, p_reason: reason || null });
  if (error) throw new Error(error.message);
}

export async function deleteUserAccount(userId: string, confirmUsername: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_user", { p_user_id: userId, p_confirm_username: confirmUsername });
  if (error) throw new Error(error.message);
}
