"use client";

import { useId } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/** Alt sayfalardaki tek satırlık hap biçimli giriş (16 px: iOS yazı alanına yaklaşmaz). */
export const SHEET_INPUT_CLASS =
  "h-12 w-full min-w-0 rounded-full border border-border-strong bg-background px-4 text-[16px] text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-primary/40 focus:border-primary/60";

/** Çip/hap düğme (Önerilen adlar, tür seçici…): seçiliyken birincil. */
export function sheetPillClassName(selected: boolean): string {
  return cn(
    "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-label font-medium transition-colors duration-200 ease-soft",
    selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface-soft text-text-secondary hover:border-primary/50 hover:text-text",
  );
}

/**
 * Yazma ekranının değişken alt sayfaları için ortak iskelet (docs/history/288-*): `Modal` (mobilde alt sayfa, masaüstünde pencere) içinde
 * başlık + kayan gövde + sabit alt satır (docs/history/242-*). `onSubmit` verilirse gövde ve alt satır tek `<form>` olur (Enter gönderir);
 * olay React ağacında dış yayın formuna kabarmasın diye burada durdurulur.
 */
export function VariableSheetFrame({
  title,
  mono = false,
  onClose,
  children,
  footer,
  onSubmit,
}: {
  title: string;
  /** Başlık değişken adıysa tek aralıklı yazı tipi. */
  mono?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onSubmit?: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const body = (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4 pt-1">{children}</div>
      {footer && <div data-dialog-footer className="flex shrink-0 items-center gap-2.5 border-t border-border-soft px-5 py-3">{footer}</div>}
    </>
  );
  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <div
        data-variable-sheet
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 py-1.5 pl-5 pr-2 max-sm:pt-4">
          <h2 id={titleId} className={cn("min-w-0 truncate text-h3 font-semibold text-text", mono && "font-mono text-primary")}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {onSubmit ? (
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        )}
      </div>
    </Modal>
  );
}
