"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchAdminSiteStats, type AdminContentType, type AdminSiteStats } from "@/lib/supabase/admin";
import { cn, formatCount } from "@/lib/utils";
import { ADMIN_CONTENT_TYPES, CONTENT_TYPE_KEY, formatBytes, kindKey } from "./format";
import { TypeFilter } from "./type-filter";

const CARD = "rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5";
const CONTENT_KINDS = ["prompts", "requests", "generators", "workflows", "presets"] as const;
const KIND_OF: Record<(typeof CONTENT_KINDS)[number], string> = { prompts: "prompt", requests: "request", generators: "generator", workflows: "workflow", presets: "preset" };

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-lg bg-surface-soft p-3">
      <p className="text-caption text-text-muted">{label}</p>
      <p className={cn("mt-0.5 text-h2 font-semibold tabular-nums text-text", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}

function Bar({ label, value, max, right }: { label: string; value: number; max: number; right: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-small">
        <span className="truncate text-text">{label}</span>
        <span className="shrink-0 tabular-nums text-text-secondary">{right}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SiteStatsPanel() {
  const { t } = useTranslation();
  const [type, setType] = useState<AdminContentType | null>(null);
  const [stats, setStats] = useState<AdminSiteStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminSiteStats(type)
      .then((next) => {
        if (cancelled) return;
        setError(false);
        setStats(next);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  if (error) return <p className="text-small text-danger">{t("admin.loadFailed")}</p>;
  if (!stats) return <p className="text-small text-text-muted">{t("common.loading")}</p>;

  const dailyMax = Math.max(1, ...stats.daily.map((d) => d.posts));
  const bucketMax = Math.max(1, ...stats.storage.by_bucket.map((b) => b.bytes));
  const kindMax = Math.max(1, ...stats.storage.by_kind.map((b) => b.bytes));
  const kindLabel = (kind: string): string =>
    kind === "image" || kind === "video" || kind === "audio" ? t(CONTENT_TYPE_KEY[kind]) : t("admin.kind.other");
  const bucketLabel = (bucket: string): string => {
    const key = `admin.bucket.${bucket}` as TranslationKey;
    return t(key) === key ? bucket : t(key);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <TypeFilter value={type} onChange={setType} />
        <p className="text-caption text-text-muted">{t("admin.stats.filterNote")}</p>
      </div>

      <section className={CARD}>
        <h2 className="mb-3 text-h3 font-semibold text-text">{t("admin.stats.usersTitle")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label={t("admin.stats.totalUsers")} value={stats.users.total} />
          <Tile label={t("admin.stats.new7d")} value={stats.users.new_7d} />
          <Tile label={t("admin.stats.new30d")} value={stats.users.new_30d} />
          <Tile label={t("admin.stats.active7d")} value={stats.active_7d} />
          <Tile label={t("admin.stats.suspended")} value={stats.users.suspended} tone={stats.users.suspended > 0 ? "warning" : undefined} />
          <Tile label={t("admin.stats.blocked")} value={stats.users.posting_blocked} tone={stats.users.posting_blocked > 0 ? "warning" : undefined} />
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-h3 font-semibold text-text">
          {t("admin.stats.contentTitle")}
          {type && <span className="ml-2 text-small font-normal text-text-muted">· {t(CONTENT_TYPE_KEY[type])}</span>}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-small">
            <thead>
              <tr className="border-b border-border-soft text-left text-caption text-text-muted">
                <th className="py-1.5 pr-3 font-medium" />
                <th className="px-2 py-1.5 text-right font-medium">{t("admin.stats.total")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("admin.stats.published")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("admin.stats.draft")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("admin.stats.private")}</th>
              </tr>
            </thead>
            <tbody>
              {CONTENT_KINDS.map((kind) => {
                const row = stats.content[kind];
                return (
                  <tr key={kind} className="border-b border-border-soft last:border-0">
                    <td className="py-2 pr-3 font-medium text-text">{t(kindKey(KIND_OF[kind]))}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatCount(row.total)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{formatCount(row.published)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{formatCount(row.draft)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{formatCount(row.private)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-h3 font-semibold text-text">{t("admin.stats.byTypeTitle")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-small">
            <thead>
              <tr className="border-b border-border-soft text-caption text-text-muted">
                <th className="py-1.5 pr-3 text-left font-medium" />
                {CONTENT_KINDS.map((kind) => (
                  <th key={kind} className="px-2 py-1.5 text-right font-medium">
                    {t(kindKey(KIND_OF[kind]))}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">{t("admin.stats.total")}</th>
              </tr>
            </thead>
            <tbody>
              {ADMIN_CONTENT_TYPES.map((ct) => {
                const row = stats.by_type[ct];
                const sum = CONTENT_KINDS.reduce((acc, kind) => acc + row[kind], 0);
                return (
                  <tr key={ct} className={cn("border-b border-border-soft last:border-0", type === ct && "bg-primary-soft/50")}>
                    <td className="py-2 pr-3 font-medium text-text">{t(CONTENT_TYPE_KEY[ct])}</td>
                    {CONTENT_KINDS.map((kind) => (
                      <td key={kind} className="px-2 py-2 text-right tabular-nums text-text-secondary">
                        {formatCount(row[kind])}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-medium tabular-nums">{formatCount(sum)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-h3 font-semibold text-text">{t("admin.stats.dailyTitle")}</h2>
        <div className="flex h-28 items-end gap-1" role="img" aria-label={t("admin.stats.dailyTitle")}>
          {stats.daily.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.posts}`}>
              <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(d.posts > 0 ? 4 : 1, Math.round((d.posts / dailyMax) * 100))}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-caption text-text-muted">
          <span>{stats.daily[0]?.day.slice(5)}</span>
          <span>{stats.daily[stats.daily.length - 1]?.day.slice(5)}</span>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-h3 font-semibold text-text">{t("admin.stats.engagementTitle")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={t("admin.stats.comments")} value={formatCount(stats.engagement.comments)} />
          <Tile label={t("admin.stats.likes")} value={formatCount(stats.engagement.likes)} />
          <Tile label={t("admin.stats.saves")} value={formatCount(stats.engagement.saves)} />
          <Tile label={t("admin.stats.follows")} value={formatCount(stats.engagement.follows)} />
          <Tile label={t("admin.stats.conversations")} value={formatCount(stats.engagement.conversations)} />
          <Tile label={t("admin.stats.messages")} value={formatCount(stats.engagement.messages)} />
          <Tile label={t("admin.stats.results")} value={formatCount(stats.engagement.results)} />
          <Tile label={t("admin.stats.reportsOpen")} value={stats.engagement.reports_open} tone={stats.engagement.reports_open > 0 ? "danger" : undefined} />
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-1 text-h3 font-semibold text-text">{t("admin.stats.storageTitle")}</h2>
        <p className="text-small text-text-secondary">
          {t("admin.stats.storageTotal")}: <span className="font-semibold tabular-nums text-text">{formatBytes(stats.storage.total_bytes)}</span> ·{" "}
          {t("admin.stats.files", { count: stats.storage.total_files })}
        </p>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("admin.stats.byBucket")}</p>
            {stats.storage.by_bucket.map((b) => (
              <Bar key={b.bucket} label={bucketLabel(b.bucket)} value={b.bytes} max={bucketMax} right={`${formatBytes(b.bytes)} · ${t("admin.stats.files", { count: b.files })}`} />
            ))}
          </div>
          <div className="space-y-3">
            <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("admin.stats.byKind")}</p>
            {stats.storage.by_kind.map((b) => (
              <Bar key={b.kind} label={kindLabel(b.kind)} value={b.bytes} max={kindMax} right={`${formatBytes(b.bytes)} · ${t("admin.stats.files", { count: b.files })}`} />
            ))}
          </div>
        </div>
        <p className="mt-4 text-caption text-text-muted">{t("admin.stats.storageNote")}</p>
      </section>
    </div>
  );
}
