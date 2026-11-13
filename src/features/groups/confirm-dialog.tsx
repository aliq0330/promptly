"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { InlineAlert } from "@/components/ui/inline-alert";
import { DialogShell } from "@/components/ui/dialog-shell";

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
  overLayers = false,
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
  /** Tam ekran bir katmanın (z-55 bildirim ayrıntısı, hikâye z-60) ÜSTÜNDE açılır; yoksa katmanın arkasında kalıp hiç görünmez. */
  overLayers?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal onClose={busy ? () => undefined : onCancel} labelledBy={id} overLayers={overLayers}>
      <DialogShell className="w-full max-w-sm space-y-4 rounded-lg border border-border-soft bg-surface p-5 shadow-pop">
        <h2 id={id} className="text-body font-semibold text-text">
          {title}
        </h2>
        <div className="text-small text-text-secondary">{body}</div>
        {children}
        {error && (
          <InlineAlert>
            {error}
          </InlineAlert>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant={danger ? "danger" : "primary"} size="sm" onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? t("common.loading") : confirmLabel}
          </Button>
        </div>
      </DialogShell>
    </Modal>
  );
}
