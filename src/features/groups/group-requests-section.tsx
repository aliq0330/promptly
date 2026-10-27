"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Inbox, Loader2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { usePagedList } from "@/features/content/use-paged-list";
import { LoadMore } from "@/features/feed/load-more";
import { decideJoinRequest, fetchGroupJoinRequestsPage, toGroupError, type GroupJoinRequest } from "@/lib/supabase/chat-groups";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup } from "@/types";

/**
 * Bekleyen katılma istekleri (owner/admin/moderator): başvuranın avatarı, adı, zamanı, varsa mesajı; Kabul et / Reddet.
 * Her isteğin işlemi ayrı kilitlidir (çift tıklama yok); sunucu zaten sonuçlanmış isteği ikinci kez işlemez, o durumda liste yenilenir.
 */
export function GroupRequestsSection({
  group,
  onChanged,
  onToast,
}: {
  group: ChatGroup;
  onChanged: () => void | Promise<void>;
  onToast: (message: string) => void;
}) {
  const { t, language } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  // Sayaç başka bir yönetici/ekran tarafından değiştiyse (Realtime ile gelen taze satır) liste de yeniden okunur.
  // 50'şerli sayfa, kalan başvurular kaydırınca kendiliğinden gelir (docs/history/258-*: eskiden 200'de kesiliyordu).
  const pages = usePagedList(`${group.id}|${group.pendingRequestCount}|${reloadKey}`, true, (offset) => fetchGroupJoinRequestsPage(group.id, offset));

  async function decide(request: GroupJoinRequest, accept: boolean) {
    if (busyId) return;
    setBusyId(request.id);
    setRowError(null);
    try {
      const outcome = await decideJoinRequest(request.id, accept);
      onToast(
        outcome === "rejected"
          ? t("groups.requests.rejectedToast", { name: request.user.displayName })
          : t("groups.requests.acceptedToast", { name: request.user.displayName }),
      );
      setReloadKey((k) => k + 1);
      await onChanged();
    } catch (err) {
      console.error("decideJoinRequest", err);
      const error = toGroupError(err instanceof Error ? err : null);
      setRowError({ id: request.id, message: error.message });
      // Zaten sonuçlanmış / yasaklı vb. durumlarda listeyi gerçek durumla eşitle.
      setReloadKey((k) => k + 1);
    } finally {
      setBusyId(null);
    }
  }

  if (pages.loading) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-8 text-small text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  if (pages.failed && pages.items.length === 0) {
    return (
      <div className="space-y-2 py-8 text-center">
        <p role="alert" className="text-small text-danger">
          {t("groups.requests.loadError")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (pages.items.length === 0) {
    return <EmptyState icon={Inbox} title={t("groups.requests.empty")} description={t("groups.requests.emptyHelp")} compact />;
  }

  return (
    <>
    <ul className="divide-y divide-border-soft rounded-lg border border-border-soft" aria-label={t("groups.requests.listLabel")}>
      {pages.items.map((request) => (
        <li key={request.id} className="space-y-2 px-3 py-3">
          <div className="flex items-center gap-3">
            <Link href={profileHref(request.user)} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={request.user.avatarUrl} alt={request.user.displayName} size={40} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold text-text">{request.user.displayName}</span>
                <span className="block truncate text-caption text-text-muted">
                  @{request.user.username} · {formatRelativeTime(request.createdAt, language)}
                </span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button type="button" size="sm" onClick={() => void decide(request, true)} disabled={busyId !== null} aria-label={t("groups.requests.acceptFor", { name: request.user.displayName })}>
                {busyId === request.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span className="hidden sm:inline">{t("groups.requests.accept")}</span>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void decide(request, false)} disabled={busyId !== null} aria-label={t("groups.requests.rejectFor", { name: request.user.displayName })}>
                <X size={14} />
                <span className="hidden sm:inline">{t("groups.requests.reject")}</span>
              </Button>
            </div>
          </div>
          {request.message && <p className="rounded-md bg-surface-soft px-3 py-2 text-small text-text-secondary break-words">{request.message}</p>}
          {rowError?.id === request.id && (
            <p role="alert" className="text-caption text-danger">
              {rowError.message}
            </p>
          )}
        </li>
      ))}
    </ul>
    <LoadMore failed={pages.failed} hasMore={pages.hasMore} loadingMore={pages.loadingMore} onLoadMore={() => void pages.loadMore()} />
    </>
  );
}
