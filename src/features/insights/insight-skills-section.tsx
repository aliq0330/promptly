"use client";

import Link from "next/link";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { InsightTrend } from "@/features/insights/insight-stat-tile";
import { useSkillInsights } from "@/features/insights/use-creator-insights";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatInsightNumber } from "@/lib/insights";
import { skillHref } from "@/lib/utils";

/**
 * Yaratıcı paneli → Skill'ler (docs/history/391-*): yayınlanmış Skill başına indirme/kullanım, tepki, yorum ve kaydedilme (önceki döneme göre).
 * Sayılar YALNIZ `creator_insights_skills` RPC'sindendir. Yayınlanmış Skill'i olmayan yazarda bölüm hiç çizilmez; hata olursa sessizce gizlenmez, yeniden dener.
 */
export function InsightSkillsSection({ period }: { period: number }) {
  const { t, language } = useTranslation();
  const { state, retry } = useSkillInsights(period);
  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <section className="rounded-lg card-flat p-4" data-insights-skills="">
        <p role="alert" className="text-small text-danger">{state.message}</p>
        <button type="button" onClick={retry} className="mt-2 text-small font-semibold text-primary">{t("common.retry")}</button>
      </section>
    );
  }
  if (state.data.length === 0) return null;
  return (
    <section className="rounded-lg card-flat p-4 sm:p-5" aria-labelledby="insights-skills-title" data-insights-skills="">
      <h2 id="insights-skills-title" className="mb-2 flex items-center gap-2 text-h2 font-bold text-text">
        <GraduationCap size={20} aria-hidden /> {t("insights.skills.title")}
      </h2>
      <ul className="divide-y divide-border-soft">
        {state.data.map((row) => (
          <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(4,5rem)]" data-insights-skill-row={row.id}>
            <Link href={skillHref({ id: row.id })} className="min-w-0 truncate text-small font-semibold text-text hover:underline">{row.title || t("skill.untitled")}</Link>
            <Metric label={t("insights.skills.uses")} current={row.uses} previous={row.prevUses} language={language} />
            <Metric label={t("insights.skills.reactions")} current={row.reactions} previous={row.prevReactions} language={language} />
            <Metric label={t("insights.skills.comments")} current={row.comments} previous={row.prevComments} language={language} />
            <Metric label={t("insights.skills.saves")} current={row.saves} previous={row.prevSaves} language={language} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Metric({ label, current, previous, language }: { label: string; current: number; previous: number; language: "tr" | "en" }) {
  return (
    <span className="hidden text-right sm:block">
      <span className="block text-small font-semibold tabular-nums text-text">{formatInsightNumber(current, language)}</span>
      <span className="block text-caption text-text-muted">{label}</span>
      <span className="block text-caption"><InsightTrend current={current} previous={previous} /></span>
    </span>
  );
}
