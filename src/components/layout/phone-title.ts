"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/language-provider";
import { duplicatesPhoneTitle } from "@/lib/phone-chrome";

/** Sınıf: telefonda gizler (`< md`). Sayfa başlığı üst çubuktaki adla aynıysa döner, değilse `undefined` (docs/history/463-*). */
export const PHONE_DUPLICATE_TITLE_CLASS = "max-md:hidden";

/**
 * Sayfanın kendi büyük başlığı için: üst çubuk (telefon) aynı adı zaten gösteriyorsa `max-md:hidden` verir. Yeni bir sayfa başlığı bileşeni yazarken
 * h1'e `cn(…, usePhoneDuplicateClass(metin))` ekle; ayrı bir "telefonda gizle" mantığı yazma.
 */
export function usePhoneDuplicateClass(text: unknown): string | undefined {
  const pathname = usePathname() ?? "";
  const { t } = useTranslation();
  return typeof text === "string" && duplicatesPhoneTitle(pathname, text, t) ? PHONE_DUPLICATE_TITLE_CLASS : undefined;
}
