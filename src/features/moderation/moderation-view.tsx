"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarDays, ExternalLink, Flag, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatRelativeTime } from "@/lib/utils";
import { StorageCleanupCard } from "@/features/moderation/storage-cleanup-card";
import { DnaBackfillCard } from "@/features/moderation/dna-backfill-card";
import { MediaAppearanceCard } from "@/features/moderation/media-appearance-card";
import { SiteStatsPanel } from "@/features/moderation/admin/site-stats-panel";
import { UsersPanel } from "@/features/moderation/admin/users-panel";
import { ChallengesPanel } from "@/features/moderation/admin/challenges-panel";
import { ListControlRow } from "@/features/content/list-control-row";
import { SheetChips, SheetSection } from "@/features/content/list-toolbar";
import { fetchReportQueue, moderateReport, type ModerationAction, type ModerationReport, type ReportStatus } from "@/lib/supabase/moderation";

type Filter = ReportStatus | "all";
const FILTERS: { id: Filter; key: TranslationKey }[] = [
  { id: "open", key: "moderation.filterOpen" },
  { id: "reviewed", key: "moderation.filterReviewed" },
  { id: "dismissed", key: "moderation.filterDismissed" },
  { id: "all", key: "moderation.filterAll" },
];
const STATUS_KEY: Record<ReportStatus, TranslationKey> = {
  open: "moderation.statusOpen",
  reviewed: "moderation.statusReviewed",
  dismissed: "moderation.statusDismissed",
};
const TYPE_KEY: Record<string, TranslationKey> = {
  prompt: "moderation.type.prompt",
  comment: "moderation.type.comment",
  request: "moderation.type.request",
  user: "moderation.type.user",
  message: "moderation.type.message",
  workflow: "moderation.type.workflow",
  preset: "moderation.type.preset",
  story: "moderation.type.story",
  space: "moderation.type.space",
  quote: "moderation.type.quote",
};

type AdminTab = "reports" | "stats" | "users" | "challenges";
const TAB_IDS: AdminTab[] = ["reports", "stats", "users", "challenges"];

function readParam(name: string): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name);
}

function writeParams(updates: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

export function ModerationView() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const isModerator = useIsModerator();
  const [tab, setTabState] = useState<AdminTab>(() => {
    const value = readParam("tab");
    return TAB_IDS.includes(value as AdminTab) ? (value as AdminTab) : "reports";
  });
  const [userId, setUserIdState] = useState<string | null>(() => readParam("user"));
  const [reportFilter, setReportFilter] = useState<Filter>("open");

  function setTab(next: AdminTab) {
    setTabState(next);
    setUserIdState(null);
    writeParams({ tab: next === "reports" ? null : next, user: null });
  }
  function setUserId(next: string | null) {
    setUserIdState(next);
    writeParams({ user: next });
  }

  if (authLoading) return null;
  if (!user || !isModerator) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-8 sm:px-5">
        <EmptyState icon={ShieldCheck} title={t("moderation.forbidden")} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div>
        <h1 className="text-h1 font-semibold text-text">{t("moderation.title")}</h1>
        <p className="text-small text-text-secondary">{t("moderation.subtitle")}</p>
      </div>
      {/* Sade düzen (docs/history/235-*): tek "Şikâyetler ▾" bölüm menüsü; şikâyet durumu süzgeci Filtre penceresinde. */}
      <ListControlRow
        showView={false}
        menu={{
          items: [
            { key: "reports" as const, label: t("admin.tabReports"), icon: Flag },
            { key: "stats" as const, label: t("admin.tabStats"), icon: BarChart3 },
            { key: "users" as const, label: t("admin.tabUsers"), icon: Users },
            { key: "challenges" as const, label: t("admin.tabChallenges"), icon: CalendarDays },
          ],
          active: tab,
          onChange: setTab,
          ariaLabel: t("admin.tabsAria"),
          title: t("moderation.title"),
        }}
        filter={
          tab === "reports"
            ? {
                sheetSections: (
                  <SheetSection title={t("moderation.title")}>
                    <SheetChips>
                      {FILTERS.map((f) => (
                        <Chip key={f.id} selected={reportFilter === f.id} onClick={() => setReportFilter(f.id)}>
                          {t(f.key)}
                        </Chip>
                      ))}
                    </SheetChips>
                  </SheetSection>
                ),
                activeCount: reportFilter === "open" ? 0 : 1,
                onClear: () => setReportFilter("open"),
              }
            : undefined
        }
      />
      {tab === "reports" && <ReportsPanel filter={reportFilter} />}
      {tab === "stats" && <SiteStatsPanel />}
      {tab === "users" && <UsersPanel userId={userId} onSelectUser={setUserId} />}
      {tab === "challenges" && <ChallengesPanel />}
    </div>
  );
}

