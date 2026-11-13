"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { pickRoom, readLastRoomId, rememberLastRoomId } from "@/lib/community-rooms";
import { roomHref } from "@/lib/utils";
import type { CommunityRoom } from "@/types";

/**
 * Açık oda (docs/history/352-*). Tam sayfada oda adresteki `?room=`dir (paylaşılabilir, Geri çalışır); Mesajlar panelinde (dock) adres
 * parametreleri bu sohbete ait olmadığından yerel durumdur. Hiçbiri geçerli değilse en son açılan oda, yoksa varsayılan oda.
 * Çözülen oda cihazda hatırlanır (Mesajlar listesinde satıra dokununca "son açılan odaya" gidilir).
 */
export function useActiveRoom(communityId: string | null | undefined, rooms: readonly CommunityRoom[], dock: boolean, initialDockRoomId: string | null = null): { room: CommunityRoom | null; setRoomId: (roomId: string) => void; requestedId: string | null } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dockRoomId, setDockRoomId] = useState<string | null>(initialDockRoomId);
  const requested = dock ? dockRoomId : searchParams.get("room");

  const room = useMemo(
    () => (communityId && rooms.length > 0 ? pickRoom(rooms, requested, readLastRoomId(communityId)) : null),
    [communityId, rooms, requested],
  );

  useEffect(() => {
    if (communityId && room && !room.archivedAt) rememberLastRoomId(communityId, room.id);
  }, [communityId, room]);

  const setRoomId = useCallback(
    (roomId: string) => {
      if (!communityId) return;
      if (dock) {
        setDockRoomId(roomId);
        return;
      }
      // Oda değişince sohbet adresindeki diğer parametreler (hl, panel, paylaşım) o odaya ait değildir: yalnız id + room kalır.
      if (pathname.startsWith("/messages/local")) router.replace(roomHref(communityId, roomId));
    },
    [communityId, dock, pathname, router],
  );

  return { room, setRoomId, requestedId: requested };
}
