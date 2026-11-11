import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { Conversation, Message, MessageAttachment, UserProfile } from "@/types";
import { isGifOnly, removeMessageImages } from "./message-images";
import { mapChatGroupRow, CHAT_GROUP_SELECT, type ChatGroupRow } from "./chat-groups";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/chat-groups";
import { fetchAllRows } from "./paged";
import type { GroupRole } from "@/types";

interface ConversationEmbed {
  id: string;
  last_message_at: string | null;
  kind: "direct" | "group" | "team_channel";
  /** Grup konuşmalarında 1:1 gömülü `chat_groups` satırı (PK = FK olduğundan nesne; olası dizi biçimine de dayanıklı). */
  chat_groups: ChatGroupRow | ChatGroupRow[] | null;
}

interface MembershipRow {
  conversation_id: string;
  unread_count: number;
  status: "accepted" | "pending";
  role: GroupRole;
  archived_at: string | null;
  deleted_at: string | null;
  cleared_at: string | null;
  muted_at: string | null;
  pinned_at?: string | null;
  conversations: ConversationEmbed | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  shared_prompt_id: string | null;
  shared_request_id: string | null;
  reply_to_message_id: string | null;
  attachments: unknown;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  /** Topluluk duyurusuna bağlı mesaj (docs/history/175-*): yalnız RPC doldurur. */
  announcement_id?: string | null;
  /** Hikâyeye özel yanıt (docs/history/198-*): yalnız `reply_to_story` doldurur. */
  story_id?: string | null;
  is_story_reply?: boolean | null;
  /** Topluluk sohbet odası (docs/history/352-*): null = varsayılan oda. */
  room_id?: string | null;
}

const MEMBERSHIP_SELECT = `conversation_id, unread_count, status, role, archived_at, deleted_at, cleared_at, muted_at, pinned_at, conversations(id, last_message_at, kind, chat_groups(${CHAT_GROUP_SELECT}))`;

/** Üyelik satırının grup tarafı (grup değilse null). */
function groupFromMembership(row: MembershipRow) {
  const embed = row.conversations;
  if (!embed || embed.kind !== "group") return null;
  const group = Array.isArray(embed.chat_groups) ? embed.chat_groups[0] : embed.chat_groups;
  return group ? mapChatGroupRow(group, row.role) : null;
}

/** Sohbet türü grup gibi çalışır mı: topluluk sohbeti ya da ekip kanalı (docs/history/353-*). */
const isGroupKind = (kind: string | undefined | null): boolean => kind === "group" || kind === "team_channel";

interface TeamChannelInfoRow {
  id: string;
  name: string;
  description: string | null;
  mode: string;
  posting_policy: "members" | "admins";
  archived_at: string | null;
  team_id: string;
  /** Proje/dosya kanalları (docs/history/369-*): boşsa ekip kanalı. */
  project_id: string | null;
  file_id: string | null;
  project_main: boolean;
  teams: { id: string; slug: string; name: string; tone: string; member_count: number; created_at: string } | { id: string; slug: string; name: string; tone: string; member_count: number; created_at: string }[] | null;
}

/** Ekip kanallarının adı/ekibi/yazma ilkesi (üye kanalı okuyabilir; RLS). Okunamazsa boş harita → kanal listeden atlanır. */
async function fetchTeamChannelInfos(ids: string[]): Promise<Map<string, TeamChannelInfoRow>> {
  const map = new Map<string, TeamChannelInfoRow>();
  if (ids.length === 0) return map;
  for (const part of chunk(ids, ID_CHUNK)) {
    const { data } = await supabase
      .from("team_channels")
      .select("id, name, description, mode, posting_policy, archived_at, team_id, project_id, file_id, project_main, teams(id, slug, name, tone, member_count, created_at)")
      .in("id", part);
    for (const row of (data ?? []) as unknown as TeamChannelInfoRow[]) map.set(row.id, row);
  }
  return map;
}

/**
 * Ekip kanalı → sohbet ekranının beklediği grup şekli. Kanal bir topluluk DEĞİLDİR: topluluk alanları nötrdür, `team` doludur ve topluluk işleri
 * (oda, yönetim, katılma istekleri) bu grupta çizilmez. Yazma ilkesi kanalınkidir (`admins` → ekip yönetimi dışındakiler yazamaz).
 */
function groupFromTeamChannel(row: MembershipRow, info: TeamChannelInfoRow | undefined, mutes: TeamMuteSet) {
  if (!info) return null;
  const team = Array.isArray(info.teams) ? info.teams[0] : info.teams;
  if (!team) return null;
  const admin = row.role === "owner" || row.role === "admin";
  return {
    id: info.id,
    name: `#${info.name}`,
    description: info.description,
    avatarUrl: null,
    coverUrl: null,
    coverColor: null,
    visibility: "restricted" as const,
    postingPolicy: info.posting_policy === "admins" ? ("admins" as const) : ("members" as const),
    memberLimit: 1000,
    memberCount: team.member_count,
    pendingRequestCount: 0,
    historyVisible: true,
    membersCanPin: false,
    rolePermissions: DEFAULT_ROLE_PERMISSIONS,
    createdAt: team.created_at,
    myRole: admin ? ("admin" as const) : ("member" as const),
    category: "general" as const,
    feedPolicy: "members" as const,
    rules: null,
    rulesVersion: 1,
    rulesRequired: false,
    closedAt: info.archived_at,
    postCount: 0,
    origin: "native" as const,
    team: {
      id: team.id,
      slug: team.slug,
      name: team.name,
      tone: team.tone,
      channelName: info.name,
      projectId: info.project_id ?? null,
      fileId: info.file_id ?? null,
      projectMain: info.project_main === true,
      muteScope: mutes.scopeOf(team.id, info.project_id ?? null),
    },
  };
}

