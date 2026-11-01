"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { usePageTitle } from "@/components/layout/page-title";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Ayarlar ortak parçaları (docs/history/318-*): ana liste (`/settings`) ve alt sayfalar (`/settings/account` …) aynı kart/satır/başlık dilini kullanır.
 * Yeni bir ayar sayfası yazarken bunları kullan; kendi kart/başlık biçimini yazma.
 */

export const settingsLabelClassName = "mb-1.5 block text-small text-text-secondary";

/** Alt sayfa iskeleti: "← Ayarlar" bağlantısı, büyük başlık, kısa açıklama, kartlar (tek okuma sütunu). */
export function SettingsSubpage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const { t } = useTranslation();
  usePageTitle(title);
  return (
    <div className="mx-auto w-full max-w-2xl animate-rise-in space-y-6 px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-10">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text" data-settings-back="">
        <ArrowLeft size={14} />
        {t("settings.backToSettings")}
      </Link>
      <header className="space-y-1.5">
        <h1 className="text-h1 text-text">{title}</h1>
        {description && <p className="text-small leading-relaxed text-text-secondary">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** Bir başlıklı kart grubu (alt sayfa içinde bölüm başlığı). */
export function SettingsGroup({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-24 space-y-3">
      <h2 id={id} className="px-1 font-display text-h3 font-bold tracking-[-0.02em] text-text">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Yükseltilmiş tek ayar kartı; gönderiliyorsa `<form>` olarak çizilir. */
export function SettingsCard({
  as = "div",
  onSubmit,
  title,
  hint,
  children,
}: {
  as?: "div" | "form";
  onSubmit?: (event: FormEvent) => void;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const Tag = as;
  return (
    <Tag onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5">
      <div className="space-y-1">
        <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-text">{title}</h3>
        {hint && <p className="text-xs leading-relaxed text-text-muted">{hint}</p>}
      </div>
      {children}
    </Tag>
  );
}

/** Tam genişlik gezinme satırı (ana listedeki kategoriler, engellenenler, yasal metinler…). */
export function SettingsLinkRow({ href, icon, title, hint }: { href: string; icon?: ReactNode; title: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card transition-colors duration-200 ease-soft hover:border-border-strong sm:px-5"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold tracking-[-0.01em] text-text">{title}</span>
        {hint && <span className="block text-xs text-text-muted">{hint}</span>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform duration-200 ease-soft group-hover:translate-x-0.5" />
    </Link>
  );
}
