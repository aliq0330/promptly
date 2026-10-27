"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Flag, MessageSquare, SquareStack } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { fetchCommunityReports, resolveCommunityReport, type CommunityReport } from "@/lib/supabase/communities";
import { communityChatHref } from "@/lib/communities";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { useGrowingList } from "@/features/content/use-growing-list";
import { LoadMore } from "@/features/feed/load-more";
import { useTranslation } from "@/lib/i18n/language-provider";

type Filter = "open" | "closed";

/**
 * Moderasyon kuyruğu: üyelerin raporladığı gönderiler ve sohbet mesajları (sitenin genel raporlarından AYRI). "Reddet" raporu kapatır;
 * "İçeriği kaldır" gönderiyi akıştan çıkarır / mesajı herkes için siler (yetki ve rütbe kuralları sunucuda: yalnız kendinden düşük
 * rütbenin içeriği). Her karar denetim kaydına yazılır ve raporlayana sonuç bildirimi gider.
 */
export function ModerationSection({ groupId, onChanged }: { groupId: string; onChanged: () => void | Promise<void> }) {
  const { t, language } = useTranslation();
  const [filter, setFilter] = useState<Filter>("open");
  const [pending, setPending] = useState<{ report: CommunityReport; action: "dismiss" | "remove" } | null>(null);
  const [note, setNote] = useState("");
  const action = useAsyncAction();

  // İlk 50 rapor; devamı kaydırınca (eskiden 50'de kesiliyordu — kapanmış rapor geçmişine ulaşılamıyordu).
  const list = useGrowingList(`${groupId}|${filter}`, (limit) => fetchCommunityReports(groupId, filter, limit));
  const reports = list.items;
  const loadError = list.failed && reports !== null && reports.length === 0;
  const load = list.reload;

  async function confirm() {
    if (!pending) return;
    const { report, action: kind } = pending;
    const ok = await action.run(async () => {
      await resolveCommunityReport(report.id, kind, note);
      return true;
    });
    if (!ok) return;
    setPending(null);
    setNote("");
    await load();
    await onChanged();
  }

  return (
    <section aria-labelledby="community-moderation-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="community-moderation-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
          <Flag size={15} aria-hidden /> {t("communities.moderation.title")}
        </h3>
        <Tabs variant="segmented" ariaLabel={t("communities.moderation.filterAria")} active={filter} onChange={setFilter} items={[{ key: "open", label: t("communities.moderation.open") }, { key: "closed", label: t("communities.moderation.closed") }]} />
      </div>
      <p className="text-caption text-text-muted">{t("communities.moderation.help")}</p>

      {loadError ? (
        <p role="alert" className="text-small text-danger">
          {t("communities.moderation.loadError")}{" "}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            {t("common.retry")}
          </button>
        </p>
      ) : reports === null || list.loading ? (
        <div className="h-24 animate-pulse rounded-lg border border-border-soft bg-surface-soft" aria-busy="true" />
      ) : reports.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-small text-text-muted">
          <CheckCircle2 size={16} aria-hidden /> {filter === "open" ? t("communities.moderation.emptyOpen") : t("communities.moderation.emptyClosed")}
        </p>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="space-y-2.5 rounded-lg border border-border-soft bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">
                  {report.kind === "post" ? <SquareStack size={11} aria-hidden /> : <MessageSquare size={11} aria-hidden />}
                  {report.kind === "post" ? t("communities.moderation.kindPost") : t("communities.moderation.kindMessage")}
                </Badge>
                {report.status !== "open" && <Badge variant={report.status === "dismissed" ? "outline" : "success"}>{report.status === "dismissed" ? t("communities.moderation.dismissed") : t("communities.moderation.resolved")}</Badge>}
                <span className="text-caption text-text-muted">{formatRelativeTime(report.createdAt, language)}</span>
              </div>
              {report.kind === "post" && report.postTitle && <p className="break-words text-sm font-medium text-text">{report.postTitle}</p>}
              {report.kind === "message" && (
                <p className="break-words rounded-md bg-surface-soft px-3 py-2 text-small text-text-secondary">
                  {report.messagePreview ?? t("communities.moderation.messageGone")}
                </p>
              )}
              <p className="break-words text-small text-text-secondary">
                <span className="font-medium text-text">{t("communities.moderation.reason")}: </span>
                {report.reason}
              </p>
              {report.reporter && (
                <p className="flex items-center gap-1.5 text-caption text-text-muted">
                  <Avatar src={report.reporter.avatarUrl} alt={report.reporter.displayName} size={16} />
                  <Link href={profileHref(report.reporter)} className="hover:underline">
                    {t("communities.moderation.reportedBy", { name: report.reporter.displayName })}
                  </Link>
                </p>
              )}
              {report.status === "open" ? (
                <div className="flex flex-wrap justify-end gap-2">
                  {report.kind === "message" && report.messageId && (
                    <Link href={`${communityChatHref(groupId)}&hl=message:${report.messageId}`} className="mr-auto self-center text-label font-medium text-primary hover:underline">
                      {t("communities.moderation.viewInChat")}
                    </Link>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => { action.setError(null); setPending({ report, action: "dismiss" }); }}>
                    {t("communities.moderation.dismiss")}
                  </Button>
                  <Button type="button" size="sm" variant="danger" onClick={() => { action.setError(null); setPending({ report, action: "remove" }); }}>
                    {t("communities.moderation.remove")}
                  </Button>
                </div>
              ) : (
                report.resolution && report.resolution !== "content_removed" && report.resolution !== "dismissed" && <p className="text-caption text-text-muted">{t("communities.moderation.note", { note: report.resolution })}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {reports !== null && reports.length > 0 && (
        <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.grow} />
      )}

      {pending && (
        <ConfirmDialog
          id="community-report-confirm"
          title={pending.action === "remove" ? t("communities.moderation.removeTitle") : t("communities.moderation.dismissTitle")}
          body={pending.action === "remove" ? t("communities.moderation.removeBody") : t("communities.moderation.dismissBody")}
          confirmLabel={pending.action === "remove" ? t("communities.moderation.remove") : t("communities.moderation.dismiss")}
          danger={pending.action === "remove"}
          busy={action.busy}
          error={action.error}
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        >
          <div>
            <label htmlFor="report-note" className={fieldLabelClassName}>
              {t("communities.moderation.noteLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </label>
            <textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} disabled={action.busy} className={`${fieldControlClassName} resize-none py-2`} />
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