/** Çağıranın ekip/proje sessizlikleri (`team_my_mutes`): Mesajlar listesi satırı kanalın kendi sessizliğine EK olarak bunlardan da sessiz sayılır. */
interface TeamMuteSet {
  scopeOf: (teamId: string, projectId: string | null) => "team" | "project" | null;
}
const NO_MUTES: TeamMuteSet = { scopeOf: () => null };

async function fetchTeamMutes(): Promise<TeamMuteSet> {
  const { data, error } = await supabase.rpc("team_my_mutes");
  if (error || !Array.isArray(data)) return NO_MUTES; // eski sunucu / hata → yalnız kanal sessizliği
  const teams = new Set<string>();
  const projects = new Set<string>();
  for (const row of data as { team_id: string; project_id: string | null }[]) (row.project_id ? projects : teams).add(row.project_id ?? row.team_id);
  return { scopeOf: (teamId, projectId) => (teams.has(teamId) ? "team" : projectId && projects.has(projectId) ? "project" : null) };
}

export const MESSAGE_SELECT =
  "id, conversation_id, sender_id, body, shared_prompt_id, shared_request_id, reply_to_message_id, attachments, edited_at, deleted_at, created_at, announcement_id, story_id, is_story_reply, room_id";

/** Defensive read of the `attachments` jsonb column — anything that isn't a well-formed `{path, mime}` entry is dropped rather than trusted. */
function parseAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  const result: MessageAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { path, width, height, mime } = entry as Record<string, unknown>;
    if (typeof path !== "string" || !path) continue;
    result.push({
      path,
      width: typeof width === "number" ? width : null,
      height: typeof height === "number" ? height : null,
      mime: typeof mime === "string" ? mime : "image/jpeg",
    });
  }
  return result;
}

/** Exported so the Realtime subscription (Bölüm 21 Faz C) can map a `postgres_changes` payload row the same way a REST response is mapped — one mapping function, two delivery paths. */
export function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    sharedPromptId: row.shared_prompt_id,
    sharedRequestId: row.shared_request_id,
    replyToMessageId: row.reply_to_message_id,
    attachments: parseAttachments(row.attachments),
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    announcementId: row.announcement_id ?? null,
    roomId: row.room_id ?? null,
    storyId: row.story_id ?? null,
    isStoryReply: row.is_story_reply === true,
  };
}

interface PreviewRow {
  body: string | null;
  shared_prompt_id: string | null;
  shared_request_id: string | null;
  attachments?: unknown;
  deleted_at: string | null;
  created_at: string;
}

/** Renders a conversation list's one-line preview for the most recent message, honoring shared content/deletion the same way the thread itself does. */
function previewTextFor(row: PreviewRow | undefined): string {
  if (!row) return translateForRuntime("messages.noMessagesYetShort");
  if (row.deleted_at) return translateForRuntime("messages.thisMessageWasDeleted");
  if (row.body) return row.body;
  if (row.shared_prompt_id) return translateForRuntime("messages.sharedAPromptPreview");
  if (row.shared_request_id) return translateForRuntime("messages.sharedARequestPreview");
  const attachments = parseAttachments(row.attachments);
  if (attachments.length > 0) return translateForRuntime(isGifOnly(attachments) ? "messages.sentAGifPreview" : "messages.sentAPhotoPreview");
  return translateForRuntime("messages.noMessagesYetShort");
}

/**
 * Every real conversation the given user is a member of, newest-first —
 * genuinely real, cross-device DMs (CLAUDE.md Bölüm 21 Faz 6), unlike the
 * rest of the app's mock+localStorage messaging (Bölüm 16). `conversations`
 * has no stored message preview, so the last message body is fetched
 * separately and matched up in JS.
 */
