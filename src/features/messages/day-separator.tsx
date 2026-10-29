"use client";

import { chatDayKey } from "@/lib/chat-grouping";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Mesaj akışında günün başlangıcını gösteren ince hap: Bugün · Dün · "12 Ekim" (yıl farklıysa yılıyla). */
export function DaySeparator({ iso }: { iso: string }) {
  const { t, language } = useTranslation();
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const label =
    chatDayKey(iso) === chatDayKey(now.toISOString())
      ? t("chat.day.today")
      : chatDayKey(iso) === chatDayKey(yesterday.toISOString())
        ? t("chat.day.yesterday")
        : new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-GB", {
            day: "numeric",
            month: "long",
            ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
          }).format(date);
  return (
    <div className="flex justify-center py-1" data-day-separator>
      <span className="rounded-full bg-surface px-3 py-1 text-caption text-text-muted">{label}</span>
    </div>
  );
}
