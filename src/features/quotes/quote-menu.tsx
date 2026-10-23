"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { DropdownMenu, MenuItem } from "@/features/communities/dropdown-menu";
import { ReportButton } from "@/features/moderation/report-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteQuote, type Quote } from "@/lib/supabase/quotes";

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
      <div data-quote-delete className="w-full max-w-sm space-y-3 rounded-t-2xl border border-border bg-surface-elevated p-5 shadow-pop sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
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
      </div>
    </Modal>
  );
}

/** Başkasının alıntısını şikâyet penceresi (alıntı sayfasının ⋮ menüsünden açılır; moderatör kuyruğunda `quote` türü). */
export function QuoteReportDialog({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onClose} labelledBy="quote-report-title">
      <div data-quote-report className="w-full max-w-sm space-y-3 rounded-t-2xl border border-border bg-surface-elevated p-5 shadow-pop sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <h2 id="quote-report-title" className="text-h3 font-bold text-text">
          {t("quotes.report.title")}
        </h2>
        <ReportButton targetType="quote" targetId={quote.id} menuItem={false} />
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
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
                icon={<Trash2 size={14} />}
                label={t("quotes.menu.delete")}
                danger
                onClick={() => {
                  close();
                  setConfirming(true);
                }}
              />
            ) : (
              <div className="px-3.5 py-2">
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
