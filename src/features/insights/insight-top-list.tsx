"use client";

import Link from "next/link";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { InsightTrend } from "@/features/insights/insight-stat-tile";
import { findTool } from "@/lib/ai-tool-catalog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatInsightNumber, insightPromptHref, trendOf, type InsightTopItem } from "@/lib/insights";
import type { PromptContentType } from "@/types";

function typeMeta(contentType: string) {
  return CONTENT_TYPE_META[(contentType in CONTENT_TYPE_META ? contentType : "text") as PromptContentType];
}

/** Dönemin en çok kopyalanan promptları: sıra · tür simgesi · başlık · kopyalama · tepki · önceki döneme göre değişim. */
export function InsightTopList({ items }: { items: InsightTopItem[] }) {
  const { t, language } = useTranslation();
  if (items.length === 0) return <p className="py-6 text-small text-text-muted">{t("insights.top.empty")}</p>;
  return (
    <ol className="divide-y divide-border-soft">
      {items.map((item, index) => {
        const meta = typeMeta(item.contentType);
        const Icon = meta.icon;
        const tool = item.tools[0] ? findTool(item.tools[0])?.name ?? item.tools[0] : null;
        const trend = trendOf(item.copies, item.prevCopies);
        return (
          <li key={item.id}>
            <Link
              href={insightPromptHref(item.id)}
              aria-label={t("insights.top.rowAria", { title: item.title, copies: item.copies, reactions: item.reactions })}
              className="grid grid-cols-[1.5rem_2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md py-3 transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:grid-cols-[1.5rem_2.75rem_minmax(0,1fr)_5.5rem_4.5rem_5.5rem] sm:gap-4"
            >
              <span className="font-display text-h3 font-bold text-text-muted tabular-nums">{index + 1}</span>
              <span className="grid h-11 w-11 place-items-center rounded-md bg-primary-soft text-primary">
                <Icon size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-small font-semibold text-text">{item.title}</span>
                <span className="block truncate text-caption text-text-muted">
                  {t(meta.labelKey)}
                  {tool ? ` · ${tool}` : ""}
                  <span className="sm:hidden">{` · ${formatInsightNumber(item.reactions, language)} ${t("insights.top.reactions")}`}</span>
                </span>
              </span>
              <span className="text-right sm:contents">
                <span className="block sm:text-right">
                  <span className="block text-small font-semibold tabular-nums text-text">{formatInsightNumber(item.copies, language)}</span>
                  <span className="hidden text-caption text-text-muted sm:block">{t("insights.top.copies")}</span>
                  <span className="block text-caption sm:hidden">
                    <InsightTrend current={item.copies} previous={item.prevCopies} />
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="block text-small font-semibold tabular-nums text-text">{formatInsightNumber(item.reactions, language)}</span>
                  <span className="block text-caption text-text-muted">{t("insights.top.reactions")}</span>
                </span>
                <span className="hidden text-right text-caption sm:block">
                  {trend.kind === "new" ? <span className="font-semibold text-text-secondary">{t("insights.top.new")}</span> : <InsightTrend current={item.copies} previous={item.prevCopies} />}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
