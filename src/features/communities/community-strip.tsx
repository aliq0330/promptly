"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CountBadge } from "@/components/ui/badge";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useCommunityRooms } from "@/features/messages/rooms/use-community-rooms";
import { communityRoomHref, formatEventDateTime } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchCommunityEvents, type CommunityEvent } from "@/lib/supabase/communities";
import type { CommunityRoom } from "@/types";
import type { CommunityTabProps } from "./community-page";

/** Şeritte en çok bu kadar oda gösterilir (+ 1 etkinlik kartı). */
const ROOM_LIMIT = 3;

const CARD_CLASS = "block min-w-0 rounded-md card-flat px-4 py-3 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/**
 * «Odalar ve etkinlik» şeridi (docs/history/475-*): Akış sekmesinin hemen altında tek satır — ilk odalar (okunmamış sayısıyla, dokununca
 * Mesajlar'daki odayı açar) ve en yakın etkinlik. Telefonda yatay kayar, tablet ve masaüstünde eşit genişlikte dört kart. Odalar yalnız üyeye
 * görünür (sohbet üyelik ister); hiçbiri yoksa HİÇBİR ŞEY çizilmez. Sohbetin kendisi ikinci bir arayüz değildir: kartlar Mesajlar'a bağlanır.
 */
export function CommunityStrip({ group, role, viewerId, goTab }: Pick<CommunityTabProps, "group" | "role" | "viewerId" | "goTab">) {
  const { t, language } = useTranslation();
  const { rooms } = useCommunityRooms(role ? group.id : null, { live: false });
  const [next, setNext] = useState<CommunityEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCommunityEvents(group.id, role ? viewerId : null, "upcoming")
      .then((list) => {
        if (!cancelled) setNext(list.find((event) => event.status === "scheduled") ?? null);
      })
      .catch((err) => {
        console.error("community strip events", err);
        if (!cancelled) setNext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [group.id, role, viewerId]);

  const shown = role ? pickRooms(rooms) : [];
  if (shown.length === 0 && !next) return null;

  return (
    <section aria-label={t("communities.strip.label")} data-testid="community-strip" className="space-y-2">
      <h2 className="text-label font-semibold text-text-muted">{t("communities.strip.label")}</h2>
      <ScrollRow as="ul" className="gap-3 md:grid md:grid-cols-4 md:overflow-visible">
        {shown.map((room) => (
          <li key={room.id} className="w-36 shrink-0 md:w-auto">
            <Link href={communityRoomHref(group.id, room.id)} data-strip-room={room.id} className={CARD_CLASS}>
              <span className="flex items-center gap-1.5 text-small font-semibold text-text">
                <span className="truncate"># {room.name}</span>
                {room.unreadCount > 0 && !room.muted && (
                  <CountBadge tone="primary" aria-hidden className="hidden md:inline-grid">
                    {room.unreadCount}
                  </CountBadge>
                )}
              </span>
              <span className="block truncate text-caption text-text-muted">
                <span className="md:hidden">{room.muted ? t("communities.strip.muted") : room.unreadCount > 0 ? t("communities.strip.unread", { count: room.unreadCount }) : t("communities.strip.openChat")}</span>
                <span className="hidden md:inline">{t("communities.strip.openChat")}</span>
              </span>
            </Link>
          </li>
        ))}
        {next && (
          <li className="w-44 shrink-0 md:w-auto">
            <button type="button" data-feed-next-event onClick={() => goTab("events")} className={`${CARD_CLASS} w-full`}>
              <span className="block truncate text-small font-semibold text-text">{formatEventDateTime(next.startsAt, next.timezone, language)}</span>
              <span className="block truncate text-caption text-text-muted">{t("communities.strip.eventMeta", { title: next.title, count: next.goingCount })}</span>
            </button>
          </li>
        )}
      </ScrollRow>
    </section>
  );
}

/** Varsayılan oda (Genel) başta, sonra konum sırasıyla; arşivdekiler hariç. */
function pickRooms(rooms: CommunityRoom[]): CommunityRoom[] {
  return rooms
    .filter((room) => !room.archivedAt)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.position - b.position)
    .slice(0, ROOM_LIMIT);
}
