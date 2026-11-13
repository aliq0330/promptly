"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Lock } from "@/components/icons/lock";
import { Search } from "@/components/icons/search";
import { Users } from "@/components/icons/users";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/features/auth/auth-provider";
import { ListControlRow } from "@/features/content/list-control-row";
import type { SectionMenuItem } from "@/features/content/section-menu";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { MuteCard } from "@/features/teams/mute-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { can } from "@/lib/chat-groups";
import { pickRoom, readLastRoomId } from "@/lib/community-rooms";
import { memberCountText } from "@/lib/group-labels";
import { matchesHubFilter, matchesHubQuery, pinnedFirst, type HubFilter } from "@/lib/messages-hub";
import { deleteCommunityRoom, fetchMyRoomPins, markRoomReadUpTo, setRoomMuted, setRoomPinned } from "@/lib/supabase/community-rooms";
import { setChatGroupMuted } from "@/lib/supabase/chat-groups";
import { markConversationReadUpTo } from "@/lib/supabase/chat-features";
import { communityHubHref } from "@/lib/team-chat";
import { roomHref } from "@/lib/utils";
import { HubAddButton, HubBody, HubEmptyNote, HubFrame, HubHeader, HubRow, HubSection, HubTopLink } from "./hub-parts";
import { useHubSelection, type HubBulkActions } from "./hub-selection";
import { useRealMessages } from "./real-messages-provider";
import { RoomFormModal } from "./rooms/room-form-modal";
import { RoomIconTile } from "./rooms/room-icon";
import { patchCachedRoom, refreshCommunityRooms, useCommunityRooms } from "./rooms/use-community-rooms";

const TAG_CLASS = "shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-text-muted";

/**
 * Mesajlar'dan açılan TOPLULUK oda listesi (docs/history/369-*, 381-*): topluluğun odaları sohbet listesinin YERİNE açılır (bilgisayarda sol sütun, telefonda sayfa)
 * ve ekip kanal listesiyle AYNI iskelette, aynı davranışla çalışır: arama, ⋮ menüsü, seçim modu (Sabitle · Okundu · Sessize al · Sil). Oda ekleme/düzenleme mevcut
 * pencerelerdir (`RoomFormModal`); yetki sunucuda yeniden denetlenir (`manage_rooms`, silme yalnız sahip).
 */
