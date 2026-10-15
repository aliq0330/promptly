"use client";

import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, Heart, MessageCircle, MessagesSquare, SquareStack, UserMinus, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { fetchCommunityStats } from "@/lib/supabase/communities";
import { toGroupError } from "@/lib/supabase/chat-groups";
import type { CommunityStats } from "@/lib/communities";
import { formatCount } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

const PERIODS = [7, 30, 90] as const;

/**
 * Topluluk özeti (`view_stats` yeteneği; varsayılan owner + admin): toplam üye, üye değişimi, yeni üyeler, paylaşılan içerik, içerik
 * etkileşimi, etkinlik katılımı ve sohbet aktifliği. Tamamı veritabanındaki gerçek kayıtlardan, toplulaştırılmış hesaplanır; sohbet
 * için yalnızca mesaj SAYISI ve etkin gönderen sayısı vardır — mesaj içeriği ve kişi bazlı döküm yönetici ekranına açılmaz.
 */
export function StatsSection({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [state, setState] = useState<{ days: number; stats: CommunityStats | null; error: string | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchCommunityStats(groupId, days)
      .then((stats) => {
        if (!cancelled) setState({ days, stats, error: null });
      })
      .catch((err) => {
        console.error("community stats", err);
        if (!cancelled) setState({ days, stats: null, error: toGroupError(err instanceof Error ? err : null).message });
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, days, reloadKey]);

  const current = state && state.days === days ? state : null;

  return (
    <section aria-labelledby="community-stats-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="community-stats-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
          <BarChart3 size={15} aria-hidden /> {t("communities.stats.title")}
        </h3>
        <Tabs variant="segmented" ariaLabel={t("communities.stats.periodAria")} active={String(days) as "7" | "30" | "90"} onChange={(key) => setDays(Number(key) as (typeof PERIODS)[number])} items={PERIODS.map((value) => ({ key: String(value) as "7" | "30" | "90", label: t("communities.stats.days", { count: value }) }))} />
      </div>
      <p className="text-caption text-text-muted">{t("communities.stats.privacyNote")}</p>

      {!current ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-border-soft bg-surface-soft" />
          ))}
        </div>
      ) : current.error || !current.stats ? (
        <div className="space-y-3 rounded-lg border border-border-soft bg-surface px-4 py-6 text-center">
          <p role="alert" className="text-small text-danger">
            {current.error ?? t("communities.stats.loadError")}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => { setState(null); setReloadKey((k) => k + 1); }}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <StatsBody stats={current.stats} />
      )}
    </section>
  );
}

function StatsBody({ stats }: { stats: CommunityStats }) {
  const { t } = useTranslation();
  const net = stats.members.net;
  const cards: { icon: React.ReactNode; label: string; value: string; hint?: string }[] = [
    { icon: <Users size={15} />, label: t("communities.stats.totalMembers"), value: formatCount(stats.members.total) },
    { icon: <UserPlus size={15} />, label: t("communities.stats.newMembers"), value: formatCount(stats.members.joined) },
    { icon: <UserMinus size={15} />, label: t("communities.stats.leftMembers"), value: formatCount(stats.members.left), hint: t("communities.stats.net", { value: `${net > 0 ? "+" : ""}${net}` }) },
    { icon: <SquareStack size={15} />, label: t("communities.stats.posts"), value: formatCount(stats.posts.inPeriod), hint: t("communities.stats.postsTotal", { count: stats.posts.total }) },
    { icon: <Heart size={15} />, label: t("communities.stats.likes"), value: formatCount(stats.engagement.likes) },
    { icon: <MessageCircle size={15} />, label: t("communities.stats.comments"), value: formatCount(stats.engagement.comments) },
    { icon: <CalendarDays size={15} />, label: t("communities.stats.eventsRsvp"), value: formatCount(stats.events.goingUpcoming), hint: t("communities.stats.eventsHint", { upcoming: stats.events.upcoming, total: stats.events.total }) },
    { icon: <MessagesSquare size={15} />, label: t("communities.stats.messages"), value: formatCount(stats.chat.messagesInPeriod) },
    { icon: <Users size={15} />, label: t("communities.stats.activeSenders"), value: formatCount(stats.chat.activeSendersInPeriod) },
  ];
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border-soft bg-surface px-3 py-3">
            <dt className="flex items-center gap-1.5 text-caption text-text-muted">
              {card.icon} {card.label}
            </dt>
            <dd className="mt-1 text-h3 font-semibold text-text">{card.value}</dd>
            {card.hint && <p className="text-caption text-text-muted">{card.hint}</p>}
          </div>
        ))}
      </dl>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniBars label={t("communities.stats.seriesJoined")} values={stats.series.map((p) => p.joined)} />
        <MiniBars label={t("communities.stats.seriesPosts")} values={stats.series.map((p) => p.posts)} />
        <MiniBars label={t("communities.stats.seriesMessages")} values={stats.series.map((p) => p.messages)} />
      </div>
      <p className="text-caption text-text-muted">
        {t("communities.stats.queue", { requests: stats.queue.pendingRequests, invitations: stats.queue.pendingInvitations, reports: stats.queue.openReports })}
      </p>
    </div>
  );
}

/** Günlük sayılar için küçük sütun grafiği (erişilebilir ad + toplam özetiyle; renk dışında bilgi: yükseklik ve başlık). */
function MiniBars({ label, values }: { label: string; values: number[] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, v) => sum + v, 0);
  return (
    <figure className="rounded-lg border border-border-soft bg-surface p-3" aria-label={`${label}: ${total}`}>
      <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-caption text-text-muted">
        <span>{label}</span>
        <span className="font-medium text-text">{total}</span>
      </figcaption>
      <div className="flex h-14 items-end gap-px" role="img" aria-label={t("communities.stats.chartAria", { label, total })}>
        {values.map((value, index) => (
          <span key={index} className="min-w-px flex-1 rounded-t-sm bg-primary/70" style={{ height: `${Math.max(value > 0 ? 8 : 2, (value / max) * 100)}%`, opacity: value > 0 ? 1 : 0.25 }} />
        ))}
      </div>
    </figure>
  );
}
