"use client";

import { useCommunityRooms } from "@/features/messages/rooms/use-community-rooms";
import { activeRooms } from "@/lib/community-rooms";

/** Etkin oda sayısı (silme onayı listesi). */
export function useRoomsCount(communityId: string): number {
  const { rooms } = useCommunityRooms(communityId, { live: false });
  return activeRooms(rooms).length;
}
