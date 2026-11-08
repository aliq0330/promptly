"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import type { IconComponent } from "@/components/icons/icon";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Telefonda "liste → alt sayfa" kalıbı (docs/history/357-*, kullanıcı mockup'ta Yön C'yi seçti; Ayarlar sayfasının kalıbı):
 * iki seviyeli sayfalarda (Ekip, Topluluk, Yönetim) bölümler bir LİSTE'dir; bir satıra dokunmak alt sayfayı açar ve alt sayfa kendi
 * geri çubuğunu çizer. Aynı ekranda iki kontrol satırı (hap + hap) olmaz. Yalnız telefonda kullanılır (`md:` ve üstü eski düzen).
 */

/** Alt sayfa çubuğu: geri + iki satırlı başlık (üstte üst sayfa adı, altta bölüm adı) + sağda sayfanın kendi eylemleri. */
export function PhoneSubBar({
  parent,
  title,
  backHref,
  right,
  testId,
  className,
}: {
  parent: string;
  title: string;
  backHref: string;
  /** Sayfanın kendi eylemleri (ör. Akış'ın "+" yuvası, Denetim'in süzgeç/CSV düğmeleri). */
  right?: ReactNode;
  testId?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("-mx-3 mb-3 md:hidden", className)} data-phone-subbar data-testid={testId}>
      <div className="flex h-14 items-center gap-1 border-b border-border-soft bg-surface px-2">
        <Link href={backHref} aria-label={t("common.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-phone-back>
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-caption text-text-muted">{parent}</span>
          <h1 className="truncate font-display text-h3 font-bold text-text">{title}</h1>
        </div>
        {right}
      </div>
    </div>
  );
}

export interface PhoneSectionItem {
  key: string;
  label: string;
  href: string;
  icon: IconComponent;
  /** Sağda sönük sayı ya da kısa metin (üye sayısı, "6 onay bekliyor"). */
  meta?: string | number;
  /** Bekleyen iş: sayı kutusu turuncu çıkar (okunmamış/onay bekleyen). */
  badge?: number;
  danger?: boolean;
}

/** Bölüm listesi: simge dairesi + ad + sağda meta + ›. Her satır gerçek bağlantıdır (adres = bölüm). */
export function PhoneSectionList({ items, ariaLabel, className }: { items: PhoneSectionItem[]; ariaLabel: string; className?: string }) {
  return (
    <nav aria-label={ariaLabel} className={cn("overflow-hidden rounded-2xl border border-border-soft bg-surface md:hidden", className)} data-phone-section-list>
      <ul className="divide-y divide-border-soft">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                data-phone-section={item.key}
                className={cn(
                  "flex min-h-14 items-center gap-3 px-3.5 py-2 text-body font-medium transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  item.danger ? "text-danger" : "text-text",
                )}
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", item.danger ? "bg-danger/10 text-danger" : "bg-primary-soft text-primary")}>
                  <Icon size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-secondary px-1.5 text-caption font-bold text-white">{item.badge}</span> : null}
                {item.meta !== undefined && item.meta !== "" && <span className="shrink-0 text-small text-text-muted">{item.meta}</span>}
                <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