export async function fetchConversationsForUser(userId: string): Promise<Conversation[]> {
  try {
    // Her üyelik, 1000'lik sayfalarla (çok sohbetli bir kişide PostgREST 1000'de keser); hata olursa fırlatır — yarım liste bütün gibi görünmez.
    const { rows: memberships } = await fetchAllRows((from, to) =>
      supabase.from("conversation_members").select(MEMBERSHIP_SELECT).eq("user_id", userId).order("conversation_id", { ascending: true }).range(from, to),
    );
    if (memberships.length === 0) return [];

    const rows = memberships as unknown as MembershipRow[];
    const conversationIds = rows.map((m) => m.conversation_id);
    const directIds = rows.filter((m) => !isGroupKind(m.conversations?.kind)).map((m) => m.conversation_id);
    const teamIds = rows.filter((m) => m.conversations?.kind === "team_channel").map((m) => m.conversation_id);
    const [teamInfos, teamMutes] = await Promise.all([fetchTeamChannelInfos(teamIds), teamIds.length > 0 ? fetchTeamMutes() : Promise.resolve(NO_MUTES)]);

    // Birebir sohbetlerin karşı tarafı. Gruplarda üye listesi bu yoldan ASLA çekilmez (RLS yalnız kendi satırımı verir; liste `chat_group_members` RPC'sinde).
    // Kimlikler adrese yazıldığı için parça parça (yüzlerce birebir sohbette tek `in(...)` adres sınırını aşar ve liste hiç gelmezdi).
    const otherMembers = (
      await Promise.all(
        chunk(directIds, ID_CHUNK).map(async (ids) => {
          const { data } = await supabase
            .from("conversation_members")
            .select(
              "conversation_id, profiles(id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests)",
            )
            .in("conversation_id", ids)
            .neq("user_id", userId);
          return data ?? [];
        }),
      )
    ).flat();

    // Her konuşmanın görünür SON mesajı (sunucu: kişisel temizleme + RLS uygulanmış, konuşma başına tek satır).
    const lastMessageByConversation = await fetchLastMessages(conversationIds);
    // Topluluk sohbetlerinde son mesajın odası ("# oda" etiketi); eksik migration → boş harita.
    const lastRoomByConversation = await fetchLastRooms(rows.filter((m) => m.conversations?.kind === "group").map((m) => m.conversation_id));
    // Grupta okunmamış sayısı sunucuda okuma anında hesaplanır (docs/history/258-*); migration yoksa sütun değeri kalır.
    const groupUnread = await fetchGroupUnreadCounts(rows.filter((m) => isGroupKind(m.conversations?.kind)).map((m) => m.conversation_id));

    const otherByConversation = new Map<string, ProfileRow>();
    for (const row of (otherMembers ?? []) as unknown as { conversation_id: string; profiles: ProfileRow | null }[]) {
      if (row.profiles) otherByConversation.set(row.conversation_id, row.profiles);
    }

    const groupSenderNames = await fetchSenderNames(
      rows.filter((m) => isGroupKind(m.conversations?.kind)).map((m) => lastMessageByConversation.get(m.conversation_id)?.sender_id),
      userId,
    );

    return rows
      .map((m): Conversation | null => {
        const last = lastMessageByConversation.get(m.conversation_id);
        const base = {
          id: m.conversation_id,
          lastMessageAt: m.conversations?.last_message_at ?? last?.created_at ?? new Date(0).toISOString(),
          unreadCount: isGroupKind(m.conversations?.kind) ? (groupUnread.get(m.conversation_id) ?? m.unread_count) : m.unread_count,
          myStatus: m.status,
          archivedAt: m.archived_at,
          deletedAt: m.deleted_at,
          mutedAt: m.muted_at,
          clearedAt: m.cleared_at,
          pinnedAt: m.pinned_at ?? null,
        };
        if (isGroupKind(m.conversations?.kind)) {
          const group = m.conversations?.kind === "team_channel" ? groupFromTeamChannel(m, teamInfos.get(m.conversation_id), teamMutes) : groupFromMembership(m);
          if (!group) return null; // grup satırı okunamadı — listede göstermek yerine atla
          // Ekip/proje düzeyinde sessiz kanal listede de sessizdir (rozet/nokta/üst sayaç kanalın kendi sessizliğiyle aynı kuralı izler).
          const broadMuted = "team" in group && group.team?.muteScope ? new Date(0).toISOString() : null;
          return {
            ...base,
            mutedAt: base.mutedAt ?? broadMuted,
            kind: "group",
            group,
            participants: [],
            lastMessage: groupPreview(last, last?.sender_id === userId ? null : groupSenderNames.get(last?.sender_id ?? "")),
            lastRoom: lastRoomByConversation.get(m.conversation_id) ?? null,
          };
        }
        const otherProfile = otherByConversation.get(m.conversation_id);
        if (!otherProfile) return null; // no other member found — shouldn't happen for a real 1:1 thread
        return { ...base, kind: "direct", group: null, participants: [mapProfileRow(otherProfile)], lastMessage: previewTextFor(last) };
      })
      .filter((c): c is Conversation => Boolean(c))
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  } catch (err) {
    console.error("fetchConversationsForUser", err);
    return [];
  }
}

type LastMessageRow = PreviewRow & { conversation_id: string; sender_id: string };

/** `conversation_last_messages` RPC: konuşma başına tek, görünür son mesaj. Hata → boş harita (önizleme "henüz mesaj yok" olur, liste yine açılır). */
const ID_CHUNK = 100;
const chunk = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

async function fetchLastMessages(conversationIds: string[]): Promise<Map<string, LastMessageRow>> {
  const result = new Map<string, LastMessageRow>();
  // 200'erli parçalar: tek çağrı 500'de kesiliyordu (500. sohbetten sonrasının önizlemesi boş kalırdı).
  const answers = await Promise.all(
    chunk(conversationIds, 200).map(async (ids) => {
      const { data, error } = await supabase.rpc("conversation_last_messages", { p_conversation_ids: ids });
      if (error) {
        console.error("conversation_last_messages", error);
        return [];
      }
      return Array.isArray(data) ? (data as LastMessageRow[]) : [];
    }),
  );
  for (const row of answers.flat()) result.set(row.conversation_id, row);
  return result;
}

