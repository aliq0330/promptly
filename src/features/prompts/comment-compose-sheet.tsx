"use client";

import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Modal } from "@/components/ui/modal";
import { MentionTextarea } from "@/features/mentions/mention-field";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommentAttachment } from "@/types";
import type { AttachmentState } from "@/features/content/compact-content-card";
import { CommentExtrasPreview, CommentExtrasToolbar, type CommentExtrasController } from "./comment-extras";
import { useId } from "react";

/**
 * Telefonda yanıt yazma / yorum düzenleme: alttan açılan kart (docs/history/451-*). Tam ekran sayfa açılmaz — yanıtlanan yorumun özeti kartın
 * üstünde görünür, başlık ve Vazgeç/Gönder sabit, kart yukarı sürüklenince %90'a büyür (ortak `Modal` davranışı). Masaüstünde yanıt/düzenleme
 * satır içidir; bu bileşen yalnız telefonda (`< sm`) çizilir.
 */
export function CommentComposeSheet({
  title,
  quote,
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
  /** Yanıtlanan yorumun özeti (yanıtta); düzenlemede yok. */
  quote?: { name: string; text: string };
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
            {quote && (
              <div className="rounded-md bg-background px-3 py-2.5" data-comment-quote="">
                <p className="text-small font-semibold text-text">{quote.name}</p>
                <p className="line-clamp-2 break-words text-small text-text-secondary">{quote.text}</p>
              </div>
            )}
            {notice && <p className="text-caption text-text-muted">{notice}</p>}
            <MentionTextarea
              value={value}
              maxLength={2000}
              onChange={onChange}
              rows={7}
              placeholder={placeholder}
              className="w-full resize-none rounded-lg card-flat px-4 py-3 text-body text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <CommentExtrasPreview extras={extras} attachmentState={attachmentState} />
            <div className="flex items-center gap-1">
              <CommentExtrasToolbar extras={extras} userId={userId} disabled={submitting} className="-ml-1.5" />
              <span className="ml-auto text-caption tabular-nums text-text-muted">{t("comments.charCount", { count: value.length })}</span>
            </div>
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
