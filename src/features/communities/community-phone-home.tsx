"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays } from "@/components/icons/calendar-days";
import { Check } from "@/components/icons/check";
import { Hash } from "@/components/icons/hash";
import { Heart } from "@/components/icons/heart";
import { Info } from "@/components/icons/info";
import { List } from "@/components/icons/list";
import { MessageCircle } from "@/components/icons/message-circle";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Settings } from "@/components/icons/settings";
import { Shapes } from "@/components/icons/shapes";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Users } from "@/components/icons/users";
import { Workflow } from "@/components/icons/workflow";
import { buttonClassName } from "@/components/ui/button";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { Badge } from "@/components/ui/badge";
import { PHONE_HOME_BOTTOM_PAD, PHONE_HOME_PILL_OUTLINE, PhoneHomeCard, PhoneHomeIdentity, PhoneHomeRow, PhoneHomeSection, PhoneTileGrid } from "@/features/content/phone-home";
import type { PhoneSectionItem } from "@/features/content/phone-sections";
import { VisibilityLabel } from "./visibility-label";
import { communityChatHref, communityHref, eventDateParts, formatEventDateTime, postPageHref, CATEGORY_LABEL_KEYS, type CommunityTab } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchCommunityRooms } from "@/lib/supabase/community-rooms";
import {
  fetchCommunityCard,
  fetchCommunityEvents,
  fetchCommunityPosts,
  fetchMyUnseenCounts,
  setEventRsvp,
  type CommunityEvent,
  type CommunityPost,
} from "@/lib/supabase/communities";
import { cn, formatRelativeTime, formatUnread } from "@/lib/utils";
import type { ChatGroup, GroupRole } from "@/types";

const TAB_ICON: Record<CommunityTab, PhoneSectionItem["icon"]> = { feed: List, events: CalendarDays, members: Users, about: Info, manage: Settings };
const POST_ICON = { prompt: SquareTerminal, request: Sparkles, workflow: Workflow, preset: SlidersHorizontal, space: Shapes } as const;

function postTitle(post: CommunityPost, fallback: string): string {
  const title = post.content?.data && "title" in post.content.data ? String(post.content.data.title ?? "") : "";
  return title || post.note?.split("\n")[0] || fallback;
}

/**
 * Topluluk sayfasının telefon KÖK ekranı (docs/history/358-*): Ekip ana ekranıyla AYNI iskelet (`phone-home.tsx`) — kimlik bloğu, 2×3 bölüm karoları
 * (sayı + yeni/bekleyen rozeti), "Yaklaşan etkinlik" ve "Son gönderiler" önizlemesi. Önizleme yalnız bölüme erişimi olana çizilir (`tabs` = `accessibleTabs`).
 */
