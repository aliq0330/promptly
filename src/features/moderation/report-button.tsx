"use client";

import { Flag } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ReportTargetType } from "@/lib/supabase/reports";
import { useReport } from "./report-provider";

/**
 * Şikâyet noktasının tetikleyicisi (docs/history/284-*): tıklayınca merkezi şikâyet penceresini açar (`ReportProvider`); form, neden listesi ve
 * gönderim orada. Oturum yokken hiçbir şey çizmez (şikâyet için gerçek hesap gerekir, RLS). `title` / `subtitle` penceredeki küçük önizleme içindir.
 */
export function ReportButton({
  targetType,
  targetId,
  label,
  menuItem = true,
  row = false,
  title,
  subtitle,
  onOpen,
  onReported,
}: {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
  /** False when rendered outside a `role="menu"` (e.g. under a comment). */
  menuItem?: boolean;
  /** Sohbet bilgi sayfasındaki satır görünümü (simge dairesi + tam genişlik, tehlike rengi). */
  row?: boolean;
  /** Penceredeki önizleme: şikâyet edilen şeyin başlığı / ikinci satırı (örn. prompt adı, @kullanıcı). */
  title?: string | null;
  subtitle?: string | null;
  /** Pencere açılırken (örn. ⋮ menüsünü kapatmak için). */
  onOpen?: () => void;
  onReported?: () => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { openReport } = useReport();

  if (!user) return null;

  function open() {
    onOpen?.();
    openReport({ type: targetType, id: targetId, title, subtitle }, { onReported });
  }

  if (row) {
    return (
      <button
        type="button"
        onClick={open}
        className="flex h-14 w-full items-center gap-3.5 px-4 text-left text-body text-danger transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft" aria-hidden>
          <Flag size={18} strokeWidth={1.75} />
        </span>
        {label ?? t("messages.reportAction")}
      </button>
    );
  }
  return (
    <button type="button" role={menuItem ? "menuitem" : undefined} onClick={open} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text">
      <Flag size={14} />
      {label ?? t("messages.reportAction")}
    </button>
  );
}