/** `community_last_rooms` RPC: topluluk sohbetinin son görünür mesajının odası. Hata/eksik migration → boş harita (etiket çizilmez). */
async function fetchLastRooms(groupIds: string[]): Promise<Map<string, { id: string; name: string }>> {
  const result = new Map<string, { id: string; name: string }>();
  const answers = await Promise.all(
    chunk(groupIds, 200).map(async (ids) => {
      const { data, error } = await supabase.rpc("community_last_rooms", { p_conversation_ids: ids });
      if (error || !Array.isArray(data)) return [];
      return data as { conversation_id: string; room_id: string | null; room_name: string | null }[];
    }),
  );
  for (const row of answers.flat()) if (row.room_id && row.room_name) result.set(row.conversation_id, { id: row.room_id, name: row.room_name });
  return result;
}

/** Grup/topluluk sohbetlerinde okunmamış mesaj sayısı (sunucu okuma anında sayar, en çok 100). Hata/eksik migration → boş harita (sütun değeri kullanılır). */
async function fetchGroupUnreadCounts(groupIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const answers = await Promise.all(
    chunk(groupIds, ID_CHUNK).map(async (ids) => {
      const { data, error } = await supabase.rpc("group_unread_counts", { p_ids: ids });
      if (error || !Array.isArray(data)) return [];
      return data as { conversation_id: string; unread_count: number }[];
    }),
  );
  for (const row of answers.flat()) result.set(row.conversation_id, Number(row.unread_count ?? 0));
  return result;
}

/** Son mesajı yazan kişilerin görünen adları (grup önizlemesindeki "Ayşe: …" için); kendi mesajlarım hariç. */
async function fetchSenderNames(senderIds: (string | undefined)[], viewerId: string): Promise<Map<string, string>> {
  const ids = [...new Set(senderIds.filter((id): id is string => Boolean(id) && id !== viewerId))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const found = await Promise.all(chunk(ids, ID_CHUNK).map(async (part) => (await supabase.from("profiles").select("id, display_name").in("id", part)).data ?? []));
  for (const row of found.flat() as { id: string; display_name: string }[]) names.set(row.id, row.display_name);
  return names;
}

/** Grup önizlemesi: "Ayşe: merhaba" / "Sen: merhaba". Mesaj yoksa ya da silinmişse düz metin. */
function groupPreview(last: LastMessageRow | undefined, senderName: string | null | undefined): string {
  const text = previewTextFor(last);
  if (!last || last.deleted_at) return text;
  if (senderName === null) return translateForRuntime("groups.previewYou", { text });
  return senderName ? `${senderName.split(" ")[0]}: ${text}` : text;
}

/**
 * Ekip kanalı / topluluk odası listesi için "Ayşe: merhaba" önizlemeleri (docs/history/369-*): kanal başına son görünür mesaj + zamanı.
 * `fetchConversationsForUser` ile AYNI yol (`conversation_last_messages` + gönderen adı); hata → boş harita (satır "henüz mesaj yok" der).
 */
export async function fetchChannelPreviews(conversationIds: string[], viewerId: string): Promise<Map<string, { text: string; at: string }>> {
  const result = new Map<string, { text: string; at: string }>();
  if (conversationIds.length === 0) return result;
  const last = await fetchLastMessages(conversationIds);
  const names = await fetchSenderNames([...last.values()].map((row) => row.sender_id), viewerId);
  for (const [id, row] of last) result.set(id, { text: groupPreview(row, row.sender_id === viewerId ? null : names.get(row.sender_id)), at: row.created_at });
  return result;
}

/**
 * A single real conversation, from this member's point of view — for a
 * direct link that fell outside the recent-conversations batch above.
 * Returns null both when the conversation doesn't exist and when this user
 * isn't a member of it (RLS hides the row either way) — indistinguishable
 * on purpose, same as every other "not found" in this app.
 */
export async function fetchConversationForUser(conversationId: string, userId: string): Promise<Conversation | null> {
  try {
    const { data: membership, error } = await supabase
      .from("conversation_members")
      .select(MEMBERSHIP_SELECT)
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !membership) return null;

    const row = membership as unknown as MembershipRow;
    const isGroup = isGroupKind(row.conversations?.kind);

    let otherProfile: ProfileRow | null | undefined = null;
    if (!isGroup) {
      const { data: otherMember } = await supabase
        .from("conversation_members")
        .select(
          "profiles(id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests)",
        )
        .eq("conversation_id", conversationId)
        .neq("user_id", userId)
        .maybeSingle();
      otherProfile = (otherMember as unknown as { profiles: ProfileRow | null } | null)?.profiles;
      if (!otherProfile) return null;
    }

    const last = (await fetchLastMessages([conversationId])).get(conversationId);
    const base = {
      id: conversationId,
      lastMessageAt: row.conversations?.last_message_at ?? last?.created_at ?? new Date(0).toISOString(),
      unreadCount: isGroup ? ((await fetchGroupUnreadCounts([conversationId])).get(conversationId) ?? row.unread_count) : row.unread_count,
      myStatus: row.status,
      archivedAt: row.archived_at,
      deletedAt: row.deleted_at,
      mutedAt: row.muted_at,
      clearedAt: row.cleared_at,
      pinnedAt: row.pinned_at ?? null,
    };

    if (isGroup) {
      const isTeamChannel = row.conversations?.kind === "team_channel";
      const group = isTeamChannel ? groupFromTeamChannel(row, (await fetchTeamChannelInfos([conversationId])).get(conversationId), await fetchTeamMutes()) : groupFromMembership(row);
      if (!group) return null;
      const names = await fetchSenderNames([last?.sender_id], userId);
      const lastRoom = isTeamChannel ? null : ((await fetchLastRooms([conversationId])).get(conversationId) ?? null);
      const broadMuted = "team" in group && group.team?.muteScope ? new Date(0).toISOString() : null;
      return { ...base, mutedAt: base.mutedAt ?? broadMuted, kind: "group", group, participants: [], lastMessage: groupPreview(last, last?.sender_id === userId ? null : names.get(last?.sender_id ?? "")), lastRoom };
    }
    return { ...base, kind: "direct", group: null, participants: [mapProfileRow(otherProfile as ProfileRow)], lastMessage: previewTextFor(last) };
  } catch (err) {
    console.error("fetchConversationForUser", err);
    return null;
  }
}

