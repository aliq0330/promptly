"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchTeamInsights, type TeamActionError, type TeamInsightsData } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { TeamCtx } from "./team-page";
import { Panel, PillChoice, SectionError } from "./team-ui";

function delta(now: number, prev: number): string | undefined {
  if (!prev && !now) return undefined;
  if (!prev) return "+" + now;
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** Karttaki küçük renkli değişim etiketi: yükseliş iyiyse yeşil, kötüyse kırmızı, nötr/uyarı amber. */
function Delta({ text, tone }: { text: string | undefined; tone: "good" | "bad" | "warn" | "plain" }) {
  if (!text) return null;
  const cls = { good: "text-success", bad: "text-danger", warn: "text-warning", plain: "text-text-muted" }[tone];
  return <span className={cn("ml-1.5 text-caption font-bold", cls)}>{text}</span>;
}

function Stat({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface p-4">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-1 flex items-baseline font-display text-h2 font-bold tabular-nums">
        {value}
        {children}
      </p>
    </div>
  );
}

/** Panel: son 7/30/90 günün kütüphane kullanımı, onay süresi, katkı verenler, uyarılar ve en çok kullanılan promptlar (`team_insights`). */
export function TeamPanelSection({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
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
  const peak = data ? Math.max(0, ...data.daily.map((d) => d.n)) : 0;
  const shortDay = (day: string) => new Date(day).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
  const approvalText = (hours: number) => (hours < 1 ? t("tm.panel.minutes", { count: Math.max(1, Math.round(hours * 60)) }) : t("tm.panel.hours", { count: Math.round(hours) }));

  const range = (
    <PillChoice<"7" | "30" | "90">
      ariaLabel={t("tm.panel.range")}
      value={String(days) as "7" | "30" | "90"}
      onChange={(k) => setDays(Number(k) as 7 | 30 | 90)}
      options={(["7", "30", "90"] as const).map((k) => ({ key: k, label: t("tm.panel.days", { count: Number(k) }) }))}
    />
  );

  const alerts = data
    ? [
        { n: data.alerts.pending, tone: "bg-warning/10 text-warning", text: data.alerts.oldestPendingDays !== null && data.alerts.pending > 0 ? t("tm.panel.alertLine.pending", { days: data.alerts.oldestPendingDays }) : t("tm.panel.alertLine.pendingNoAge"), link: data.alerts.pending > 0 },
        { n: data.alerts.stale, tone: "bg-primary-soft text-primary", text: t("tm.panel.alertLine.stale"), link: false },
        { n: data.alerts.deprecatedUsed, tone: "bg-danger/10 text-danger", text: t("tm.panel.alertLine.deprecated"), link: false },
      ]
    : [];

  return (
    <section className="space-y-4" data-testid="team-panel">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-display text-h2 font-bold max-md:hidden">{t("tm.panel.title")}</h2>
        {range}
      </div>
      {!data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-panel-stats>
            <Stat label={t("tm.panel.copies")} value={data.copies.toLocaleString(language === "en" ? "en-US" : "tr-TR")}>
              <Delta text={delta(data.copies, data.copiesPrev)} tone={data.copies >= data.copiesPrev ? "good" : "bad"} />
            </Stat>
            <Stat label={t("tm.panel.approvalTime")} value={data.approvalHours === null ? "–" : approvalText(data.approvalHours)}>
              {data.approvalHours !== null && data.approvalHoursPrev !== null && Math.abs(data.approvalHours - data.approvalHoursPrev) >= 0.5 && (
                <Delta text={`${data.approvalHours < data.approvalHoursPrev ? "−" : "+"}${approvalText(Math.abs(data.approvalHours - data.approvalHoursPrev))}`} tone={data.approvalHours < data.approvalHoursPrev ? "good" : "bad"} />
              )}
            </Stat>
            <Stat label={t("tm.panel.contributors")} value={`${data.contributors}/${data.members}`}>
              <Delta text={data.contributors !== data.contributorsPrev ? `${data.contributors > data.contributorsPrev ? "+" : "−"}${Math.abs(data.contributors - data.contributorsPrev)}` : undefined} tone={data.contributors >= data.contributorsPrev ? "good" : "bad"} />
            </Stat>
            <Stat label={t("tm.panel.stale")} value={data.stale}>
              {data.stale > 0 && <Delta text={t("tm.panel.staleShort")} tone="warn" />}
            </Stat>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title={t("tm.panel.trend")} action={peak > 0 ? <span className="text-caption text-text-muted">{t("tm.panel.peak", { count: peak })}</span> : undefined}>
              <div className="flex h-36 items-end gap-0.5" role="img" aria-label={t("tm.panel.trend")} data-panel-chart>
                {data.daily.map((point) => (
                  <span key={point.day} title={`${point.day}: ${point.n}`} className="min-h-[2px] flex-1 rounded-sm bg-primary" style={{ height: `${Math.max(2, (point.n / max) * 100)}%` }} />
                ))}
              </div>
              {data.daily.length > 1 && (
                <div className="mt-2 flex justify-between text-caption text-text-muted">
                  <span>{shortDay(data.daily[0].day)}</span>
                  <span className="max-md:hidden">{shortDay(data.daily[Math.floor(data.daily.length / 2)].day)}</span>
                  <span>{shortDay(data.daily[data.daily.length - 1].day)}</span>
                </div>
              )}
            </Panel>
            <Panel title={t("tm.panel.alerts")}>
              <ul className="space-y-3 text-small" data-panel-alerts>
                {alerts.map((alert, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className={cn("grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1.5 text-small font-bold tabular-nums", alert.tone)}>{alert.n}</span>
                    <span className="flex-1 pt-0.5 text-text-secondary">
                      {alert.text}
                      {alert.link && (
                        <>
                          {" "}
                          <Link href={teamLink(team.id, "library", { status: "pending" })} className="font-bold text-primary hover:underline">
                            {t("tm.panel.alert.review")}
                          </Link>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <section className="rounded-xl border border-border-soft bg-surface p-4" data-panel-top-card>
            <h3 className="mb-2 text-body font-bold md:hidden">{t("tm.panel.top")}</h3>
            {data.top.length === 0 ? (
              <p className="text-small text-text-muted">{t("tm.panel.noTop")}</p>
            ) : (
              <table className="w-full text-small" data-panel-top>
                <thead className="text-caption uppercase tracking-[0.06em] text-text-muted max-md:hidden">
                  <tr className="text-left">
                    <th className="pb-2 font-bold">{t("tm.panel.col.prompt")}</th>
                    <th className="pb-2 font-bold">{t("tm.panel.col.copies")}</th>
                    <th className="pb-2 font-bold">{t("tm.panel.col.works")}</th>
                    <th className="pb-2 font-bold">{t("tm.panel.col.updated")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {data.top.map((item) => {
                    const votes = item.worksYes + item.worksNo;
                    const works = votes > 0 ? `%${Math.round((item.worksYes / votes) * 100)}` : "–";
                    return (
                      <tr key={item.id} data-panel-top-row>
                        <td className="py-2.5 pr-3 font-bold text-text">{item.title}</td>
                        <td className="py-2.5 pr-3 tabular-nums text-text-secondary">{item.copies}</td>
                        <td className="py-2.5 pr-3 text-text-secondary">
                          <span className="font-bold text-text">{works}</span>
                          {votes > 0 && <span className="max-md:hidden"> · {t("tm.lib.votes", { count: votes })}</span>}
                        </td>
                        <td className="py-2.5 text-text-secondary max-md:hidden">
                          v{item.rev} · {formatRelativeTime(item.updatedAt, language)}
                          {item.stale && <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-caption font-bold text-warning">{t("tm.panel.staleTag")}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </section>
  );
}
