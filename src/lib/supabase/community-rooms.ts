import { supabase } from "./client";
import { callRpc } from "./chat-groups";
import type { CommunityRoom, CommunityRoomIcon } from "@/types";

/**
 * Topluluk sohbet odaları veri erişimi (docs/history/352-*). Her yazma bir SECURITY DEFINER RPC'dir (kimlik auth.uid()'den, yetki
 * `manage_rooms` yeteneği); burası yalnızca çağırır ve sunucunun makine kodlarını çevrilmiş `GroupActionError`'a dönüştürür.
 */

interface RoomOverviewRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  section: string | null;
  position: number;
  posting_policy: string;
  read_policy: string;
  is_default: boolean;
  archived_at: string | null;
  muted: boolean;
  unread_count: number | null;
  last_message_at: string | null;
  can_post: boolean;
}

const ICONS: readonly string[] = ["message", "prompt", "image", "megaphone", "sparkles", "help", "shield", "palette"];

export function mapRoomRow(row: RoomOverviewRow): CommunityRoom {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: (ICONS.includes(row.icon) ? row.icon : "message") as CommunityRoomIcon,
    section: row.section,
    position: row.position,
    postingPolicy: row.posting_policy === "admins" ? "admins" : "members",
    readPolicy: row.read_policy === "staff" ? "staff" : "all",
    isDefault: row.is_default,
    archivedAt: row.archived_at,
    muted: row.muted === true,
    unreadCount: Number(row.unread_count ?? 0),
    lastMessageAt: row.last_message_at,
    canPost: row.can_post === true,
  };
}

/** Bir topluluğun odaları + kişisel durumum + okunmamış sayıları. Üye değilsem ya da migration yoksa boş liste. */
export async function fetchCommunityRooms(communityId: string): Promise<CommunityRoom[]> {
  const { data, error } = await supabase.rpc("community_rooms_overview", { p_community_id: communityId });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as RoomOverviewRow[]).map(mapRoomRow) : [];
}

export interface RoomInput {
  name: string;
  description?: string | null;
  icon?: CommunityRoomIcon;
  section?: string | null;
  postingPolicy?: "members" | "admins";
  readPolicy?: "all" | "staff";
}

export async function createCommunityRoom(communityId: string, input: RoomInput): Promise<string> {
  return callRpc<string>("create_community_room", {
    p_community_id: communityId,
    p_name: input.name,
    p_description: input.description?.trim() || null,
    p_icon: input.icon ?? "message",
    p_section: input.section?.trim() || null,
    p_posting_policy: input.postingPolicy ?? "members",
    p_read_policy: input.readPolicy ?? "all",
  });
}

export async function updateCommunityRoom(roomId: string, input: Partial<RoomInput>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description?.trim() ?? "";
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.section !== undefined) patch.section = input.section?.trim() ?? "";
  if (input.postingPolicy !== undefined) patch.posting_policy = input.postingPolicy;
  if (input.readPolicy !== undefined) patch.read_policy = input.readPolicy;
  await callRpc<null>("update_community_room", { p_room_id: roomId, p_patch: patch });
}

export async function reorderCommunityRooms(communityId: string, roomIds: string[]): Promise<void> {
  await callRpc<null>("reorder_community_rooms", { p_community_id: communityId, p_room_ids: roomIds });
}

export async function archiveCommunityRoom(roomId: string, archived: boolean): Promise<void> {
  await callRpc<null>("archive_community_room", { p_room_id: roomId, p_archived: archived });
}

export async function deleteCommunityRoom(roomId: string): Promise<void> {
  await callRpc<null>("delete_community_room", { p_room_id: roomId });
}

/** Okundu imleci (yalnız Genel dışındaki odalar; Genel için `markConversationReadUpTo`). En iyi çaba: hata görüntülemeyi engellemez. */
export async function markRoomReadUpTo(roomId: string, upTo: string): Promise<boolean> {
  const { error } = await supabase.rpc("mark_room_read_up_to", { p_room_id: roomId, p_up_to: upTo });
  if (error) console.error("markRoomReadUpTo", error);
  return !error;
}

export async function setRoomMuted(roomId: string, muted: boolean): Promise<void> {
  await callRpc<null>("set_room_muted", { p_room_id: roomId, p_muted: muted });
}
