"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { homeHref } from "@/lib/community-home";
import { listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Topluluklar ana sayfasının sağ yardımcı sütunu (yalnız `xl`+; dar ekranda `CommunityLayout` hiç çizmez): üyelik/yönetim/bekleyen sayıları ve
 * "Tüm topluluklar". Üye olunan toplulukların listesi artık burada değil, sayfanın kendi "Topluluklarım" rafında (docs/history/212-*).
 * Yeni veri kaynağı yoktur: sayılar sayfanın zaten bildiği değerler ve `list_my_communities`'tir.
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
      <section className="rounded-xl bg-surface-soft p-4" aria-labelledby="community-aside-summary">
        <h2 id="community-aside-summary" className="font-display text-[1.0625rem] font-bold tracking-[-0.02em] text-text">
          {t("communities.aside.summary")}
        </h2>
        <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          {stats.map((stat) => (
            <div key={stat.key} className="rounded-lg bg-surface px-1 py-2" data-aside-stat={stat.key}>
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

      <Link href="/communities/all" className="flex items-center justify-between rounded-full bg-surface-soft px-4 py-2.5 text-small font-semibold text-text transition-colors hover:bg-border-soft">
        <span className="flex items-center gap-2">
          <Compass size={15} className="text-primary" aria-hidden /> {t("communities.all.button")}
        </span>
        <ArrowRight size={14} aria-hidden />
      </Link>
    </>
  );
}