/**
 * Every message in a real conversation, oldest-first, minus any this user
 * hid "for themselves" (`message_hidden_for` — Bölüm 21 Faz A) and minus
 * everything at or before their own `cleared_at` ("Mesajları temizle" —
 * the rows stay, only this viewer's view is cut). RLS (Bölüm 19) already
 * restricts the base query to conversation members. If the viewer's own
 * clear moment can't be read the thread is NOT shown: better empty than
 * showing history they cleared.
 */
export async function fetchMessages(conversationId: string, viewerId: string): Promise<Message[]> {
  return (await fetchMessagePage(conversationId, viewerId)).messages;
}

/**
 * Topluluk sohbet odası kapsamı (docs/history/352-*): `id` null = varsayılan oda (mesajlarda room_id NULL), dolu = o oda.
 * `undefined` (birebir sohbet ya da süzgeçsiz okuma) = oda süzgeci yok.
 */
export type MessageRoomScope = { id: string | null };

/** Sorguyu odaya daraltır (varsayılan oda: `room_id is null`). Tip karmaşıklığını önlemek için gevşek bir sözleşmeyle çalışır; sorgu zinciri aynı kalır. */
function scopeToRoom<T>(query: T, room: MessageRoomScope | undefined): T {
  if (!room) return query;
  const filter = query as unknown as { is: (column: string, value: null) => unknown; eq: (column: string, value: string) => unknown };
  return (room.id === null ? filter.is("room_id", null) : filter.eq("room_id", room.id)) as T;
}

/** Bir seferde yüklenen en yeni mesaj sayısı; daha eskileri `before` ile istenir (büyük grup sohbetleri tüm geçmişi tek seferde çekmesin). */
export const MESSAGE_PAGE_SIZE = 200;

/**
 * Konuşmanın en yeni `MESSAGE_PAGE_SIZE` mesajı (eskiden yeniye); `before` verilirse o zamandan ÖNCEKİ sayfa.
 * `hasMore`: daha eski mesaj olabilir. Kişisel temizleme ve "benden sil" aynen uygulanır; grupta katılmadan önceki
 * mesajlar ve engel ilişkisindeki göndericilerin mesajları zaten RLS ile gelmez.
 */
export async function fetchMessagePage(
  conversationId: string,
  viewerId: string,
  options: { before?: string; room?: MessageRoomScope } = {},
): Promise<{ messages: Message[]; hasMore: boolean }> {
  try {
    const { data: membership, error: membershipError } = await supabase
      .from("conversation_members")
      .select("cleared_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", viewerId)
      .maybeSingle();
    if (membershipError) return { messages: [], hasMore: false };
    const clearedAt = (membership as { cleared_at: string | null } | null)?.cleared_at ?? null;

    let query = scopeToRoom(supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId), options.room);
    if (clearedAt) query = query.gt("created_at", clearedAt);
    if (options.before) query = query.lt("created_at", options.before);
    const [{ data, error }, { data: hidden }] = await Promise.all([
      query.order("created_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE),
      supabase.from("message_hidden_for").select("message_id").eq("user_id", viewerId),
    ]);
    if (error) return { messages: [], hasMore: false };
    const hiddenIds = new Set((hidden ?? []).map((row) => row.message_id as string));
    const rows = data ?? [];
    return {
      hasMore: rows.length >= MESSAGE_PAGE_SIZE,
      messages: rows
        .map((row) => mapMessageRow(row as MessageRow))
        .filter((message) => !hiddenIds.has(message.id))
        .reverse(),
    };
  } catch (err) {
    console.error("fetchMessages", err);
    return { messages: [], hasMore: false };
  }
}

/** Atlama penceresinde hedefin her iki yanında yüklenen mesaj sayısı. */
export const MESSAGE_WINDOW_SIZE = 60;

/**
 * Belirli bir mesaja atlamak için onun çevresindeki pencere (eskiden yeniye): hedefin öncesinden ve sonrasından birer sayfa.
 * Mesaj bu kullanıcı için GÖRÜNMEZSE (RLS reddi, kişisel "temizle", "benden sil", yok) null döner — içerik asla erişimin ötesinde
 * gösterilmez. `hasNewer`: pencerenin ötesinde daha yeni mesaj var (arayüz "güncel mesajlara dön" sunar).
 */
