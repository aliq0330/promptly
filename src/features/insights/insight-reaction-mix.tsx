"use client";

import { ReactionIcon } from "@/features/reactions/reaction-icon";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatInsightNumber, reactionTotal, type InsightReactionRow } from "@/lib/insights";
import { REACTION_LABEL } from "@/lib/reactions";

/** Dönemde alınan tepkilerin türe göre dağılımı: uygulamadaki statik tepki posteri + ad + oransal çubuk + sayı. */
export function InsightReactionMix({ rows, days }: { rows: InsightReactionRow[]; days: number }) {
  const { t, language } = useTranslation();
  const total = reactionTotal(rows);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-text-secondary">{t("insights.mix.subtitle", { days, count: formatInsightNumber(total, language) })}</p>
      {rows.length === 0 ? (
        <p className="text-small text-text-muted">{t("insights.mix.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.reaction} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_3rem] items-center gap-3">
              <span className="flex min-w-0 items-center gap-2 text-small text-text">
                <ReactionIcon reaction={row.reaction} size={22} />
                <span className="truncate">{t(REACTION_LABEL[row.reaction])}</span>
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-surface-soft" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${row.barPercent}%` }} />
              </span>
              <span className="text-right text-small font-semibold tabular-nums text-text">{formatInsightNumber(row.n, language)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
