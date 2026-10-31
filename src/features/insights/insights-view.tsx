"use client";

import { useMemo, useState } from "react";
import { BarChart3, Bookmark, Copy, Heart, ImagePlus, Info, MessageCircle, UserPlus } from "lucide-react";
import { PageContainer } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SadeTitle } from "@/features/content/list-control-row";
import { SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import { InsightReactionMix } from "@/features/insights/insight-reaction-mix";
import { InsightStatTile } from "@/features/insights/insight-stat-tile";
import { InsightTopList } from "@/features/insights/insight-top-list";
import { INSIGHT_CARD, InsightTrendCard } from "@/features/insights/insight-trend-card";
import { useCreatorInsights } from "@/features/insights/use-creator-insights";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CreatorInsights } from "@/lib/supabase/insights";
import { DEFAULT_INSIGHT_PERIOD, INSIGHT_PERIODS, hasNoActivity, type InsightPeriod } from "@/lib/insights";

const CARD = INSIGHT_CARD;

/** Yükleme iskeleti gerçek yerleşimin yüksekliğindedir: veri gelince sayfa kaymaz. */
function InsightsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Skeleton className="col-span-2 h-[7.5rem] rounded-lg lg:col-span-1" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[7.5rem] rounded-lg" />
        ))}
        <Skeleton className="col-span-2 h-[7.5rem] rounded-lg lg:col-span-1" />
      </div>
      <Skeleton className="h-[22rem] rounded-xl" />
      <div className="flex flex-col gap-5 lg:flex-row">
        <Skeleton className="h-[26rem] flex-1 rounded-xl" />
        <Skeleton className="h-[26rem] rounded-xl lg:w-[22rem]" />
      </div>
    </div>
  );
}

export function InsightsView() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<InsightPeriod>(DEFAULT_INSIGHT_PERIOD);
  const { state, retry } = useCreatorInsights(period);

  const periodItems = useMemo<SectionMenuItem<`${InsightPeriod}`>[]>(
    () => INSIGHT_PERIODS.map((days) => ({ key: `${days}` as `${InsightPeriod}`, label: t(`insights.period.${days}` as const) })),
    [t],
  );

  return (
    <PageContainer className="flex flex-col gap-6 lg:max-w-[1104px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <SadeTitle>{t("insights.title")}</SadeTitle>
          <p className="text-small text-text-secondary">{t("insights.subtitle")}</p>
        </div>
        <SectionMenu
          items={periodItems}
          active={`${period}` as `${InsightPeriod}`}
          onChange={(key) => setPeriod(Number(key) as InsightPeriod)}
          ariaLabel={t("insights.period.menuAria")}
          title={t("insights.period.menuTitle")}
          align="end"
        />
      </div>

      {state.status === "loading" && <InsightsSkeleton />}

      {state.status === "error" && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-small text-text-secondary">{state.message}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {state.status === "ready" && hasNoActivity(state.data.summary, state.data.days, state.data.top) && (
        <EmptyState
          icon={BarChart3}
          title={t("insights.empty.title")}
          description={t("insights.empty.description")}
          action={{ label: t("insights.empty.action"), href: "/create" }}
        />
      )}

      {state.status === "ready" && !hasNoActivity(state.data.summary, state.data.days, state.data.top) && (
        <ReadyBody data={state.data} period={period} />
      )}
    </PageContainer>
  );
}

function ReadyBody({ data, period }: { data: CreatorInsights; period: InsightPeriod }) {
  const { t } = useTranslation();
  const { summary, days, top, reactions } = data;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <InsightStatTile className="col-span-2 lg:col-span-1" icon={Copy} label={t("insights.tile.copies")} current={summary.copies} previous={summary.prevCopies} days={period} />
        <InsightStatTile icon={ImagePlus} label={t("insights.tile.results")} current={summary.results} previous={summary.prevResults} days={period} />
        <InsightStatTile icon={Heart} label={t("insights.tile.reactions")} current={summary.reactions} previous={summary.prevReactions} days={period} />
        <InsightStatTile icon={MessageCircle} label={t("insights.tile.comments")} current={summary.comments} previous={summary.prevComments} days={period} />
        <InsightStatTile icon={Bookmark} label={t("insights.tile.saves")} current={summary.saves} previous={summary.prevSaves} days={period} />
        <InsightStatTile className="col-span-2 lg:col-span-1" icon={UserPlus} label={t("insights.tile.followers")} current={summary.followers} previous={summary.prevFollowers} days={period} />
      </div>

      <InsightTrendCard days={days} periodDays={period} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        <section className={`${CARD} min-w-0 flex-1`} aria-labelledby="insights-top-title">
          <h2 id="insights-top-title" className="mb-2 text-h2 font-semibold text-text">{t("insights.top.title")}</h2>
          <InsightTopList items={top} />
        </section>
        <section className={`${CARD} lg:w-[22rem] lg:shrink-0`} aria-labelledby="insights-mix-title">
          <h2 id="insights-mix-title" className="mb-3 text-h2 font-semibold text-text">{t("insights.mix.title")}</h2>
          <InsightReactionMix rows={reactions} days={period} />
        </section>
      </div>

      <aside className="flex items-start gap-3 rounded-lg bg-surface-soft p-4 text-small leading-relaxed text-text-secondary">
        <Info size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold text-text">{t("insights.note.title")}</strong> {t("insights.note.body")}
        </p>
      </aside>
    </div>
  );
}
