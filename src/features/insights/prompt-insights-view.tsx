"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3, Bookmark, ChevronLeft, Copy, Heart, ImagePlus, MessageCircle } from "lucide-react";
import { PageContainer } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonClassName } from "@/components/ui/button";
import { SadeTitle } from "@/features/content/list-control-row";
import { SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { INSIGHT_CARD, InsightTrendCard } from "@/features/insights/insight-trend-card";
import { InsightReactionMix } from "@/features/insights/insight-reaction-mix";
import { InsightStatTile } from "@/features/insights/insight-stat-tile";
import { usePromptInsights } from "@/features/insights/use-creator-insights";
import { findTool } from "@/lib/ai-tool-catalog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { percentages } from "@/lib/prompt-outcomes";
import { DEFAULT_INSIGHT_PERIOD, INSIGHT_PERIODS, promptHasNoActivity, type InsightPeriod } from "@/lib/insights";
import { cn, isUuid, promptHref } from "@/lib/utils";
import type { PromptContentType } from "@/types";

/** "Çalıştı mı?" cevaplarının toplamı (docs/history/296-*): tüm zamanlar, dönem seçiminden bağımsız; kimin cevapladığı gösterilmez. */
function OutcomeTotals({ outcomes }: { outcomes: { worked: number; partial: number; failed: number } }) {
  const { t } = useTranslation();
  const total = outcomes.worked + outcomes.partial + outcomes.failed;
  const [workedPct, partialPct, failedPct] = percentages(outcomes.worked, outcomes.partial, outcomes.failed);
  return (
    <section className={INSIGHT_CARD} aria-labelledby="insights-outcome-title" data-testid="insights-outcomes">
      <h2 id="insights-outcome-title" className="text-h2 font-semibold text-text">{t("insights.outcomes.title")}</h2>
      <p className="mt-1 text-small text-text-secondary">{t("insights.outcomes.total", { count: total })}</p>
      <div role="img" aria-label={t("outcome.barAria", { w: workedPct, p: partialPct, f: failedPct })} className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-soft">
        <i className="block bg-success" style={{ width: `${workedPct}%` }} />
        <i className="block bg-warning" style={{ width: `${partialPct}%` }} />
        <i className="block bg-danger" style={{ width: `${failedPct}%` }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption">
        <span className="font-semibold text-success">{t("outcome.workedPct", { pct: workedPct })}</span>
        <span className="text-text-secondary">{t("outcome.partialPct", { pct: partialPct })}</span>
        <span className="text-text-secondary">{t("outcome.failedPct", { pct: failedPct })}</span>
      </p>
    </section>
  );
}

/** Yükleme iskeleti gerçek yerleşimin yüksekliğindedir: veri gelince sayfa kaymaz. */
function PromptInsightsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Skeleton className="col-span-2 h-[7.5rem] rounded-lg lg:col-span-1" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[7.5rem] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[22rem] rounded-xl" />
      <Skeleton className="h-[16rem] rounded-xl" />
    </div>
  );
}

/**
 * Prompt başına ayrıntı (docs/history/295-*): genel panelin "En çok kopyalananlar" satırından açılır. `/insights/local?id=` (statik export).
 * Yalnız çağıranın KENDİ yayınlanmış herkese açık promptu için çalışır; sunucu başkasınınkine/yokuna aynı `not_found`'u döner (varlık sızmaz).
 */
