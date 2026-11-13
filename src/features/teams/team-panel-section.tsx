"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchTeamInsights, type TeamActionError, type TeamInsightsData } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { cn } from "@/lib/utils";
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

/** Panel: son 7/30/90 günün PROJE etkinliği — eklenen içerik, onay süresi, katkı verenler, bekleyen onaylar ve en hareketli projeler (`team_insights`, docs/history/362-*). */
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
  const maxTop = Math.max(1, ...(data?.top ?? []).map((project) => project.added));
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
        { n: data.alerts.changes, tone: "bg-danger/10 text-danger", text: t("tm.panel.alertLine.changes"), link: false },
      ]
    : [];

  return (
    <section className="space-y-4" data-testid="team-panel">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-display text-h2 font-bold">{t("tm.panel.title")}</h2>
        {range}
      </div>
      {!data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4 lg:gap-4">
          <Panel
            className="rounded-xl lg:col-span-2"
            title={t("tm.panel.added")}
            action={peak > 0 ? <span className="text-caption text-text-muted">{t("tm.panel.peak", { count: peak })}</span> : undefined}
          >
            <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="font-display text-[2.25rem] font-extrabold leading-none tabular-nums text-text" data-panel-added>
                {data.added.toLocaleString(language === "en" ? "en-US" : "tr-TR")}
              </span>
              <Delta text={delta(data.added, data.addedPrev)} tone={data.added >= data.addedPrev ? "good" : "bad"} />
              <span className="text-caption text-text-muted">{t("tc.panel.prev", { count: data.addedPrev })}</span>
            </div>
            <div className="flex h-32 items-end gap-0.5 border-b border-border md:h-36" role="img" aria-label={t("tm.panel.trend")} data-panel-chart>
              {data.daily.map((point) => (
                <span key={point.day} title={`${point.day}: ${point.n}`} className={cn("min-h-[2px] flex-1 rounded-t", point.n > 0 ? "bg-primary" : "bg-border-strong")} style={{ height: `${Math.max(2, (point.n / max) * 100)}%` }} />
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

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:col-span-2 lg:grid-cols-2 lg:gap-4" data-panel-stats>
            <Stat label={t("tm.panel.approvalTime")} value={data.approvalHours === null ? "–" : approvalText(data.approvalHours)}>
              {data.approvalHours !== null && data.approvalHoursPrev !== null && Math.abs(data.approvalHours - data.approvalHoursPrev) >= 0.5 && (
                <Delta text={`${data.approvalHours < data.approvalHoursPrev ? "−" : "+"}${approvalText(Math.abs(data.approvalHours - data.approvalHoursPrev))}`} tone={data.approvalHours < data.approvalHoursPrev ? "good" : "bad"} />
              )}
            </Stat>
            <Stat label={t("tm.panel.contributors")} value={`${data.contributors}/${data.members}`}>
              <Delta text={data.contributors !== data.contributorsPrev ? `${data.contributors > data.contributorsPrev ? "+" : "−"}${Math.abs(data.contributors - data.contributorsPrev)}` : undefined} tone={data.contributors >= data.contributorsPrev ? "good" : "bad"} />
            </Stat>
            <Stat label={t("tm.panel.projects")} value={data.projects} />
            <Stat label={t("tc.panel.waiting")} value={data.alerts.pending}>
              {data.alerts.oldestPendingDays !== null && data.alerts.pending > 0 && <Delta text={t("tc.panel.oldest", { days: data.alerts.oldestPendingDays })} tone="bad" />}
            </Stat>
          </div>

          <Panel className="rounded-xl lg:col-span-2" title={t("tm.panel.top")}>
            {data.top.length === 0 ? (
              <p className="text-small text-text-muted">{t("tm.panel.noTop")}</p>
            ) : (
              <ul className="space-y-1" data-panel-top>
                {data.top.map((project) => (
                  <li key={project.id} data-panel-top-row>
                    <Link href={teamLink(team.id, "projects", { project: project.id })} className="flex min-h-11 items-center gap-3 text-small hover:text-primary">
                      <b className="w-32 truncate font-bold text-text md:w-36">{project.title}</b>
                      <span aria-hidden className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-soft">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (project.added / maxTop) * 100)}%` }} />
                      </span>
                      <span className="w-8 text-right font-bold tabular-nums text-text" title={t("tm.panel.col.added")}>
                        {project.added}
                      </span>
                      {project.pending > 0 && <span className="rounded-full bg-warning/10 px-2 text-caption font-bold text-warning">{t("tp.card.pending", { count: project.pending })}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="rounded-xl lg:col-span-2" title={t("tm.panel.alerts")}>
            <ul className="space-y-1 text-small" data-panel-alerts>
              {alerts.filter((alert) => alert.n > 0).length === 0 && <li className="py-1 text-text-muted">{t("tc.panel.noAlerts")}</li>}
              {alerts
                .filter((alert) => alert.n > 0)
                .map((alert, index) => (
                  <li key={index} className="flex min-h-12 items-center gap-3 border-t border-border-soft first:border-t-0">
                    <span className={cn("grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1.5 text-small font-bold tabular-nums", alert.tone)}>{alert.n}</span>
                    <span className="flex-1 text-text-secondary">{alert.text}</span>
                    {alert.link && (
                      <Link href={teamLink(team.id, "approvals")} className="font-bold text-primary hover:underline">
                        {t("tm.panel.alert.review")}
                      </Link>
                    )}
                  </li>
                ))}
            </ul>
          </Panel>
        </div>
      )}
    </section>
  );
}
