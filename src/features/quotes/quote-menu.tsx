"use client";

import { TrashIcon } from "@/components/ui/motion-icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { DropdownMenu, MenuItem } from "@/features/communities/dropdown-menu";
import { ReportButton } from "@/features/moderation/report-button";
import { ReportModal } from "@/features/moderation/report-modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteQuote, type Quote } from "@/lib/supabase/quotes";
import { DialogShell } from "@/components/ui/dialog-shell";

/** "Alıntıyı sil" onayı (kart menüsü ve alıntı sayfasının ⋮ menüsü ortak kullanır): alıntı beğeni/yorumlarıyla kalkar, alıntılanan içerik durur. */
export function QuoteDeleteDialog({ quote, onClose, onDeleted }: { quote: Quote; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteQuote(quote.id);
      onClose();
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.actionFailedRetry"));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={() => !busy && onClose()} labelledBy="quote-delete-title">
      <DialogShell data-quote-delete className="w-full max-w-sm space-y-3 rounded-t-lg border border-border-soft bg-surface-elevated p-5 shadow-pop sm:rounded-lg">
        <h2 id="quote-delete-title" className="text-h3 font-bold text-text">
          {t("quotes.delete.title")}
        </h2>
        <p className="text-small text-text-secondary">{t("quotes.delete.body")}</p>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="danger" onClick={() => void remove()} disabled={busy} data-quote-delete-confirm="">
            {t("quotes.delete.confirm")}
          </Button>
        </div>
      </DialogShell>
    </Modal>
  );
}

/** Başkasının alıntısını şikâyet penceresi (alıntı sayfasının ⋮ menüsünden açılır; moderatör kuyruğunda `quote` türü): merkezi şikâyet penceresi (docs/history/284-*). */
export function QuoteReportDialog({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  return <ReportModal target={{ type: "quote", id: quote.id, title: quote.note, subtitle: quote.author.username ? `@${quote.author.username}` : null }} onClose={onClose} />;
}

/**
 * Alıntının ⋮ menüsü (kartta): kendi alıntısı → "Alıntıyı sil" (onaylı); başkasının alıntısı → şikâyet.
 */
export function QuoteMenu({ quote, onDeleted }: { quote: Quote; onDeleted: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const mine = user?.id === quote.author.id;
  if (!user) return null;

  return (
    <>
      <span data-quote-menu={quote.id} className="relative z-10">
        <DropdownMenu label={t("quotes.card.menu")}>
          {(close) =>
            mine ? (
              <MenuItem
                icon={<TrashIcon size={14} />}
                label={t("quotes.menu.delete")}
                danger
                onClick={() => {
                  close();
                  setConfirming(true);
                }}
              />
            ) : (
              <div className="px-4 py-2">
                <ReportButton targetType="quote" targetId={quote.id} />
              </div>
            )
          }
        </DropdownMenu>
      </span>
      {confirming && <QuoteDeleteDialog quote={quote} onClose={() => setConfirming(false)} onDeleted={onDeleted} />}
    </>
  );
}
