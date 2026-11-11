"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Lock } from "@/components/icons/lock";
import { Plus } from "@/components/icons/plus";
import { buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "@/components/icons/users";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useTranslation } from "@/lib/i18n/language-provider";
import { can } from "@/lib/chat-groups";
import { memberCountText } from "@/lib/group-labels";
import { cn, roomHref } from "@/lib/utils";
import { HubRow, HubSection, HubShell } from "./hub-parts";
import { RoomFormModal } from "./rooms/room-form-modal";
import { RoomIconTile } from "./rooms/room-icon";
import { useCommunityRooms } from "./rooms/use-community-rooms";
import { useRealMessages } from "./real-messages-provider";

/**
 * Mesajlar'dan açılan TOPLULUK sayfası (docs/history/369-*): topluluğun odaları ekip sayfasıyla AYNI iskelette. Oda sohbetinin üstündeki çip satırı kalktı;
 * oda değiştirmek = bu sayfaya dönmek. Oda ekleme/düzenleme mevcut pencerelerdir (`RoomFormModal`), yetki sunucuda yeniden denetlenir (`manage_rooms`).
 */
export function CommunityHubView({ communityId }: { communityId: string }) {
  const { t } = useTranslation();
  const { conversations } = useRealMessages();
  const conversation = conversations.find((entry) => entry.id === communityId);
  const group = conversation?.group ?? null;
  const roomsState = useCommunityRooms(communityId);
  const [formOpen, setFormOpen] = useState(false);
  const rooms = useMemo(() => roomsState.rooms.filter((room) => !room.archivedAt), [roomsState.rooms]);

  if (conversations.length > 0 && !group) return <EmptyState icon={Users} title={t("th.community.notFound")} />;

  const canManageRooms = group ? can(group.myRole, "manage_rooms", group.rolePermissions) : false;
  return (
    <HubShell
      kind="community"
      backHref="/messages"
      topRight={
        group && (
          <Link href={`/communities/local?id=${communityId}`} data-hub-community-page aria-label={t("th.community.page")} title={t("th.community.page")} className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowUpRight size={20} aria-hidden />
          </Link>
        )
      }
      media={group ? <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={64} /> : <span className="h-16 w-16 rounded-[20px] bg-surface-soft" aria-hidden />}
      title={group?.name ?? "…"}
      meta={group ? t("th.community.meta", { members: memberCountText(t, group.memberCount) }) : ""}
      footer={
        canManageRooms ? (
          <button type="button" onClick={() => setFormOpen(true)} data-hub-add-room className={cn(buttonClassName({ variant: "primary", size: "lg" }), "w-full")}>
            <Plus size={18} aria-hidden /> {t("th.community.addRoom")}
          </button>
        ) : undefined
      }
    >
      <HubSection title={t("th.community.rooms")} testId="hub-rooms">
        {roomsState.loading && rooms.length === 0 && <p className="px-4 py-6 text-small text-text-muted">{t("common.loading")}</p>}
        {!roomsState.loading && rooms.length === 0 && <p className="px-4 py-6 text-small text-text-muted">{t("th.community.noRooms")}</p>}
        {rooms.map((room) => {
          const readOnly = !room.isDefault && room.postingPolicy === "admins" && !room.canPost;
          return (
            <HubRow
              key={room.id}
              testKey={room.name}
              href={roomHref(communityId, room.id)}
              tile={<RoomIconTile icon={room.icon} size={44} />}
              title={room.name}
              muteScope={room.muted ? "channel" : null}
              at={room.lastMessageAt}
              subtitle={room.description ?? ""}
              unread={room.unreadCount}
              trailing={room.readPolicy === "staff" || readOnly ? <Lock size={14} className="shrink-0 text-text-muted" aria-hidden /> : undefined}
            />
          );
        })}
      </HubSection>
      {formOpen && <RoomFormModal communityId={communityId} rooms={roomsState.rooms} onClose={() => setFormOpen(false)} onSaved={() => void roomsState.reload()} />}
    </HubShell>
  );
}
