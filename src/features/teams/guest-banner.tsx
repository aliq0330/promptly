"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { Banner } from "@/components/ui/banner";

/** Konuk erişimi bandı (Yön A, mockup "Ekip 5"): kalan gün sayısı + yalnız açılan kanalların görüldüğü. Süre yoksa ("sınırsız") hiçbir şey çizilmez. */
export function GuestBanner({ guestUntil }: { guestUntil: string | null }) {
  const { t } = useTranslation();
  const [now] = useState(() => Date.now());
  if (!guestUntil) return null;
  const days = Math.max(0, Math.ceil((new Date(guestUntil).getTime() - now) / 86_400_000));
  return (
    <Banner as="div" tone="warning" data-guest-banner className="min-h-0 shrink-0 gap-3 rounded-none py-2.5">
      <span className="min-w-0 flex-1 leading-snug">
        <strong>{t("tm.guest.chatBanner", { days })}</strong> <span className="text-text-secondary">{t("tm.guest.chatOnlyThis")}</span>
      </span>
    </Banner>
  );
}