export function PromptInsightsView() {
  const { t } = useTranslation();
  const rawId = useSearchParams().get("id");
  const promptId = rawId && isUuid(rawId) ? rawId : null;
  const [period, setPeriod] = useState<InsightPeriod>(DEFAULT_INSIGHT_PERIOD);
  const { state, retry } = usePromptInsights(promptId, period);

  const periodItems = useMemo<SectionMenuItem<`${InsightPeriod}`>[]>(
    () => INSIGHT_PERIODS.map((days) => ({ key: `${days}` as `${InsightPeriod}`, label: t(`insights.period.${days}` as const) })),
    [t],
  );

  const summary = state.status === "ready" ? state.data.summary : null;
  const meta = summary ? CONTENT_TYPE_META[(summary.contentType in CONTENT_TYPE_META ? summary.contentType : "text") as PromptContentType] : null;
  const tool = summary?.tools[0] ? findTool(summary.tools[0])?.name ?? summary.tools[0] : null;

  return (
    <PageContainer className="flex flex-col gap-6 lg:max-w-[1104px]">
      <Link href="/insights" className="inline-flex min-h-9 w-fit items-center gap-1 rounded-md text-small font-medium text-text-secondary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
        {t("insights.detail.back")}
      </Link>

      {state.status === "error" && state.notFound ? (
        <EmptyState icon={BarChart3} title={t("insights.detail.notFoundTitle")} description={t("insights.detail.notFoundDescription")} action={{ label: t("insights.detail.back"), href: "/insights" }} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              {summary ? (
                <>
                  <SadeTitle className="break-words text-[2rem] sm:text-[2.375rem]">{summary.title}</SadeTitle>
                  <p className="text-small text-text-secondary">
                    {meta ? t(meta.labelKey) : ""}
                    {tool ? ` · ${tool}` : ""}
                  </p>
                </>
              ) : (
                <>
                  <Skeleton className="h-10 w-3/4 rounded-md" />
                  <Skeleton className="h-4 w-1/3 rounded-md" />
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {promptId && (
                <Link href={promptHref({ id: promptId })} className={buttonClassName({ size: "sm", variant: "outline" })}>
                  {t("insights.detail.openPrompt")}
                </Link>
              )}
              <SectionMenu
                items={periodItems}
                active={`${period}` as `${InsightPeriod}`}
                onChange={(key) => setPeriod(Number(key) as InsightPeriod)}
                ariaLabel={t("insights.period.menuAria")}
                title={t("insights.period.menuTitle")}
                align="end"
              />
            </div>
          </div>

          {state.status === "loading" && <PromptInsightsSkeleton />}

          {state.status === "error" && !state.notFound && (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
              <p className="text-small text-text-secondary">{state.message}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                {t("common.retry")}
              </Button>
            </div>
          )}

          {state.status === "ready" && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <InsightStatTile className="col-span-2 lg:col-span-1" icon={Copy} label={t("insights.tile.copies")} current={state.data.summary.copies} previous={state.data.summary.prevCopies} days={period} />
                <InsightStatTile icon={ImagePlus} label={t("insights.tile.results")} current={state.data.summary.results} previous={state.data.summary.prevResults} days={period} />
                <InsightStatTile icon={Heart} label={t("insights.tile.reactions")} current={state.data.summary.reactions} previous={state.data.summary.prevReactions} days={period} />
                <InsightStatTile icon={MessageCircle} label={t("insights.tile.comments")} current={state.data.summary.comments} previous={state.data.summary.prevComments} days={period} />
                <InsightStatTile icon={Bookmark} label={t("insights.tile.saves")} current={state.data.summary.saves} previous={state.data.summary.prevSaves} days={period} />
              </div>

              {state.data.outcomes && state.data.outcomes.worked + state.data.outcomes.partial + state.data.outcomes.failed > 0 && (
                <OutcomeTotals outcomes={state.data.outcomes} />
              )}

              {promptHasNoActivity(state.data.summary, state.data.days) ? (
                <p className={cn(INSIGHT_CARD, "text-small text-text-secondary")}>{t("insights.detail.noActivity")}</p>
              ) : (
                <>
                  <InsightTrendCard days={state.data.days} periodDays={period} />
                  <section className={INSIGHT_CARD} aria-labelledby="insights-prompt-mix-title">
                    <h2 id="insights-prompt-mix-title" className="mb-3 text-h2 font-semibold text-text">{t("insights.mix.title")}</h2>
                    <InsightReactionMix rows={state.data.reactions} days={period} />
                  </section>
                </>
              )}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
