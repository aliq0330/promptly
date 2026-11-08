"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "@/components/icons/bell";
import { ChevronRight } from "@/components/icons/chevron-right";
import { Info } from "@/components/icons/info";
import { Plus } from "@/components/icons/plus";
import { Settings } from "@/components/icons/settings";
import { Users } from "@/components/icons/users";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { CommunityCover } from "@/features/communities/community-cover";
import { DropdownMenu } from "@/features/communities/dropdown-menu";
import { VisibilityLabel } from "@/features/communities/visibility-label";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { OnlineCountText } from "@/features/presence/presence-ui";
import { useCommunityPresenceCount } from "@/features/presence/community-presence";
import { can } from "@/lib/chat-groups";
import { communityHref } from "@/lib/communities";
import { groupRoomsBySection, pickRoom, readLastRoomId } from "@/lib/community-rooms";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchConversationForUser } from "@/lib/supabase/messages";
import { roomHref } from "@/lib/utils";
import type { Conversation } from "@/types";
import { useRealMessages } from "../real-messages-provider";
import { RoomFormModal } from "./room-form-modal";
import { RoomRow } from "./room-row";
import { useCommunityRooms } from "./use-community-rooms";

const ACTION_CARD =
  "flex h-[76px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-border-soft bg-surface text-small font-semibold text-text transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * Topluluk sohbet merkezi (docs/history/352-*, mockup 2): topluluğun bandı + Üyeler / Bilgi / Bildirim kısayolları + "Sohbet Odaları".
 * Mesajlar listesindeki satırın oku ve oda sohbetinin başlığı buraya gelir; topluluk sayfası (akış, etkinlik, kurallar) ayrı kalır.
 */
