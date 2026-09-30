"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { useLanguage, useTranslation } from "@/lib/i18n/language-provider";
import { formatRelativeTime } from "@/lib/utils";

export interface DraftItem {
  id: string;
  title: string;
  updatedAt: string;
  /** Where "Devam et" goes — always that content type's own `?edit=` route. */
  href: string;
}

/**
 * The "Taslaklar" entry at the far right of a creation page's header
 * (prompt, prompt request, generator, workflow). One shared component —
 * each page only supplies how to load and delete ITS OWN content type's
 * drafts, so a list never mixes types. A draft is continued through that
 * page's existing `?edit=<id>` mode; nothing here edits content.
 */
export function DraftsButton({
  load,
  onDelete,
}: {
  load: (userId: string) => Promise<DraftItem[]>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id;
  const refresh = useCallback(async () => {
    if (!userId) return;
    setItems(await load(userId));
  }, [userId, load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the caller's own drafts
    void refresh();
  }, [refresh]);

  if (!user) return null;

  async function handleDelete(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await onDelete(id);
      setItems((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
      setConfirmId(null);
    } catch {
      setError(t("draft.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const count = items?.length ?? 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => {
          setOpen(true);
          void refresh();
        }}
      >
        <FileText size={15} aria-hidden />
        {count > 0 ? t("draft.buttonLabel", { count }) : t("draft.buttonLabelEmpty")}
      </Button>

      {open && (
        <Modal onClose={() => setOpen(false)} labelledBy="drafts-modal-title">
          <div
            className="max-h-[80vh] w-full max-w-md space-y-3 overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="drafts-modal-title" className="text-base font-semibold text-text">
                {t("draft.drawerTitle")}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
                <X size={18} />
              </button>
            </div>

            {items === null ? (
              <p className="text-sm text-text-muted">{t("draft.loading")}</p>
            ) : items.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-text-muted">{t("draft.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="rounded-md border border-border-soft bg-surface-soft p-3">
                    <p className="truncate text-sm font-medium text-text">{item.title.trim() || t("draft.untitled")}</p>
                    <p className="mb-2 text-xs text-text-muted">{t("draft.lastEdited", { time: formatRelativeTime(item.updatedAt, language) })}</p>
                    {confirmId === item.id && <p className="mb-2 text-xs text-danger">{t("draft.deleteConfirm")}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={item.href} onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
                        {t("draft.continue")}
                      </Link>
                      <Button type="button" variant="ghost" size="sm" disabled={busyId === item.id} onClick={() => void handleDelete(item.id)}>
                        <Trash2 size={14} aria-hidden />
                        {t("common.delete")}
                      </Button>
                      {confirmId === item.id && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                          {t("common.cancel")}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
