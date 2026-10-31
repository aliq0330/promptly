"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  areaPoints,
  chartTicks,
  formatInsightDay,
  formatInsightNumber,
  labelIndexes,
  linePoints,
  niceMax,
  peakIndex,
  type InsightDay,
} from "@/lib/insights";

const HEIGHT = 230;
const PAD = { left: 38, right: 12, top: 12, bottom: 30 };

/** Kapsayıcının gerçek genişliği: grafik viewBox ile küçülmez, yazılar telefonda da okunur boyda kalır. */
function useMeasuredWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Günlük kopyalama (birincil) ve tepki (ikincil) çizgisi. Ek bağımlılık yok: satır içi SVG, yalnız token renkleri.
 * Zirve gün işaretlenir ve bir balonla söylenir; tüm değerler erişilebilir adda da özetlenir.
 */
export function InsightTrendChart({ days, periodDays }: { days: InsightDay[]; periodDays: number }) {
  const { t, language } = useTranslation();
  const { ref, width } = useMeasuredWidth(640);
  const innerW = Math.max(120, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const copies = days.map((d) => d.copies);
  const reactions = days.map((d) => d.reactions);
  const max = niceMax(Math.max(0, ...copies, ...reactions));
  const ticks = chartTicks(max);
  const peak = peakIndex(copies);
  const peakDay = peak >= 0 ? days[peak] : null;
  const peakX = peak >= 0 && days.length > 1 ? (peak * innerW) / (days.length - 1) : 0;
  const peakY = peak >= 0 ? innerH - (copies[peak] / max) * innerH : 0;
  const bubbleW = 150;
  const bubbleX = Math.min(Math.max(peakX - bubbleW / 2, 0), innerW - bubbleW);
  const bubbleY = peakY < 54 ? peakY + 14 : peakY - 52;

  const label = peakDay
    ? t("insights.chart.aria", { days: periodDays, day: formatInsightDay(peakDay.day, language), count: peakDay.copies })
    : t("insights.chart.ariaFlat", { days: periodDays });

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={HEIGHT} role="img" aria-label={label} className="block overflow-visible">
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {ticks.map((tick) => {
            const y = innerH - (tick / max) * innerH;
            return (
              <g key={tick}>
                <line x1={0} x2={innerW} y1={y} y2={y} className="stroke-border-soft" strokeWidth={1} />
                <text x={-8} y={y + 4} textAnchor="end" className="fill-text-muted text-[12px]">
                  {formatInsightNumber(tick, language)}
                </text>
              </g>
            );
          })}

          <polygon points={areaPoints(copies, innerW, innerH, max)} className="fill-primary/10" />
          <polyline points={linePoints(reactions, innerW, innerH, max)} fill="none" className="stroke-secondary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={linePoints(copies, innerW, innerH, max)} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {peakDay && (
            <g>
              <line x1={peakX} x2={peakX} y1={peakY} y2={innerH} className="stroke-primary" strokeWidth={1} strokeDasharray="3 4" />
              <circle cx={peakX} cy={peakY} r={5.5} className="fill-surface stroke-primary" strokeWidth={3} />
              <g transform={`translate(${bubbleX},${bubbleY})`}>
                <rect width={bubbleW} height={42} rx={10} className="fill-text" />
                <text x={12} y={17} className="fill-surface-soft text-[11px]">
                  {formatInsightDay(peakDay.day, language)}
                </text>
                <text x={12} y={34} className="fill-surface text-[12px] font-semibold">
                  {t("insights.chart.peakCopies", { count: formatInsightNumber(peakDay.copies, language) })}
                </text>
              </g>
            </g>
          )}

          {labelIndexes(days.length, innerW < 360 ? 3 : 5).map((i, n, all) => (
            <text
              key={i}
              x={days.length > 1 ? (i * innerW) / (days.length - 1) : 0}
              y={innerH + 20}
              textAnchor={n === 0 ? "start" : n === all.length - 1 ? "end" : "middle"}
              className="fill-text-muted text-[12px]"
            >
              {formatInsightDay(days[i].day, language)}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