export function RoomsHub({ communityId }: { communityId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { getCached } = useRealMessages();
  const [conversation, setConversation] = useState<Conversation | null>(() => getCached(communityId) ?? null);
  const [loaded, setLoaded] = useState(Boolean(getCached(communityId)));
  const { rooms, loading, error, reload } = useCommunityRooms(communityId);
  const [formOpen, setFormOpen] = useState(false);
  const online = useCommunityPresenceCount(communityId);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchConversationForUser(communityId, user.id).then((found) => {
      if (cancelled) return;
      if (found) setConversation(found);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [communityId, user]);

  const group = conversation?.kind === "group" ? conversation.group : null;
  const sections = useMemo(() => groupRoomsBySection(rooms, t("rooms.sectionDefault")), [rooms, t]);
  const current = useMemo(() => pickRoom(rooms, null, readLastRoomId(communityId)), [rooms, communityId]);
  const canManage = group ? can(group.myRole, "manage_rooms", group.rolePermissions) : false;
  const pageHref = communityHref(communityId);

  const shell = "fixed inset-x-0 top-0 z-10 flex flex-col bg-background bottom-0 md:static md:inset-auto md:z-auto md:h-full md:min-h-0 md:flex-1";

  if (loaded && !group) {
    return (
      <div className={shell}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-body text-text-secondary">{t("rooms.hub.notFound")}</p>
          <Link href="/messages" className="text-small font-semibold text-primary hover:underline">{t("messages.backToListAriaLabel")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={shell} data-rooms-hub>
      <div className="flex items-center justify-between gap-2 px-3 py-2 max-md:pt-[calc(0.5rem+env(safe-area-inset-top))] md:px-4">
        <Link
          href="/messages"
          aria-label={t("messages.backToListAriaLabel")}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border-soft bg-surface text-text transition-colors hover:border-border-strong md:invisible"
        >
          <ArrowLeft size={20} aria-hidden />
        </Link>
        {group && (
          <DropdownMenu
            label={t("rooms.hub.menuAria")}
            triggerClassName="flex h-11 w-11 items-center justify-center rounded-full border border-border-soft bg-surface text-text transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {(close) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    router.push(`/messages/local?id=${communityId}&panel=about`);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-text hover:bg-surface-soft"
                >
                  <Info size={15} aria-hidden /> {t("rooms.hub.menu.info")}
                </button>
                {canManage && (
                  <Link href={communityHref(communityId, "manage", "rooms")} onClick={close} role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-text hover:bg-surface-soft">
                    <Settings size={15} aria-hidden /> {t("rooms.hub.menu.manage")}
                  </Link>
                )}
              </>
            )}
          </DropdownMenu>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-3 pb-10">
          {group ? (
            <>
              <div className="relative">
                <CommunityCover coverUrl={group.coverUrl} coverColor={group.coverColor} avatarUrl={group.avatarUrl} className="rounded-2xl" />
                <div className="absolute -bottom-9 left-4 rounded-full border-4 border-background bg-background">
                  <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={72} />
                </div>
              </div>
              <h1 className="mt-11 px-1 font-display text-h2 font-bold tracking-[-0.01em] text-text">{group.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-small text-text-secondary">
                <span>{memberCountText(t, group.memberCount)}</span>
                <span aria-hidden>·</span>
                <VisibilityLabel visibility={group.visibility} className="flex items-center gap-1 text-small text-text-secondary" />
                {online ? (
                  <>
                    <span aria-hidden>·</span>
                    <OnlineCountText count={online} />
                  </>
                ) : null}
              </div>
              {group.description && <p className="mt-2 line-clamp-2 px-1 text-small leading-relaxed text-text-secondary">{group.description}</p>}

              <div className="mt-4 flex gap-2.5">
                <Link href={communityHref(communityId, "members")} className={ACTION_CARD} data-hub-action="members">
                  <Users size={22} aria-hidden /> {t("rooms.hub.members")}
                </Link>
                <Link href={`/messages/local?id=${communityId}&panel=about`} className={ACTION_CARD} data-hub-action="info">
                  <Info size={22} aria-hidden /> {t("rooms.hub.info")}
                </Link>
                <Link href={communityHref(communityId, "about")} className={ACTION_CARD} data-hub-action="notifications">
                  <Bell size={22} aria-hidden /> {t("rooms.hub.notifications")}
                </Link>
              </div>

              <Link href={pageHref} data-hub-page-link className="mt-2 flex items-center gap-2 rounded-lg px-1 py-2.5 text-small font-semibold text-primary hover:underline">
                <span className="min-w-0 flex-1 truncate">
                  {t("rooms.hub.communityPage")} <span className="font-normal text-text-muted">· {t("rooms.hub.communityPageHint")}</span>
                </span>
                <ChevronRight size={18} aria-hidden />
              </Link>
            </>
          ) : (
            <div className="h-44 animate-pulse rounded-2xl bg-surface-soft" aria-hidden />
          )}

          <div className="mt-3 flex items-center justify-between px-1">
            <h2 className="font-display text-h3 font-bold text-text">{t("rooms.hub.heading")}</h2>
            {canManage && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                data-hub-add-room
                className="flex min-h-11 items-center gap-1 rounded-full px-2 text-small font-bold text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Plus size={18} strokeWidth={2.4} aria-hidden /> {t("rooms.hub.addRoom")}
              </button>
            )}
          </div>

          {loading && rooms.length === 0 ? (
            <div className="mt-2 space-y-2" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-soft" />
              ))}
            </div>
          ) : error && rooms.length === 0 ? (
            <div role="alert" className="mt-3 flex flex-col items-start gap-2 rounded-lg bg-danger/10 px-3 py-3 text-small text-danger">
              {t("rooms.hub.loadFailed")}
              <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>{t("common.retry")}</Button>
            </div>
          ) : sections.length === 0 ? (
            <p className="mt-3 px-1 text-small text-text-muted">{t("rooms.hub.noRooms")}</p>
          ) : (
            <div className="mt-1 space-y-3">
              {sections.map((section) => (
                <section key={section.key || "default"} aria-label={section.label}>
                  <h3 className="mb-1 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">{section.label}</h3>
                  <div className="space-y-0.5">
                    {section.rooms.map((room) => (
                      <RoomRow key={room.id} room={room} current={room.id === current?.id} href={roomHref(communityId, room.id)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {formOpen && <RoomFormModal communityId={communityId} rooms={rooms} onClose={() => setFormOpen(false)} onSaved={(roomId) => roomId && router.push(roomHref(communityId, roomId))} />}
    </div>
  );
}