export async function fetchMessageWindow(
  conversationId: string,
  viewerId: string,
  messageId: string,
): Promise<{ messages: Message[]; hasOlder: boolean; hasNewer: boolean; roomId: string | null } | null> {
  try {
    const [{ data: membership }, { data: target }, { data: hiddenTarget }] = await Promise.all([
      supabase.from("conversation_members").select("cleared_at").eq("conversation_id", conversationId).eq("user_id", viewerId).maybeSingle(),
      supabase.from("messages").select(MESSAGE_SELECT).eq("id", messageId).eq("conversation_id", conversationId).maybeSingle(),
      supabase.from("message_hidden_for").select("message_id").eq("user_id", viewerId).eq("message_id", messageId).maybeSingle(),
    ]);
    if (!membership || !target || hiddenTarget) return null;
    const clearedAt = (membership as { cleared_at: string | null }).cleared_at;
    const anchor = mapMessageRow(target as MessageRow);
    if (clearedAt && anchor.createdAt <= clearedAt) return null;

    // Pencere hedef mesajın KENDİ odasıyla sınırlıdır (topluluk sohbetinde başka odanın mesajları araya karışmaz).
    const room: MessageRoomScope = { id: anchor.roomId };
    let olderQuery = scopeToRoom(supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId), room).lt("created_at", anchor.createdAt);
    const newerQuery = scopeToRoom(supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId), room).gt("created_at", anchor.createdAt);
    if (clearedAt) {
      olderQuery = olderQuery.gt("created_at", clearedAt);
    }
    const [{ data: older, error: olderError }, { data: newer, error: newerError }, { data: hidden }] = await Promise.all([
      olderQuery.order("created_at", { ascending: false }).limit(MESSAGE_WINDOW_SIZE + 1),
      newerQuery.order("created_at", { ascending: true }).limit(MESSAGE_WINDOW_SIZE + 1),
      supabase.from("message_hidden_for").select("message_id").eq("user_id", viewerId),
    ]);
    if (olderError || newerError) return null;
    const hiddenIds = new Set((hidden ?? []).map((row) => row.message_id as string));
    const olderRows = older ?? [];
    const newerRows = newer ?? [];
    const rows = [...olderRows.slice(0, MESSAGE_WINDOW_SIZE).reverse(), target, ...newerRows.slice(0, MESSAGE_WINDOW_SIZE)];
    return {
      messages: rows.map((row) => mapMessageRow(row as MessageRow)).filter((message) => !hiddenIds.has(message.id)),
      hasOlder: olderRows.length > MESSAGE_WINDOW_SIZE,
      hasNewer: newerRows.length > MESSAGE_WINDOW_SIZE,
      roomId: anchor.roomId,
    };
  } catch (err) {
    console.error("fetchMessageWindow", err);
    return null;
  }
}

export interface SendMessageInput {
  /** Client-generated message id — lets the optimistic bubble, a retry, and the Realtime echo of this same INSERT all be recognised as ONE message (no duplicates). */
  id?: string;
  body?: string;
  attachments?: MessageAttachment[];
  sharedPromptId?: string;
  sharedRequestId?: string;
  replyToMessageId?: string;
  /** Topluluk sohbet odası (docs/history/352-*): null/yok = varsayılan oda. */
  roomId?: string | null;
}

/** Genuinely, permanently sends a message — plain text, a shared prompt/request (with an optional caption), or a reply. Bölüm 19's handle_new_message trigger updates conversations.last_message_at and every other member's unread_count; the messages_has_content CHECK (Faz A) rejects a completely empty send at the database level. */
export async function sendMessage(conversationId: string, senderId: string, input: SendMessageInput): Promise<Message> {
  const trimmed = input.body?.trim();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      conversation_id: conversationId,
      sender_id: senderId,
      body: trimmed || null,
      attachments: input.attachments ?? [],
      shared_prompt_id: input.sharedPromptId ?? null,
      shared_request_id: input.sharedRequestId ?? null,
      reply_to_message_id: input.replyToMessageId ?? null,
      ...(input.roomId ? { room_id: input.roomId } : {}),
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? translateForRuntime("messages.sendFailedShort"));
  return mapMessageRow(data as MessageRow);
}

/** Edits the caller's own message body — RLS (Faz A) only allows the sender, within 15 minutes of sending; `handle_message_body_edit` stamps edited_at automatically. */
export async function editMessage(messageId: string, senderId: string, body: string, allowEmpty = false): Promise<Message> {
  const trimmed = body.trim();
  if (!trimmed && !allowEmpty) throw new Error(translateForRuntime("messages.emptyMessageNotAllowed"));
  const { data, error } = await supabase
    .from("messages")
    .update({ body: trimmed || null })
    .eq("id", messageId)
    .eq("sender_id", senderId)
    .select(MESSAGE_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(translateForRuntime("messages.editWindowExpiredError"));
  return mapMessageRow(data as MessageRow);
}

/** "Herkesten sil" — clears the message's content for every member of the conversation. Same RLS window as editing (Faz A). */
export async function deleteMessageForEveryone(messageId: string, senderId: string, attachments: MessageAttachment[] = []): Promise<void> {
  const { data, error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString(), body: null, shared_prompt_id: null, shared_request_id: null, attachments: [] })
    .eq("id", messageId)
    .eq("sender_id", senderId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(translateForRuntime("messages.deleteWindowExpired"));
  // The row's content is gone for everyone — the files go too (best-effort; a failure here only leaves an unreachable orphan, never a visible photo).
  if (attachments.length > 0) await removeMessageImages(attachments.map((a) => a.path));
}

/** "Benden sil" — hides a message from only this viewer's own thread view; never touches the row itself or other members' view of it. */
export async function hideMessageForMe(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("message_hidden_for").insert({ message_id: messageId, user_id: userId });
  if (error) throw new Error(error.message);
}

/** Resets the caller's unread counter only — best-effort, a failure here shouldn't block anything. Deliberately does NOT advance the read cursor (that is `markConversationReadUpTo`, sent only while messages are actually on screen), so clearing/deleting a chat never reports "read" to the other side. `unread_count` isn't writable from the client (trigger-maintained), hence the RPC. */
export async function markConversationRead(conversationId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
    if (error) console.error("markConversationRead", error);
  } catch (err) {
    console.error("markConversationRead", err);
  }
}

