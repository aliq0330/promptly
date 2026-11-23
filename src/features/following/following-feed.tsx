"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Clock } from "@/components/icons/clock";
import { Hash } from "@/components/icons/hash";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { Bot } from "@/components/icons/bot";
import { Shapes } from "@/components/icons/shapes";
import { UserCheck } from "@/components/icons/user-check";
import { Users } from "@/components/icons/users";
import { CircleCheck } from "@/components/icons/circle-check";
import { Avatar } from "@/components/ui/avatar";
import { CountBadge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollRow } from "@/components/ui/scroll-row";
import { LoadMore } from "@/features/feed/load-more";
import { NewPostsPill } from "@/features/feed/new-posts-pill";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ActivityEvent, ActivitySource } from "@/lib/supabase/following-activity";
import type { FeedKind } from "@/lib/supabase/feed";
import { summaryParts, summaryTotal } from "@/lib/following-feed";
import { cn } from "@/lib/utils";
import type { PromptContentType, UserProfile } from "@/types";
import { ActivityEventRow } from "./activity-event";
import { setHomeTab, useFollowFeedSettings } from "./follow-feed-store";
import { useActivitySummary, useFollowingActivity, useLastVisit } from "./use-following-activity";
import { useActorProfiles } from "./use-actor-profiles";

/**
 * Ana Sayfa → Takip Ettiklerin (docs/history/451-*): takip ettiklerinin ETKİNLİK akışı, zamana göre. Üstte "son ziyaretinden beri" özeti,
 * kaynak çipleri (Tümü · Kişiler · Etiketler · Araçlar · Spaces) ve kişiye göre daraltma; altında zaman çizelgesi (gün ayraçları, "son ziyaretin"
 * çizgisi), sonda "hepsi bu kadar". Sıra ve görünürlük veritabanında (`following_activity_page`); bu bileşen yalnız çizer. Tür ve takip edilenler
 * süzgeçleri Filtre penceresinden gelir (`FeedTabs`).
 */
