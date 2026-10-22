"use client";

import { AlertCircle, Check, CloudOff, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/** Pano yerleşiminin kayıt durumu: kaydediliyor / kaydedildi / kaydedilemedi (+ tekrar dene). Başarısızlık gizlenmez. */
export function SaveIndicator({ status, onRetry, className }: { status: "idle" | "saving" | "saved" | "error"; onRetry: () => void; className?: string }) {
  const { t } = useTranslation();
  if (status === "idle") return null;
  return (
    <span role="status" aria-live="polite" data-save-status={status} className={cn("ml-auto inline-flex items-center gap-1.5 text-caption", status === "error" ? "text-danger" : "text-text-muted", className)}>
      {status === "saving" && <Loader2 size={13} className="animate-spin" aria-hidden />}
      {status === "saved" && <Check size={13} aria-hidden />}
      {status === "error" && <CloudOff size={13} aria-hidden />}
      {status === "saving" ? t("spaces.save.saving") : status === "saved" ? t("spaces.save.saved") : t("spaces.save.failed")}
      {status === "error" && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-danger underline-offset-2 hover:underline">
          <AlertCircle size={13} aria-hidden />
          {t("common.retry")}
        </button>
      )}
    </span>
  );
}
