"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ChevronDown, Maximize2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

export const DOCK_ICON_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors duration-200 ease-soft hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

/**
 * Dock panelinin ortak üst şeridi (docs/history/328-*): [geri] başlık … [ek eylemler] [tam sayfada aç] [küçült]. Liste, istekler, sohbet ve taslak görünümleri
 * aynı şeridi kullanır; başlık bloğu `children` ile gelir.
 */
export function DockHeader({
  children,
  onBack,
  backLabel,
  actions,
  onExpand,
  expandLabel,
  onMinimize,
  className,
}: {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** "Tam sayfada aç" / "Küçült"ten önce gelen ek düğmeler (yeni sohbet, ara…). */
  actions?: ReactNode;
  onExpand?: () => void;
  expandLabel?: string;
  onMinimize: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex shrink-0 items-center gap-1 border-b border-border-soft px-2 py-2", className)}>
      {onBack && (
        <button type="button" onClick={onBack} aria-label={backLabel ?? t("messages.backToListAriaLabel")} data-dock-back="" className={DOCK_ICON_BUTTON}>
          <ArrowLeft size={19} aria-hidden />
        </button>
      )}
      <div className={cn("flex min-w-0 flex-1 items-center", !onBack && "pl-2")}>{children}</div>
      {actions}
      {onExpand && (
        <button type="button" onClick={onExpand} aria-label={expandLabel} title={expandLabel} data-dock-expand="" className={DOCK_ICON_BUTTON}>
          <Maximize2 size={17} aria-hidden />
        </button>
      )}
      <button type="button" onClick={onMinimize} aria-label={t("dock.minimize")} title={t("dock.minimize")} data-dock-minimize="" className={DOCK_ICON_BUTTON}>
        <ChevronDown size={20} aria-hidden />
      </button>
    </div>
  );
}