export function CommunityPhoneHome({
  group: g,
  role,
  viewerId,
  tabs,
  unread,
  join,
  gate,
  onToast,
}: {
  group: ChatGroup;
  role: GroupRole | null;
  viewerId: string | null;
  tabs: { key: CommunityTab; label: string; count?: number }[];
  unread: number;
  /** `CommunityJoinButton` (sayfa kurar: üyelik durumu orada). */
  join: ReactNode;
  /** Üye olmayana davet/başvuru geçidi (kompakt). */
  gate?: ReactNode;
  onToast: (message: string) => void;
}) {
  const { t, language } = useTranslation();
  const has = (tab: CommunityTab) => tabs.some((item) => item.key === tab);
  const [postCount, setPostCount] = useState<number | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [roomCount, setRoomCount] = useState<number | null>(null);
  const [event, setEvent] = useState<CommunityEvent | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (has("feed")) {
      void fetchCommunityCard(g.id).then((card) => !cancelled && setPostCount(card?.postCount ?? null), () => undefined);
      void fetchCommunityPosts(g.id, null).then((page) => !cancelled && setPosts(page.posts.slice(0, 2)), () => undefined);
      if (role) void fetchMyUnseenCounts().then((map) => !cancelled && setUnseen(map.get(g.id) ?? 0), () => undefined);
    }
    if (has("events")) {
      void fetchCommunityEvents(g.id, viewerId, "upcoming", 3).then(
        (list) => !cancelled && setEvent(list.find((item) => item.status === "scheduled") ?? null),
        () => undefined,
      );
    }
    if (role) {
      void fetchCommunityRooms(g.id).then((rooms) => !cancelled && setRoomCount(rooms.filter((room) => !room.archivedAt).length), () => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tabs` her çizimde yeni dizi; erişim `role`/topluluk değişince değişir.
  }, [g.id, role, viewerId, tabs.length]);

  const subFor = (key: CommunityTab): string | undefined => {
    switch (key) {
      case "feed":
        return postCount === null ? undefined : t("communities.home.sub.feed", { count: postCount });
      case "events":
        return event ? t("communities.home.sub.events", { count: 1 }) : t("communities.home.sub.eventsNone");
      case "members":
        return t("communities.home.sub.members", { count: g.memberCount });
      case "about":
        return t("communities.home.sub.about");
      default:
        return t("communities.home.sub.manage");
    }
  };
  const tiles: PhoneSectionItem[] = tabs.map((item) => ({
    key: item.key,
    label: item.label,
    href: communityHref(g.id, item.key),
    icon: TAB_ICON[item.key],
    sub: subFor(item.key),
    badge: item.key === "feed" ? unseen || undefined : item.count,
  }));
  // Odalar sohbetin içindedir (Genel + diğer odalar çip satırı): karo sohbeti açar. Yalnız üyeye.
  if (role && roomCount !== null && roomCount > 0) {
    const at = tiles.findIndex((tile) => tile.key === "about");
    tiles.splice(at < 0 ? tiles.length : at, 0, { key: "rooms", label: t("communities.home.rooms"), href: communityChatHref(g.id), icon: Hash, sub: t("communities.home.sub.rooms", { count: roomCount }) });
  }

  async function rsvp() {
    if (!event) return;
    try {
      await setEventRsvp(event.id, "going");
      setEvent({ ...event, myRsvp: "going", goingCount: event.goingCount + 1 });
      onToast(t("communities.events.rsvpSavedToast"));
    } catch (error) {
      onToast(error instanceof Error ? error.message : t("communities.page.loadError"));
    }
  }

  const categoryLabel = t(CATEGORY_LABEL_KEYS[g.category]);
  const chatLink = role ? (
    <Link href={communityChatHref(g.id)} data-open-chat className={buttonClassName({ variant: "primary", className: "h-11 min-w-0 flex-1 gap-2" })}>
      <MessagesSquare size={18} aria-hidden />
      <span className="truncate">{t("communities.detail.openChat")}</span>
      {unread > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-caption font-bold text-primary">{formatUnread(unread)}</span>}
    </Link>
  ) : null;

  return (
    <div className={cn("px-3 pt-2 md:hidden", PHONE_HOME_BOTTOM_PAD)} data-testid="community-header-compact" data-community-phone-home>
      <PhoneHomeIdentity
        backHref="/communities"
        backLabel={t("communities.page.title")}
        mark={<GroupAvatar name={g.name} avatarUrl={g.avatarUrl} size={56} className="[&>span:first-child]:rounded-2xl" />}
        eyebrow={`${t("groups.page.eyebrow")} · ${categoryLabel}`}
        title={g.name}
        meta={
          <>
            <span>{memberCountText(t, g.memberCount)}</span>
            <span aria-hidden>·</span>
            <VisibilityLabel visibility={g.visibility} />
            {role && <RoleBadge role={role} />}
            {g.closedAt && <Badge variant="warning">{t("communities.closedBadge")}</Badge>}
          </>
        }
        primary={chatLink ?? <div className="min-w-0 flex-1 [&>*]:w-full">{join}</div>}
        secondary={chatLink ? <div className="shrink-0">{join}</div> : undefined}
      />
      {gate && <div className="mt-3">{gate}</div>}
      <PhoneTileGrid items={tiles} ariaLabel={t("communities.detail.tabsAria")} className="mt-3" />

      {event && (
        <PhoneHomeSection title={t("communities.home.upcoming")} href={communityHref(g.id, "events")} linkLabel={t("communities.home.all")} testId="community-phone-event">
          <PhoneHomeCard>
            <PhoneHomeRow
              thumb={
                <span className="text-center leading-none">
                  <span className="block text-[0.65rem] font-bold uppercase tracking-wide">{eventDateParts(event.startsAt, event.timezone, language).month}</span>
                  <span className="block font-display text-h3 font-bold">{eventDateParts(event.startsAt, event.timezone, language).day}</span>
                </span>
              }
              title={event.title}
              sub={`${formatEventDateTime(event.startsAt, event.timezone, language)}${event.goingCount > 0 ? ` · ${t("communities.home.goingCount", { count: event.goingCount })}` : ""}`}
              href={communityHref(g.id, "events")}
              action={
                role ? (
                  event.myRsvp === "going" ? (
                    <span className={cn(PHONE_HOME_PILL_OUTLINE, "gap-1 text-primary")} data-event-going>
                      <Check size={14} aria-hidden />
                      {t("communities.events.going")}
                    </span>
                  ) : (
                    <button type="button" onClick={() => void rsvp()} className={PHONE_HOME_PILL_OUTLINE} data-event-join>
                      {t("communities.home.join")}
                    </button>
                  )
                ) : undefined
              }
            />
          </PhoneHomeCard>
        </PhoneHomeSection>
      )}

      {posts.length > 0 && (
        <PhoneHomeSection title={t("communities.home.recentPosts")} href={communityHref(g.id, "feed")} linkLabel={t("communities.home.openFeed")} testId="community-phone-posts">
          <PhoneHomeCard>
            {posts.map((post) => {
              const Icon = post.content ? POST_ICON[post.content.type] : MessageCircle;
              return (
                <PhoneHomeRow
                  key={post.id}
                  thumb={<Icon size={20} aria-hidden />}
                  title={postTitle(post, t("communities.home.untitledPost"))}
                  sub={
                    <span className="inline-flex max-w-full items-center gap-1.5">
                      <span className="truncate">{[post.author?.displayName || post.author?.username, formatRelativeTime(post.createdAt, language)].filter(Boolean).join(" · ")}</span>
                      <span className="inline-flex shrink-0 items-center gap-0.5">
                        <Heart size={11} aria-hidden />
                        {post.likeCount}
                      </span>
                      <span className="shrink-0">{t("communities.home.comments", { count: post.commentCount })}</span>
                    </span>
                  }
                  href={postPageHref(post.id)}
                />
              );
            })}
          </PhoneHomeCard>
        </PhoneHomeSection>
      )}
    </div>
  );
}
