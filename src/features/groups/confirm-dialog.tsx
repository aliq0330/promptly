"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Kritik grup işlemleri için ortak onay penceresi (görünürlük, üye çıkarma, rol, ayrılma, silme): ne olacağını yazar,
 * işlem sürerken iki butonu da kilitler (çift gönderim yok), hatayı pencerede gösterir.
 */
export function ConfirmDialog({
  id,
  title,
  body,
  confirmLabel,
  danger = false,
  busy,
  error,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: {
  id: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  error: string | null;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal onClose={busy ? () => undefined : onCancel} labelledBy={id}>
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <h2 id={id} className="text-base font-semibold text-text">
          {title}
        </h2>
        <div className="text-small text-text-secondary">{body}</div>
        {children}
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant={danger ? "danger" : "primary"} size="sm" onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? t("common.loading") : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
