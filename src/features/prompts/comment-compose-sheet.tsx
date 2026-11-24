"use client";

import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Modal } from "@/components/ui/modal";
import { CommentComposerBox } from "./comment-composer-box";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommentAttachment } from "@/types";
import type { AttachmentState } from "@/features/content/compact-content-card";
import { CommentExtrasPreview, CommentExtrasToolbar, type CommentExtrasController } from "./comment-extras";
import { useId } from "react";

/**
 * Telefonda yorum düzenleme: alttan açılan kart (docs/history/452-*). Tam ekran sayfa açılmaz — başlık ve Vazgeç/Kaydet sabit, kart yukarı
 * sürüklenince %90'a büyür (ortak `Modal` davranışı). Yanıt telefonda da satır içidir (docs/history/454-*); düzenleme masaüstünde satır içidir, bu
 * bileşen yalnız telefonda (`< sm`) çizilir.
 */
export function CommentComposeSheet({
  title,
  notice,
  value,
  onChange,
  placeholder,
  extras,
  userId,
  attachmentState,
  submitLabel,
  submitting,
  canSubmit,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  /** Düzenlemede kısa not ("önceki sürüm geçmişte saklanır"). */
  notice?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  extras: CommentExtrasController;
  userId: string;
  attachmentState?: (attachment: CommentAttachment) => AttachmentState;
  submitLabel: string;
  submitting: boolean;
  canSubmit: boolean;
  error?: string | null;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Modal onClose={submitting ? () => undefined : onCancel} labelledBy={titleId}>
      <DialogShell data-comment-compose-sheet="" className="flex max-h-[75dvh] w-full max-w-lg flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-4">
          <h2 id={titleId} className="font-display text-h3 font-bold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label={t("common.close")}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
            {notice && <p className="text-caption text-text-muted">{notice}</p>}
            <CommentComposerBox
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              minHeightClass="min-h-32"
              toolbar={<CommentExtrasToolbar extras={extras} userId={userId} disabled={submitting} />}
              preview={<CommentExtrasPreview extras={extras} attachmentState={attachmentState} />}
            />
            {error && <p className="text-small text-danger">{error}</p>}
          </div>
          <div data-dialog-footer="" className="flex shrink-0 justify-end gap-2 border-t border-border-soft px-5 py-3">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? t("common.sending") : submitLabel}
            </Button>
          </div>
        </form>
      </DialogShell>
    </Modal>
  );
}
