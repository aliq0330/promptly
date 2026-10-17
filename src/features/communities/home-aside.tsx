"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { homeHref } from "@/lib/community-home";
import { communityHref } from "@/lib/communities";
import { listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

const ASIDE_LIST_SIZE = 6;

/**
 * Topluluklar ana sayfasının sağ yardımcı sütunu (yalnız `xl`+; dar ekranda `CommunityLayout` hiç çizmez): üyelik/yönetim/bekleyen sayıları ve
 * üye olunan toplulukların kısa listesi. Yeni veri kaynağı yoktur: sayılar sayfanın zaten bildiği değerler, liste `list_my_communities`'tir.
 */
export function HomeAside({ managedCount, actionCount }: { managedCount: number; actionCount: number }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CommunitySummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMyCommunities("member", 0)
      .then((page) => {
        if (cancelled) return;
        setItems(page.communities);
        setHasMore(page.hasMore);
      })
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const stats: Array<{ key: string; value: string; label: string }> = [
    { key: "joined", value: items === null ? "–" : `${items.length}${hasMore ? "+" : ""}`, label: t("communities.aside.joined") },
    { key: "managed", value: String(managedCount), label: t("communities.aside.managed") },
    { key: "pending", value: String(actionCount), label: t("communities.aside.pending") },
  ];

  return (
    <>
      <section className="rounded-xl border border-border-soft bg-surface p-3.5 shadow-card" aria-labelledby="community-aside-summary">
        <h2 id="community-aside-summary" className="text-label font-semibold text-text">
          {t("communities.aside.summary")}
        </h2>
        <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          {stats.map((stat) => (
            <div key={stat.key} className="rounded-lg bg-surface-soft px-1 py-2" data-aside-stat={stat.key}>
              <dd className="text-h3 font-semibold tabular-nums text-text">{stat.value}</dd>
              <dt className="truncate text-caption text-text-muted">{stat.label}</dt>
            </div>
          ))}
        </dl>
        {actionCount > 0 && (
          <Link href={homeHref("invites")} className="mt-2.5 flex items-center justify-between rounded-lg px-2 py-1.5 text-small font-medium text-primary hover:bg-primary-soft">
            {t("communities.tab.invitesAndRequests")} <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </section>

      {(items === null || items.length > 0) && (
      <section className="rounded-xl border border-border-soft bg-surface p-3.5 shadow-card" aria-labelledby="community-aside-mine">
        <div className="flex items-center justify-between gap-2">
          <h2 id="community-aside-mine" className="text-label font-semibold text-text">
            {t("communities.home.myCommunities")}
          </h2>
          {hasMore && (
            <Link href={homeHref("mine")} className="text-caption font-medium text-text-secondary hover:text-primary">
              {t("common.viewAll")}
            </Link>
          )}
        </div>
        {items === null ? (
          <div className="mt-2 space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-surface-soft" />
            ))}
          </div>
        ) : (
          <ul className="mt-1.5">
            {items.slice(0, ASIDE_LIST_SIZE).map((community) => (
              <li key={community.id}>
                <Link href={communityHref(community.id)} className="flex min-h-9 items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-soft">
                  <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={28} />
                  <span className="min-w-0 flex-1 truncate text-small text-text">{community.name}</span>
                  {community.unreadCount > 0 && <span className="rounded-full bg-primary px-1.5 text-caption text-primary-foreground">{community.unreadCount}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <Link href="/communities/all" className="flex items-center justify-between rounded-xl border border-border-soft bg-surface px-3.5 py-2.5 text-small font-medium text-text shadow-card hover:border-border-strong">
        <span className="flex items-center gap-2">
          <Compass size={15} className="text-primary" aria-hidden /> {t("communities.all.button")}
        </span>
        <ArrowRight size={14} aria-hidden />
      </Link>
    </>
  );
}
