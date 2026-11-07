"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "@/components/icons/plus";
import { Search } from "@/components/icons/search";
import { buttonClassName } from "@/components/ui/button";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { groupRoomsBySection } from "@/lib/community-rooms";
import { roomsHubHref } from "@/lib/utils";
import type { CommunityRoom } from "@/types";
import { RoomRow } from "./room-row";

/**
 * Oda değiştirici (docs/history/352-*, mockup 4): alttan açılan kart — bölümlere ayrılmış odalar, okunmamış/sessiz/salt okunur/özel durumları
 * satırda; altta "Oda ekle" (yalnız yetkiliye) ve "Oda listesi" (sohbet merkezi).
 */
export function RoomSwitcher({
  communityId,
  communityName,
  rooms,
  currentRoomId,
  canManage,
  onSelect,
  onAddRoom,
  onClose,
}: {
  communityId: string;
  communityName: string;
  rooms: readonly CommunityRoom[];
  currentRoomId: string | null;
  canManage: boolean;
  onSelect: (room: CommunityRoom) => void;
  onAddRoom: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("tr");
  const visible = useMemo(
    () => rooms.filter((room) => !room.archivedAt && (!normalized || `${room.name} ${room.description ?? ""}`.toLocaleLowerCase("tr").includes(normalized))),
    [rooms, normalized],
  );
  const sections = useMemo(() => groupRoomsBySection(visible, t("rooms.sectionDefault")), [visible, t]);
  const activeTotal = rooms.filter((room) => !room.archivedAt).length;

  return (
    <SpaceDialog
      title={t("rooms.switcher.title")}
      onClose={onClose}
      footer={
        <>
          {canManage && (
            <button type="button" onClick={onAddRoom} className={buttonClassName({ variant: "outline", className: "flex-1" })}>
              <Plus size={18} aria-hidden />
              {t("rooms.switcher.addRoom")}
            </button>
          )}
          <Link href={roomsHubHref(communityId)} onClick={onClose} className={buttonClassName({ variant: "primary", className: "flex-1" })}>
            {t("rooms.switcher.openHub")}
          </Link>
        </>
      }
    >
      <p className="-mt-1 mb-3 text-small text-text-secondary">{t("rooms.switcher.subtitle", { community: communityName, count: activeTotal })}</p>
      <label className="relative mb-3 block">
        <span className="sr-only">{t("rooms.switcher.search")}</span>
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("rooms.switcher.search")}
          className="h-11 w-full rounded-full bg-surface-soft pl-10 pr-4 text-body text-text outline-none placeholder:text-text-muted focus:ring-2 focus:ring-primary/30"
        />
      </label>
      {sections.length === 0 ? (
        <p className="py-8 text-center text-small text-text-muted">{t("rooms.switcher.noMatch")}</p>
      ) : (
        <div className="space-y-3 pb-1">
          {sections.map((group) => (
            <section key={group.key || "default"} aria-label={group.label}>
              <h3 className="mb-1 px-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">{group.label}</h3>
              <div className="space-y-0.5">
                {group.rooms.map((room) => (
                  <RoomRow key={room.id} room={room} current={room.id === currentRoomId} onSelect={onSelect} density="compact" />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </SpaceDialog>
  );
}