/** Listeden "Okundu": `markConversationRead` ile aynı sunucu yolu (karşı tarafa "okundu" bilgisi gitmez) ama hata SESSİZ geçmez — çağıran yerel sayacı yalnız başarıda sıfırlar. */
export async function clearConversationUnread(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  if (error) throw new Error(error.message);
}

/**
 * Kişi/Topluluk bilgisi için sohbetin paylaşılan medyası (docs/history/271-*): süzgeç SUNUCUDA (`chat_shared_items` / `chat_shared_stats`, SECURITY INVOKER —
 * mesaj okuma kuralı + kişisel "temizle"/"benden sil"/silinmiş mesajlar HARİÇ; görünmeyen mesajın içeriği hiçbir yolla gösterilmez).
 * (Eski istemci süzgeci `attachments @> [{}]`'u PostgREST'e `cs.{[object Object]}` diye gönderiyordu → canlıda "Fotoğraflar yüklenemedi".)
 */
const PHOTO_MESSAGE_LIMIT = 100;

export interface ConversationPhoto {
  messageId: string;
  attachment: MessageAttachment;
}

export type ChatSharedKind = "photos" | "links" | "content";

export interface ChatSharedStats {
  photos: number;
  content: number;
  links: number;
}

export interface ChatSharedItem {
  id: string;
  createdAt: string;
  senderId: string;
  body: string | null;
  attachments: MessageAttachment[];
  sharedPromptId: string | null;
  sharedRequestId: string | null;
}

interface SharedItemRow {
  id: string;
  created_at: string;
  sender_id: string;
  body: string | null;
  attachments: unknown;
  shared_prompt_id: string | null;
  shared_request_id: string | null;
}

export async function fetchChatSharedItems(conversationId: string, kind: ChatSharedKind, limit = 100): Promise<{ items: ChatSharedItem[]; truncated: boolean }> {
  const { data, error } = await supabase.rpc("chat_shared_items", { p_conversation_id: conversationId, p_kind: kind, p_limit: limit + 1 });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SharedItemRow[];
  return {
    items: rows.slice(0, limit).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      senderId: row.sender_id,
      body: row.body,
      attachments: parseAttachments(row.attachments),
      sharedPromptId: row.shared_prompt_id,
      sharedRequestId: row.shared_request_id,
    })),
    truncated: rows.length > limit,
  };
}

export async function fetchChatSharedStats(conversationId: string): Promise<ChatSharedStats> {
  const { data, error } = await supabase.rpc("chat_shared_stats", { p_conversation_id: conversationId });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const num = (value: unknown) => Number(value ?? 0) || 0;
  return { photos: num(row.photos), content: num(row.content), links: num(row.links) };
}

export async function fetchConversationPhotos(conversationId: string): Promise<{ photos: ConversationPhoto[]; truncated: boolean }> {
  const { items, truncated } = await fetchChatSharedItems(conversationId, "photos", PHOTO_MESSAGE_LIMIT);
  const photos: ConversationPhoto[] = [];
  for (const item of items) for (const attachment of item.attachments) photos.push({ messageId: item.id, attachment });
  return { photos, truncated };
}

/**
 * Finds an existing real 1:1 conversation between these two real users, or
 * starts a new one — the entry point for a real profile's "Mesaj Gönder"
 * button (CLAUDE.md Bölüm 21 Faz 6 / Faz B).
 *
 * Routes entirely through the `start_direct_conversation` RPC (Bölüm 21
 * Faz B) instead of doing the find-or-create dance in JS the way the first
 * version of this function did. That old version had a real bug: it
 * generated the new conversation's id client-side specifically to dodge an
 * RLS chicken-and-egg problem on the read-back (`conversations`' SELECT
 * policy is `is_conversation_member(id)`, and at INSERT time no membership
 * row exists yet), but it still decided "accepted" for both sides in JS.
 * Faz B needs that decision to depend on the recipient's privacy setting
 * and whether they already follow the sender — logic that can't be trusted
 * to the client (a malicious client could just always insert 'accepted'
 * and skip the request/privacy flow entirely), so it now lives entirely
 * inside the RPC, which computes it server-side and does the same id-
 * generation trick internally.
 */
export async function getOrCreateDirectConversation(
  userId: string,
  otherUserId: string,
  otherProfile: UserProfile,
): Promise<Conversation> {
  const { data: conversationId, error } = await supabase.rpc("start_direct_conversation", {
    other_user_id: otherUserId,
  });
  if (error || !conversationId) {
    throw new Error(error?.message ?? translateForRuntime("messages.startConversationFailedShort"));
  }

  const found = await fetchConversationForUser(conversationId as string, userId);
  if (found) return found;

  // Best-effort fallback for a conversation this fresh — fetchConversationForUser
  // failing here would be a real anomaly, not an expected "not found", but
  // there's no reason to show the caller a false "gone" state over it.
  return {
    id: conversationId as string,
    kind: "direct",
    group: null,
    mutedAt: null,
    participants: [otherProfile],
    lastMessage: translateForRuntime("messages.noMessagesYetShort"),
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    myStatus: "accepted",
    archivedAt: null,
    deletedAt: null,
    clearedAt: null,
  };
}

