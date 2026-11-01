"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatInsightNumber, trendOf } from "@/lib/insights";
import { cn } from "@/lib/utils";

/** "▲ %24" / "▼ %4" / "● Yeni" / "— Değişmedi": yön yalnız renkle değil simge ve metinle de söylenir. */
export function InsightTrend({ current, previous, className }: { current: number; previous: number; className?: string }) {
  const { t } = useTranslation();
  const trend = trendOf(current, previous);
  const percent = trend.percent;
  const text =
    trend.kind === "up" ? t("insights.trend.up", { percent }) :
    trend.kind === "down" ? t("insights.trend.down", { percent }) :
    trend.kind === "new" ? t("insights.trend.new") : t("insights.trend.flat");
  const aria =
    trend.kind === "up" ? t("insights.trend.upAria", { percent }) :
    trend.kind === "down" ? t("insights.trend.downAria", { percent }) :
    trend.kind === "new" ? t("insights.trend.newAria") : t("insights.trend.flatAria");
  return (
    <span
      aria-label={aria}
      className={cn(
        "font-semibold tabular-nums",
        trend.kind === "up" && "text-success",
        trend.kind === "down" && "text-danger",
        (trend.kind === "new" || trend.kind === "flat") && "text-text-secondary",
        className,
      )}
    >
      {text}
    </span>
  );
}

export function InsightStatTile({
  icon: Icon,
  label,
  current,
  previous,
  days,
  detail,
  className,
}: {
  icon: LucideIcon;
  label: string;
  current: number;
  previous: number;
  days: number;
  /** Sayının altında küçük ek satır (ör. "API 12 · MCP 30"). */
  detail?: string;
  className?: string;
}) {
  const { t, language } = useTranslation();
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-lg border border-border-soft bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center gap-2 text-small font-medium text-text-secondary">
        <Icon size={16} strokeWidth={1.75} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <p className="font-display text-[2rem] font-bold leading-none tabular-nums text-text">{formatInsightNumber(current, language)}</p>
      <p className="flex flex-wrap items-baseline gap-x-2 text-caption">
        <InsightTrend current={current} previous={previous} />
        <span className="text-text-muted">{t("insights.trend.vsPrev", { days })}</span>
      </p>
      {detail && <p className="text-caption text-text-muted tabular-nums">{detail}</p>}
    </div>
  );
}