function ReportsPanel({ filter }: { filter: Filter }) {
  const { t } = useTranslation();
  const isModerator = useIsModerator();
  const [reports, setReports] = useState<ModerationReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(async () => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    if (!isModerator) return;
    let cancelled = false;
    fetchReportQueue(filter)
      .then((next) => {
        if (cancelled) return;
        setError(null);
        setReports(next);
      })
      .catch(() => {
        if (cancelled) return;
        setReports([]);
        setError(t("moderation.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [isModerator, filter, t, reloadKey]);

  return (
    <div className="space-y-4">
      {error && <p className="text-small text-danger">{error}</p>}
      {reports && reports.length === 0 && !error && <EmptyState icon={Flag} title={t("moderation.empty")} />}
      <ul className="space-y-3">
        {(reports ?? []).map((report) => (
          <ReportCard key={report.id} report={report} onDone={load} />
        ))}
      </ul>
      <StorageCleanupCard />
      <DnaBackfillCard />
      <MediaAppearanceCard />
    </div>
  );
}

function ReportCard({ report, onDone }: { report: ModerationReport; onDone: () => Promise<void> }) {
  const { t, language } = useTranslation();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRemove = report.targetExists && report.targetType !== "user";

  async function run(action: ModerationAction) {
    if (busy) return;
    if (action === "removed" && !confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await moderateReport(report.id, action, note);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("moderation.actionFailed"));
      setBusy(false);
      setConfirmRemove(false);
    }
  }

  return (
    <li data-report-id={report.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={report.status === "open" ? "warning" : "neutral"}>{t(STATUS_KEY[report.status])}</Badge>
        <Badge variant="neutral">{t(TYPE_KEY[report.targetType] ?? "moderation.type.prompt")}</Badge>
        <span className="text-caption text-text-muted">{formatRelativeTime(report.createdAt, language)}</span>
      </div>

      <div className="rounded-md bg-surface-soft p-3">
        {report.targetExists ? (
          <>
            <p className="break-words text-small font-medium text-text">{report.targetTitle || t("moderation.targetNoPreview")}</p>
            {report.targetAuthorUsername && (
              <p className="text-caption text-text-muted">
                {t("moderation.author")}: @{report.targetAuthorUsername}
              </p>
            )}
            {report.targetHref && (
              <Link href={report.targetHref} className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline">
                <ExternalLink size={12} /> {t("moderation.open")}
              </Link>
            )}
          </>
        ) : (
          <p className="text-small text-text-muted">{t("moderation.targetGone")}</p>
        )}
      </div>

      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
          {t("moderation.reason")} · {t("moderation.reportedBy")} @{report.reporterUsername}
        </p>
        <p className="break-words text-small text-text">{report.reason}</p>
      </div>

      {report.status !== "open" ? (
        report.resolutionNote && (
          <p className="text-small text-text-secondary">
            {t("moderation.note")}: {report.resolutionNote}
          </p>
        )
      ) : (
        <div className="space-y-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("moderation.notePlaceholder")}
            maxLength={300}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-small text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/15 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("dismissed")}>
              {t("moderation.dismiss")}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("reviewed")}>
              {t("moderation.markReviewed")}
            </Button>
            {canRemove && (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => run("removed")}>
                {confirmRemove ? t("moderation.removeConfirm") : t("moderation.remove")}
              </Button>
            )}
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
      )}
    </li>
  );
}
