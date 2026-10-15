"use client";

import { useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Topluluk kuralları metni (kaydırılabilir) + "okudum, kabul ediyorum" onay kutusu. Kabul yalnızca `accepted` ile bildirilir. */
export function RulesAcceptBox({ rules, accepted, onChange, disabled }: { rules: string; accepted: boolean; onChange: (accepted: boolean) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-label font-semibold text-text">
        <ScrollText size={14} aria-hidden /> {t("communities.rules.title")}
      </h3>
      <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border-soft bg-background px-3.5 py-3 text-small text-text-secondary" tabIndex={0}>
        {rules}
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-small text-text">
        <input type="checkbox" checked={accepted} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" />
        <span>{t("communities.rules.acceptLabel")}</span>
      </label>
    </div>
  );
}

/** Kuralları kabul zorunlu bir topluluğa katılmadan önce açılan onay penceresi (açık katılım / davet kabulü). */
export function RulesAcceptModal({
  name,
  rules,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  name: string;
  rules: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState(false);
  return (
    <Modal onClose={onClose} labelledBy="rules-accept-title">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1">
          <h2 id="rules-accept-title" className="break-words text-base font-semibold text-text">
            {t("communities.rules.modalTitle", { name })}
          </h2>
          <p className="text-small text-text-muted">{t("communities.rules.modalHelp")}</p>
        </div>
        <RulesAcceptBox rules={rules} accepted={accepted} onChange={setAccepted} disabled={busy} />
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={onConfirm} disabled={!accepted || busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