export function CommunityHubView({ communityId, embedded = false }: { communityId: string; embedded?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { conversations, patchConversation } = useRealMessages();
  const conversation = conversations.find((entry) => entry.id === communityId);
  const group = conversation?.group ?? null;
  const roomsState = useCommunityRooms(communityId);
  const [formOpen, setFormOpen] = useState(false);
  const [pins, setPins] = useState<Map<string, string>>(() => new Map());
  const [muteBusy, setMuteBusy] = useState(false);
  const [muteError, setMuteError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HubFilter>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMyRoomPins(communityId).then((next) => !cancelled && setPins(next));
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  const rooms = useMemo(() => roomsState.rooms.filter((room) => !room.archivedAt), [roomsState.rooms]);
  // Sağ bölmede açık oda (bilgisayarda satır vurgulanır): adresteki oda, yoksa son açılan/varsayılan — sohbet ekranıyla aynı seçim.
  const openRoomId = embedded ? (pickRoom(roomsState.rooms, searchParams.get("room"), readLastRoomId(communityId))?.id ?? null) : null;
  const filterItems: SectionMenuItem<HubFilter>[] = [
    { key: "all", label: t("th.filter.rooms") },
    { key: "unread", label: t("th.filter.unread") },
    { key: "muted", label: t("th.filter.muted") },
  ];

  const rows = pinnedFirst(
    rooms.map((room) => ({ room, unread: room.muted ? 0 : room.unreadCount, muted: room.muted, text: room.description ?? "" })),
    (row) => pins.has(row.room.id),
  ).filter((row) => matchesHubFilter(filter, row) && matchesHubQuery(query, row.room.name, row.text));
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);

  const isOwner = group?.myRole === "owner";
  const canManageRooms = group ? can(group.myRole, "manage_rooms", group.rolePermissions) : false;
  const mutedAt = conversation?.mutedAt ?? null;

  const actions: HubBulkActions = {
    keys: rows.map((row) => row.room.id),
    unreadKeys: rows.filter((row) => row.unread > 0).map((row) => row.room.id),
    isPinned: (key) => pins.has(key),
    isMuted: (key) => roomById.get(key)?.muted ?? false,
    canRemove: (key) => Boolean(isOwner && roomById.get(key) && !roomById.get(key)?.isDefault),
    pin: async (key, pinned) => {
      await setRoomPinned(key, pinned);
      setPins((prev) => {
        const next = new Map(prev);
        if (pinned) next.set(key, new Date().toISOString());
        else next.delete(key);
        return next;
      });
    },
    read: async (key) => {
      const room = roomById.get(key);
      if (!room || !room.lastMessageAt) return;
      // Varsayılan oda (Genel) üyelik imlecini, diğer odalar kendi imleçlerini kullanır.
      const ok = room.isDefault ? Boolean(await markConversationReadUpTo(communityId, room.lastMessageAt)) : await markRoomReadUpTo(room.id, room.lastMessageAt);
      if (!ok) throw new Error("mark_read_failed");
      patchCachedRoom(communityId, room.id, { unreadCount: 0 });
    },
    mute: async (key, muted) => {
      await setRoomMuted(key, muted);
      patchCachedRoom(communityId, key, { muted });
    },
    remove: isOwner
      ? async (key) => {
          await deleteCommunityRoom(key);
          await refreshCommunityRooms(communityId);
          if (openRoomId === key) router.replace(communityHubHref(communityId));
        }
      : undefined,
  };
  const selection = useHubSelection(actions, { word: () => "room", deleteBody: t("rooms.manage.deleteBody") });

  if (conversations.length > 0 && !group) return <EmptyState icon={Users} title={t("th.community.notFound")} />;

  async function toggleCommunityMute(next: boolean) {
    if (!user || muteBusy) return;
    setMuteBusy(true);
    setMuteError(null);
    try {
      const nextMutedAt = await setChatGroupMuted(communityId, user.id, next);
      patchConversation(communityId, { mutedAt: nextMutedAt });
    } catch (err) {
      console.error("setChatGroupMuted", err);
      setMuteError(t("messages.stateUpdateFailed"));
    } finally {
      setMuteBusy(false);
    }
  }

  const searchShown = searchOpen || query.trim() !== "";
  return (
    <HubFrame kind="community" embedded={embedded}>
      {selection.selecting ? (
        <div className="px-4 pt-3">{selection.header(embedded)}</div>
      ) : (
        <>
          <HubHeader
            backHref="/messages"
            backLabel={t("header.messagesAriaLabel")}
            topRight={
              group && (
                <HubTopLink href={`/communities/local?id=${communityId}`} label={t("th.community.page")} dataAttr="data-hub-community-page">
                  <ArrowUpRight size={20} aria-hidden />
                </HubTopLink>
              )
            }
            media={group ? <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={56} /> : <span className="h-14 w-14 rounded-[18px] bg-surface-soft" aria-hidden />}
            title={group?.name ?? "…"}
            meta={group ? t("th.community.meta", { members: memberCountText(t, group.memberCount) }) : ""}
            muteCard={group && <MuteCard compact scope="community" muted={Boolean(mutedAt)} busy={muteBusy} error={muteError} onToggle={(next) => void toggleCommunityMute(next)} />}
          />
          <div className="mb-3 px-4">
            <ListControlRow
              menu={{ items: filterItems, active: filter, onChange: setFilter, ariaLabel: t("th.filter.aria"), title: t("th.community.rooms") }}
              search={{ open: searchShown, onToggle: () => (searchShown ? (setQuery(""), setSearchOpen(false)) : setSearchOpen(true)), label: t("th.search.rooms") }}
              trailing={
                <>
                  {selection.moreMenu}
                  {canManageRooms && <HubAddButton onClick={() => setFormOpen(true)} label={t("th.community.addRoom")} dataAttr="data-hub-add-room" />}
                </>
              }
            />
          </div>
          {searchShown && (
            <label className="relative mb-3 block px-4">
              <span className="sr-only">{t("th.search.rooms")}</span>
              <Search size={16} className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("th.search.rooms")}
                autoFocus
                data-hub-search
                className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </label>
          )}
        </>
      )}
      {selection.error && (
        <p role="alert" className="mx-4 mb-3 rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {selection.error}
        </p>
      )}
      <HubBody embedded={embedded} selecting={selection.selecting}>
        <HubSection title={t("th.community.rooms")} testId="hub-rooms">
          {roomsState.loading && rooms.length === 0 && <p className="px-4 py-6 text-small text-text-muted">{t("common.loading")}</p>}
          {!roomsState.loading && rooms.length === 0 && <p className="px-4 py-6 text-small text-text-muted">{t("th.community.noRooms")}</p>}
          {rows.map(({ room, unread }) => {
            const readOnly = !room.isDefault && room.postingPolicy === "admins" && !room.canPost;
            return (
              <HubRow
                key={room.id}
                testKey={room.name}
                href={roomHref(communityId, room.id)}
                tile={<RoomIconTile icon={room.icon} size={44} />}
                title={room.name}
                tags={room.isDefault ? <span className={TAG_CLASS}>{t("th.default")}</span> : undefined}
                muteScope={room.muted ? "channel" : null}
                at={room.lastMessageAt}
                subtitle={room.description ?? ""}
                unread={unread}
                pinned={pins.has(room.id)}
                active={openRoomId === room.id}
                trailing={room.readPolicy === "staff" || readOnly ? <Lock size={14} className="shrink-0 text-text-muted" aria-hidden /> : undefined}
                selection={selection.rowSelection(room.id)}
              />
            );
          })}
        </HubSection>
        {!roomsState.loading && rooms.length > 0 && rows.length === 0 && <HubEmptyNote>{t("th.filter.empty")}</HubEmptyNote>}
        {selection.selecting && embedded && selection.bar(true)}
      </HubBody>
      {selection.selecting && !embedded && selection.bar(false)}
      {selection.dialogs}
      {formOpen && <RoomFormModal communityId={communityId} rooms={roomsState.rooms} onClose={() => setFormOpen(false)} onSaved={() => void roomsState.reload()} />}
    </HubFrame>
  );
}