/** Accepts a pending message request — a plain update of the caller's own membership row, already allowed by the existing "members can update their own membership row" policy. Also called automatically after the recipient's first reply (Bölüm 21 Faz B). */
export async function acceptMessageRequest(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("conversation_members")
    .update({ status: "accepted" })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Declines a pending message request by leaving the conversation — a plain delete of the caller's own membership row, already allowed by the existing "members can leave a conversation" policy. Doesn't block the sender from trying again later; use blockUser for that. */
export async function declineMessageRequest(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** The per-viewer state columns a chat-menu action writes (docs/history/171-*) — always the viewer's OWN membership row, never the other side's. */
export type MemberStatePatch = { archived_at?: string | null; deleted_at?: string | null; cleared_at?: string | null; pinned_at?: string | null };

/** Writes `patch` to the viewer's own membership row. "0 rows" is a failure, not a silent success (the row is missing or RLS refused it). */
async function updateOwnMembership(conversationId: string, userId: string, patch: MemberStatePatch): Promise<void> {
  const { data, error } = await supabase
    .from("conversation_members")
    .update(patch)
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .select("conversation_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(translateForRuntime("messages.stateUpdateFailed"));
}

/** Server time of the newest message in the conversation, or null when it has none — used as the clear moment so a skewed device clock can neither hide new messages nor leave old ones visible. */
async function newestMessageTime(conversationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { created_at: string } | null)?.created_at ?? null;
}

/** "Arşivle" / "Arşivden çıkar" — only the viewer's own archive flag; the chat, the messages and the other side are untouched. Returns the stored value. */
export async function setConversationArchived(conversationId: string, userId: string, archived: boolean): Promise<string | null> {
  const archivedAt = archived ? new Date().toISOString() : null;
  await updateOwnMembership(conversationId, userId, { archived_at: archivedAt });
  return archivedAt;
}

/** Sohbeti listenin başına sabitler / sabitlemeyi kaldırır (docs/history/352-*): yalnız kendi üyelik satırı. Saklanan değeri döndürür. */
export async function setConversationPinned(conversationId: string, userId: string, pinned: boolean): Promise<string | null> {
  const pinnedAt = pinned ? new Date().toISOString() : null;
  await updateOwnMembership(conversationId, userId, { pinned_at: pinnedAt });
  return pinnedAt;
}

/** Listemden kaldırılmış / arşivlenmiş sohbeti (özellikle grubu) kişisel listeye geri koyar; yalnız kendi üyelik satırı. */
export async function restoreConversationToList(conversationId: string, userId: string): Promise<void> {
  await updateOwnMembership(conversationId, userId, { deleted_at: null, archived_at: null });
}

/**
 * "Mesajları temizle" — hides the history up to now from the viewer's own view
 * (own `cleared_at`); the chat stays in their list, the message rows and the
 * other side's view are untouched. Returns the new `cleared_at` (null when
 * there was nothing to clear).
 */
export async function clearConversationHistory(conversationId: string, userId: string): Promise<string | null> {
  const clearedAt = await newestMessageTime(conversationId);
  if (!clearedAt) return null;
  await updateOwnMembership(conversationId, userId, { cleared_at: clearedAt });
  await markConversationRead(conversationId);
  return clearedAt;
}

/**
 * "Sohbeti sil" — takes the chat out of the viewer's OWN list (own
 * `deleted_at`) and hides the history it held (own `cleared_at`); nothing shared
 * is deleted and the other side keeps everything. A new message brings the
 * chat back (server trigger), showing only what comes after this moment.
 * Deliberately not `declineMessageRequest`, which removes the membership row.
 */
export async function deleteConversationFromMyList(
  conversationId: string,
  userId: string,
): Promise<{ deletedAt: string; clearedAt: string | null }> {
  const newest = await newestMessageTime(conversationId);
  const deletedAt = new Date().toISOString();
  await updateOwnMembership(conversationId, userId, {
    deleted_at: deletedAt,
    archived_at: null,
    ...(newest ? { cleared_at: newest } : {}),
  });
  await markConversationRead(conversationId);
  return { deletedAt, clearedAt: newest };
}

/**
 * Which of these people the viewer may start a conversation with right now —
 * the server's answer (`filter_messageable_users`, same rules as
 * `start_direct_conversation`). Throws on failure so a caller that must not
 * guess (picking someone) fails closed; the reason a person is missing is
 * deliberately not returned.
 */
export async function filterMessageableUsers(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await supabase.rpc("filter_messageable_users", { p_user_ids: userIds.slice(0, 100) });
  if (error) throw new Error(error.message);
  return new Set((data ?? []) as string[]);
}

/** Everyone the viewer has a conversation with (any state, deleted-from-list included) → that conversation's id — the picker opens these instead of creating another. */
export function conversationIdByUser(conversations: readonly Conversation[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const conversation of conversations) {
    const other = conversation.participants[0];
    if (other && !map.has(other.id)) map.set(other.id, conversation.id);
  }
  return map;
}
