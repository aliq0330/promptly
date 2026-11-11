"use client";

import { ChevronLeft } from "@/components/icons/chevron-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import { X } from "@/components/icons/x";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Sunum modu çubuğu (docs/history/367-*): çerçeveleri okuma sırasıyla gezer. Klavye: ← → boşluk, Esc (SpaceBoard dinler). */
export function PresentBar({ index, total, title, onPrev, onNext, onExit }: { index: number; total: number; title: string; onPrev: () => void; onNext: () => void; onExit: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-3" data-testid="board-present-bar">
      <div role="toolbar" aria-label={t("tb.present.bar")} className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-border-soft bg-surface p-1.5 shadow-pop">
        <button type="button" onClick={onPrev} disabled={index <= 0} aria-label={t("tb.present.prev")} data-present-prev="" className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface-soft disabled:opacity-40">
          <ChevronLeft size={20} aria-hidden />
        </button>
        <span className="min-w-0 px-2 text-small font-bold tabular-nums text-text" aria-live="polite">
          <span data-present-counter="">
            {index + 1} / {total}
          </span>
          {title && <span className="ml-2 hidden max-w-[12rem] truncate align-bottom font-semibold text-text-secondary sm:inline-block">{title}</span>}
        </span>
        <button type="button" onClick={onNext} disabled={index >= total - 1} aria-label={t("tb.present.next")} data-present-next="" className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface-soft disabled:opacity-40">
          <ChevronRight size={20} aria-hidden />
        </button>
        <button type="button" onClick={onExit} aria-label={t("tb.present.exit")} data-present-exit="" className="grid h-11 w-11 place-items-center rounded-full bg-text text-background">
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
