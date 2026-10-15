"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fetchCommunityAudit, type CommunityAuditEntry } from "@/lib/supabase/communities";
import { auditActionKey } from "@/lib/communities";
import { formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Yönetim işlem geçmişi (yalnız owner/admin; RLS): kim, ne zaman, ne yaptı — üye çıkarma, rol, ayar, duyuru, etkinlik, moderasyon... Silinmez, değiştirilemez. */
export function AuditSection({ groupId }: { groupId: string }) {
  const { t, language } = useTranslation();
  const [entries, setEntries] = useState<CommunityAuditEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await fetchCommunityAudit(groupId, null);
      setEntries(page.entries);
      setHasMore(page.hasMore);
      setLoadError(false);
    } catch (err) {
      console.error("community audit", err);
      setLoadError(true);
    }
  }, [groupId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme
    void load();
  }, [load]);

  async function loadMore() {
    if (!entries || entries.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchCommunityAudit(groupId, entries[entries.length - 1].createdAt);
      setEntries([...entries, ...page.entries]);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("community audit (more)", err);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section aria-labelledby="community-audit-title" className="space-y-3">
      <h3 id="community-audit-title" className="flex items-center gap-1.5 text-label font-semibold text-text">
        <History size={15} aria-hidden /> {t("communities.audit.title")}
      </h3>
      <p className="text-caption text-text-muted">{t("communities.audit.help")}</p>
      {loadError ? (
        <p role="alert" className="text-small text-danger">
          {t("communities.audit.loadError")}{" "}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            {t("common.retry")}
          </button>
        </p>
      ) : entries === null ? (
        <div className="h-24 animate-pulse rounded-lg border border-border-soft bg-surface-soft" aria-busy="true" />
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("communities.audit.empty")}</p>
      ) : (
        <>
          <ul className="divide-y divide-border-soft rounded-lg border border-border-soft bg-surface">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                {entry.actor ? <Avatar src={entry.actor.avatarUrl} alt={entry.actor.displayName} size={28} /> : <span className="h-7 w-7 shrink-0 rounded-full bg-surface-soft" aria-hidden />}
                <div className="min-w-0 flex-1 leading-snug">
                  <p className="break-words text-small text-text">
                    <span className="font-medium">{entry.actor?.displayName ?? t("communities.audit.system")}</span> · {t(auditActionKey(entry.action))}
                  </p>
                  <p className="text-caption text-text-muted">{formatRelativeTime(entry.createdAt, language)}</p>
                </div>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center">
              <Button type="button" size="sm" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
