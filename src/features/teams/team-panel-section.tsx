"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchTeamInsights, type TeamActionError, type TeamInsightsData } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import type { TeamCtx } from "./team-page";
import { Panel, PillChoice, SectionError, StatTile } from "./team-ui";

function delta(now: number, prev: number): string | undefined {
  if (!prev && !now) return undefined;
  if (!prev) return "+" + now;
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** Panel: son 7/30/90 günün kütüphane kullanımı, onay süresi, katkı verenler, uyarılar ve en çok kullanılan promptlar (`team_insights`). */
export function TeamPanelSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team } = ctx;
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [tick, setTick] = useState(0);
  const key = `${team.id}|${days}|${tick}`;
  const [result, setResult] = useState<{ key: string; data: TeamInsightsData | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTeamInsights(team.id, days).then(
      (value) => !cancelled && setResult({ key, data: value, error: null }),
      (e: TeamActionError) => !cancelled && setResult({ key, data: null, error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [team.id, days, key]);
  // Dönem/yenileme değişince eski sonuç gösterilmez (iskelet çıkar): sonuç yalnız kendi anahtarıyla eşleşirse geçerlidir.
  const current = result?.key === key ? result : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  if (error) return <SectionError message={error} onRetry={() => setTick((v) => v + 1)} />;

  const max = Math.max(1, ...(data?.daily ?? []).map((d) => d.n));

  return (
    <section className="space-y-4" data-testid="team-panel">
      <PillChoice<"7" | "30" | "90">
        ariaLabel={t("tm.panel.range")}
        value={String(days) as "7" | "30" | "90"}
        onChange={(key) => setDays(Number(key) as 7 | 30 | 90)}
        options={(["7", "30", "90"] as const).map((key) => ({ key, label: t("tm.panel.days", { count: Number(key) }) }))}
      />
      {!data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={t("tm.panel.copies")} value={data.copies} delta={delta(data.copies, data.copiesPrev)} />
            <StatTile
              label={t("tm.panel.approvalTime")}
              value={data.approvalHours === null ? "–" : data.approvalHours < 1 ? t("tm.panel.minutes", { count: Math.max(1, Math.round(data.approvalHours * 60)) }) : t("tm.panel.hours", { count: Math.round(data.approvalHours) })}
            />
            <StatTile label={t("tm.panel.contributors")} value={`${data.contributors}/${data.members}`} delta={delta(data.contributors, data.contributorsPrev)} />
            <StatTile label={t("tm.panel.stale")} value={data.stale} delta={t("tm.panel.staleHint")} />
          </div>

          <Panel title={t("tm.panel.trend")}>
            <div className="flex h-28 items-end gap-0.5" role="img" aria-label={t("tm.panel.trend")}>
              {data.daily.map((point) => (
                <span key={point.day} title={`${point.day}: ${point.n}`} className="min-h-[2px] flex-1 rounded-sm bg-primary/70" style={{ height: `${Math.max(2, (point.n / max) * 100)}%` }} />
              ))}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("tm.panel.alerts")}>
              <ul className="space-y-2 text-small">
                <li className="flex items-center justify-between gap-3">
                  <span>{t("tm.panel.alert.pending", { count: data.alerts.pending })}</span>
                  {data.alerts.pending > 0 && (
                    <Link href={teamLink(team.id, "library", { status: "pending" })} className="text-primary hover:underline">
                      {t("tm.panel.alert.review")}
                    </Link>
                  )}
                </li>
                {data.alerts.oldestPendingDays !== null && data.alerts.pending > 0 && <li className="text-text-secondary">{t("tm.panel.alert.oldest", { count: data.alerts.oldestPendingDays })}</li>}
                <li>{t("tm.panel.alert.stale", { count: data.alerts.stale })}</li>
                <li>{t("tm.panel.alert.deprecatedUsed", { count: data.alerts.deprecatedUsed })}</li>
              </ul>
            </Panel>
            <Panel title={t("tm.panel.top")}>
              {data.top.length === 0 ? (
                <p className="text-small text-text-muted">{t("tm.panel.noTop")}</p>
              ) : (
                <ol className="space-y-2">
                  {data.top.map((item, index) => (
                    <li key={item.id} className="flex items-center gap-3 text-small">
                      <span className="w-5 text-text-muted tabular-nums">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.stale && <span className="rounded-full bg-warning/10 px-2 text-caption text-warning">{t("tm.panel.staleTag")}</span>}
                      <span className="tabular-nums text-text-secondary">{item.copies}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}
