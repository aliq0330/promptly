"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { useNotifications } from "./notifications-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Tek "Geri al" şeridi (docs/history/326-*): sağlayıcıdaki bekleyen eylemi gösterir. `inline` (zil panelinin içinde) ve `fixed` (sayfada, ekranın
 * altında; telefonda alt menünün üstünde) iki yerleşimi vardır; panel açıkken sayfadaki sabit şerit gizlenir ki ikisi üst üste görünmesin.
 */
export function UndoBar({ placement, aboveNav = true }: { placement: "inline" | "fixed"; /** Telefonda alt menünün üstünde durur; tam ekran ayrıntıda (alt menü yok) en alta yakın. */ aboveNav?: boolean }) {
  const { t } = useTranslation();
  const { undoNotice, runUndo } = useNotifications();

  useEffect(() => {
    if (placement !== "inline") return;
    document.documentElement.dataset.undoInline = "1";
    return () => {
      delete document.documentElement.dataset.undoInline;
    };
  }, [placement]);

  if (!undoNotice) return null;
  return (
    <div
      role="status"
      data-undo-bar={placement}
      {...(placement === "fixed" ? { "data-undo-fixed": "" } : {})}
      className={cn(
        "flex items-center gap-2.5 rounded-full bg-text py-1 pl-4 pr-1.5 text-background",
        placement === "inline" && "mx-2.5 mb-2",
        placement === "fixed" &&
          cn(
            "fixed inset-x-3 z-40 shadow-pop md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[26rem] md:-translate-x-1/2 [html[data-undo-inline]_&]:hidden",
            aboveNav ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
          ),
      )}
    >
      <Check size={18} aria-hidden />
      <span className="min-w-0 flex-1 text-small font-medium">{undoNotice.text}</span>
      <button type="button" onClick={() => void runUndo()} data-action="undo" className="h-11 shrink-0 rounded-full px-4 text-small font-bold text-background underline underline-offset-4 hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background">
        {t("nc.undo")}
      </button>
    </div>
  );
}