export function FollowingFeed({
  kinds,
  authors,
  tags,
  tools,
  contentType,
  narrowed,
  onClearNarrowing,
}: {
  kinds: FeedKind[] | null;
  authors: string[];
  tags: string[];
  tools: string[];
  /** Ana Sayfa'nın ortak içerik türü süzgeci (docs/history/245-*). */
  contentType: PromptContentType | null;
  /** Filtre penceresinden bir daraltma seçili mi (boş sonuçta "süzgeçleri temizle" için). */
  narrowed: boolean;
  onClearNarrowing: () => void;
}) {
  const { t, language } = useTranslation();
  const [source, setSource] = useState<ActivitySource>("all");
  const [person, setPerson] = useState<string | null>(null);
  const { reload } = useFollowFeedSettings(true);
  const { lastVisit, markSeen } = useLastVisit(true);
  const summary = useActivitySummary(lastVisit, true, reload);

  const query = useMemo(
    () => ({ source, kinds, authors: person ? [person] : authors, tags, tools, contentType }),
    [source, kinds, person, authors, tags, tools, contentType],
  );
  const feed = useFollowingActivity(query, true, reload);
  const actors = useActorChips(summary?.actors ?? []);

  const counts = summary ? { posts: summary.posts, versions: summary.versions, spaces: summary.spaces, tags: summary.tags } : null;
  const total = counts ? summaryTotal(counts) : 0;
  const nothingFollowed = summary !== null && summary.following === 0 && summary.tagsFollowed === 0 && summary.toolsFollowed === 0 && summary.spacesFollowed === 0;
  const filtered = narrowed || source !== "all" || person !== null;

  const sourceChips: { key: ActivitySource; label: string; icon: typeof LayoutGrid; count?: number; hidden?: boolean }[] = [
    { key: "all", label: t("common.all"), icon: LayoutGrid, count: total || undefined },
    { key: "people", label: t("follow.source.people"), icon: Users, count: counts ? counts.posts + counts.versions || undefined : undefined },
    { key: "tags", label: t("follow.source.tags"), icon: Hash, count: counts?.tags || undefined, hidden: summary !== null && summary.tagsFollowed === 0 },
    { key: "tools", label: t("follow.source.tools"), icon: Bot, hidden: summary === null || summary.toolsFollowed === 0 },
    { key: "spaces", label: t("follow.source.spaces"), icon: Shapes, count: counts?.spaces || undefined, hidden: summary !== null && summary.spacesFollowed === 0 },
  ];

  return (
    <section className="space-y-5" aria-label={t("follow.ariaLabel")} data-following-feed="">
      <NewPostsPill count={feed.newCount} plus={feed.newCount >= 20} onClick={() => void feed.showNew()} />

      {summary && total > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg card-flat px-4 py-3" data-following-summary="">
          {actors.length > 0 && (
            <span className="flex shrink-0" aria-hidden>
              {actors.slice(0, 4).map((actor, index) => (
                <span key={actor.profile.id} className={cn("rounded-full ring-2 ring-surface", index > 0 && "-ml-2")}>
                  <Avatar src={actor.profile.avatarUrl} alt="" size={32} />
                </span>
              ))}
            </span>
          )}
          <div className="min-w-0 flex-1 basis-56">
            <p className="font-semibold text-text">
              {lastVisit
                ? t("follow.summary.since", { when: formatVisit(lastVisit, language), count: total })
                : t("follow.summary.week", { count: total })}
            </p>
            <p className="text-small text-text-muted">
              {summaryParts(counts!)
                .map((part) => t(`follow.summary.part.${part.key}` as const, { count: part.count }))
                .join(" · ")}
            </p>
          </div>
          {lastVisit && (
            <Button variant="outline" size="sm" onClick={markSeen}>
              {t("follow.summary.markSeen")}
            </Button>
          )}
        </div>
      )}

      <ScrollRow className="gap-2" aria-label={t("follow.source.aria")}>
        {sourceChips
          .filter((chip) => !chip.hidden)
          .map((chip) => (
            <Chip key={chip.key} icon={chip.icon} selected={source === chip.key} onClick={() => setSource(chip.key)}>
              {chip.label}
              {chip.count !== undefined && <span className="text-caption opacity-80">{chip.count}</span>}
            </Chip>
          ))}
      </ScrollRow>

      {actors.length > 0 && (source === "all" || source === "people") && (
        <ScrollRow className="gap-2" aria-label={t("follow.people.aria")}>
          <Chip selected={person === null} onClick={() => setPerson(null)}>
            {t("follow.people.everyone")}
          </Chip>
          {actors.map((actor) => (
            <Chip key={actor.profile.id} selected={person === actor.profile.id} onClick={() => setPerson(person === actor.profile.id ? null : actor.profile.id)} className="pl-1">
              <Avatar src={actor.profile.avatarUrl} alt="" size={28} />
              {actor.profile.displayName.split(" ")[0]}
              <CountBadge>{actor.count}</CountBadge>
            </Chip>
          ))}
        </ScrollRow>
      )}

      {feed.loading ? (
        <TimelineSkeleton />
      ) : feed.failed && feed.events.length === 0 ? (
        <EmptyState scene="feedStalled" icon={Clock} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: () => void feed.retry() }} />
      ) : feed.events.length === 0 ? (
        nothingFollowed ? (
          <EmptyState
            scene="community"
            icon={UserCheck}
            title={t("follow.empty.noneTitle")}
            description={t("follow.empty.noneDescription")}
            action={{ label: t("follow.empty.findPeople"), href: "/discover?section=creators" }}
          />
        ) : filtered ? (
          <EmptyState
            scene="search"
            icon={UserCheck}
            title={t("feed.filteredEmptyTitle")}
            description={t("feed.filteredEmptyDescription")}
            action={{
              label: t("feed.clearFilters"),
              onClick: () => {
                setSource("all");
                setPerson(null);
                onClearNarrowing();
              },
            }}
          />
        ) : (
          <EmptyState scene="inbox" icon={CircleCheck} title={t("follow.empty.quietTitle")} description={t("follow.empty.quietDescription")} action={{ label: t("follow.goForYou"), onClick: () => setHomeTab("forYou") }} />
        )
      ) : (
        <div>
          <Timeline events={feed.events} lastVisit={lastVisit} />
          <LoadMore failed={feed.failed} hasMore={feed.hasMore} loadingMore={feed.loadingMore} onLoadMore={() => void feed.loadMore()} />
          {!feed.hasMore && !feed.failed && (
            <div className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-6 text-center" data-following-end="">
              <CircleCheck size={24} className="text-success" aria-hidden />
              <p className="font-semibold text-text">{t("follow.end.title")}</p>
              <p className="max-w-md text-small text-text-muted">{t("follow.end.description")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setHomeTab("forYou")}>
                  {t("follow.goForYou")}
                </Button>
                <Link href="/discover?section=creators" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                  {t("follow.end.findPeople")}
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Gün ayraçları (Bugün · Dün · tarih) ve "son ziyaretin" çizgisiyle satırlar. */
function Timeline({ events, lastVisit }: { events: ActivityEvent[]; lastVisit: string | null }) {
  const { t, language } = useTranslation();
  const visitAt = lastVisit ? Date.parse(lastVisit) : null;
  const anyNew = visitAt !== null && events.some((event) => Date.parse(event.at) > visitAt);
  const rows = planTimeline(events, (at) => dayLabel(at, language, t), anyNew ? visitAt : null);
  return (
    <div>
      {rows.map(({ event, day, showDay, showMarker }, index) => {
        return (
          <Fragment key={event.key}>
            {showMarker && (
              <div className="mb-6 flex items-center gap-3 text-caption font-semibold text-primary" data-last-visit-marker="">
                <span aria-hidden className="h-0.5 flex-1 rounded-full bg-primary" />
                {t("follow.lastVisit", { when: formatVisit(lastVisit as string, language) })}
                <span aria-hidden className="h-0.5 flex-1 rounded-full bg-primary" />
              </div>
            )}
            {showDay && (
              <div className="mb-5 flex items-center gap-3 text-caption font-semibold text-text-muted">
                {day}
                <span aria-hidden className="h-px flex-1 bg-border-soft" />
              </div>
            )}
            <ActivityEventRow event={event} last={index === events.length - 1} />
          </Fragment>
        );
      })}
    </div>
  );
}

/** Hangi satırın üstüne gün ayracı ve "son ziyaretin" çizgisi gelir (çizgi: ziyaretten eski ilk satırın üstü, bir kez). */
function planTimeline(events: ActivityEvent[], labelOf: (at: string) => string, visitAt: number | null) {
  const rows: { event: ActivityEvent; day: string; showDay: boolean; showMarker: boolean }[] = [];
  let previousDay: string | null = null;
  let markerShown = false;
  for (const event of events) {
    const day = labelOf(event.at);
    const showMarker = visitAt !== null && !markerShown && Date.parse(event.at) <= visitAt;
    if (showMarker) markerShown = true;
    rows.push({ event, day, showDay: day !== previousDay, showMarker });
    previousDay = day;
  }
  return rows;
}

function dayLabel(at: string, language: "tr" | "en", t: ReturnType<typeof useTranslation>["t"]): string {
  const date = new Date(at);
  const today = new Date();
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diff === 0) return t("follow.today");
  if (diff === 1) return t("follow.yesterday");
  return date.toLocaleDateString(language === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "long", weekday: "long" });
}

function formatVisit(at: string, language: "tr" | "en"): string {
  const date = new Date(at);
  const sameDay = new Date().toDateString() === date.toDateString();
  const locale = language === "tr" ? "tr-TR" : "en-US";
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${date.toLocaleDateString(locale, { day: "numeric", month: "short" })} ${time}`;
}

/** Özetteki en çok paylaşan kişilerin profilleri (kişi çipleri ve yüzler). */
function useActorChips(actors: { id: string; count: number }[]): { profile: UserProfile; count: number }[] {
  const profiles = useActorProfiles(actors.map((actor) => actor.id));
  return actors.flatMap((actor) => {
    const profile = profiles.get(actor.id);
    return profile ? [{ profile, count: actor.count }] : [];
  });
}

function TimelineSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8" aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3">
          <span className="skeleton-shimmer h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-3">
            <span className="skeleton-shimmer h-4 w-1/2 rounded-sm" />
            <span className="skeleton-shimmer aspect-[4/3] w-full max-w-[480px] rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
