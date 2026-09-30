"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { dayKey, fetchContributionCounts } from "@/lib/supabase/contributions";

const MONTHS_BACK = 6;
const LEVEL_CLASSES = ["bg-surface-soft", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary"];

function levelFor(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

/**
 * GitHub-style post map: one dot per day for the last 6 months, columns
 * are weeks (Monday first), darker = more posts that day. Counts the
 * signed-in user's own published prompts, requests, generators and workflows.
 */
export function ContributionMap() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const { weeks, start, todayKey } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setMonth(from.getMonth() - MONTHS_BACK);
    // Back up to the Monday of that week so columns are whole weeks.
    const offset = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - offset);
    const cols: (Date | null)[][] = [];
    const cursor = new Date(from);
    while (cursor <= today) {
      const col: (Date | null)[] = [];
      for (let i = 0; i < 7; i++) {
        col.push(cursor <= today ? new Date(cursor) : null);
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(col);
    }
    return { weeks: cols, start: from, todayKey: dayKey(today) };
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchContributionCounts(userId, start).then((result) => {
      if (!cancelled) setCounts(result);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, start]);

  if (!user) return null;

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const locale = language === "tr" ? "tr-TR" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "short" });
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
  const dayLabels = language === "tr" ? ["", "Pzt", "", "Çar", "", "Cum", ""] : ["", "Mon", "", "Wed", "", "Fri", ""];

  // A month label sits over the first column that starts in that month.
  const monthLabels = weeks.map((col, index) => {
    const first = col[0];
    if (!first) return "";
    const prev = index > 0 ? weeks[index - 1][0] : null;
    return !prev || prev.getMonth() !== first.getMonth() ? monthFormatter.format(first) : "";
  });

  return (
    <section className="rounded-lg border border-border-soft bg-surface p-4 shadow-card sm:p-5" aria-label={t("contrib.title", { count: total })}>
      <h2 className="mb-4 text-center text-h3 font-semibold text-text-secondary">{t("contrib.title", { count: total })}</h2>
      <div className="scrollbar-none overflow-x-auto pb-1">
        <div className="mx-auto flex w-max gap-1.5">
          <div className="flex flex-col gap-[3px] pt-5 text-[10px] leading-3 text-text-muted" aria-hidden>
            {dayLabels.map((label, i) => (
              <span key={i} className="h-3">{label}</span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                <span className="h-4 whitespace-nowrap text-[10px] leading-4 text-text-muted" aria-hidden>
                  {monthLabels[ci]}
                </span>
                {col.map((day, di) => {
                  if (!day) return <span key={di} className="h-3 w-3" />;
                  const key = dayKey(day);
                  const count = counts[key] ?? 0;
                  return (
                    <span
                      key={di}
                      title={t("contrib.cellLabel", { date: dateFormatter.format(day), count })}
                      className={cn("h-3 w-3 rounded-full", LEVEL_CLASSES[levelFor(count)], key === todayKey && "ring-1 ring-primary")}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-text-muted">
        <span>{t("contrib.less")}</span>
        {LEVEL_CLASSES.map((cls, i) => (
          <span key={i} className={cn("h-3 w-3 rounded-full", cls)} aria-hidden />
        ))}
        <span>{t("contrib.more")}</span>
      </div>
    </section>
  );
}
