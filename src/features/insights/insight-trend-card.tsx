"use client";

import { InsightTrendChart } from "@/features/insights/insight-trend-chart";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatInsightDay, type InsightDay } from "@/lib/insights";

export const INSIGHT_CARD = "rounded-xl border border-border-soft bg-surface p-5 shadow-card sm:p-6";

/** "Günlük trend" kartı (başlık + aralık + gösterge + grafik): genel panel ve prompt ayrıntısı AYNI kartı kullanır. */
export function InsightTrendCard({ days, periodDays }: { days: InsightDay[]; periodDays: number }) {
  const { t, language } = useTranslation();
  const from = days[0] ? formatInsightDay(days[0].day, language) : "";
  const to = days.length ? formatInsightDay(days[days.length - 1].day, language) : "";
  return (
    <section className={INSIGHT_CARD} aria-labelledby="insights-trend-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="insights-trend-title" className="text-h2 font-semibold text-text">{t("insights.chart.title")}</h2>
          <p className="mt-1 text-small text-text-secondary">{t("insights.chart.range", { from, to })}</p>
        </div>
        <div className="flex items-center gap-4 text-small text-text-secondary">
          <span className="inline-flex items-center gap-2"><span className="h-1 w-3.5 rounded-full bg-primary" aria-hidden />{t("insights.tile.copies")}</span>
          <span className="inline-flex items-center gap-2"><span className="h-1 w-3.5 rounded-full bg-secondary" aria-hidden />{t("insights.tile.reactions")}</span>
        </div>
      </div>
      <InsightTrendChart days={days} periodDays={periodDays} />
    </section>
  );
}
