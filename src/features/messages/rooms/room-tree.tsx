"use client";

import { useSearchParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n/language-provider";
import { activeRooms, pickRoom, readLastRoomId } from "@/lib/community-rooms";
import { roomHref } from "@/lib/utils";
import { RoomRow } from "./room-row";
import { useCommunityRooms } from "./use-community-rooms";

/**
 * Masaüstü/tablet sol panelinde bir topluluğun oda ağacı (docs/history/352-*, mockup 7): satırın altında girintili odalar; odaya dokunmak
 * sohbeti o odada açar. Yalnız genişletilmiş topluluk için yüklenir (`enabled`), canlı güncelleme de yalnız o zaman açıktır.
 */
export function RoomTree({ communityId, isActiveConversation }: { communityId: string; isActiveConversation: boolean }) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { rooms, loading } = useCommunityRooms(communityId, { enabled: true, live: true });
  const list = activeRooms(rooms);
  const current = isActiveConversation ? pickRoom(rooms, searchParams.get("room"), readLastRoomId(communityId)) : null;
  if (loading && list.length === 0) {
    return (
      <div className="space-y-1 pb-2 pl-14 pr-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-soft" />
        ))}
      </div>
    );
  }
  return (
    <div role="group" aria-label={t("rooms.hub.heading")} data-room-tree={communityId} className="space-y-0.5 pb-2 pl-12 pr-3">
      {list.map((room) => (
        <RoomRow key={room.id} room={room} current={room.id === current?.id} href={roomHref(communityId, room.id)} density="compact" />
      ))}
    </div>
  );
}
