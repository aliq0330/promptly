"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import { usePageTitle } from "@/components/layout/page-title";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Ayarlar ortak parçaları (docs/history/318-*): ana liste (`/settings`) ve alt sayfalar (`/settings/account` …) aynı kart/satır/başlık dilini kullanır.
 * Yeni bir ayar sayfası yazarken bunları kullan; kendi kart/başlık biçimini yazma.
 */

export const settingsLabelClassName = "mb-1.5 block text-body font-semibold text-text";

/** Alt sayfa iskeleti: "← Ayarlar" bağlantısı, büyük başlık, kısa açıklama, kartlar (tek okuma sütunu). */
export function SettingsSubpage({ title, description, children, backHref = "/settings", backLabel }: { title: string; description?: string; children: ReactNode; backHref?: string; backLabel?: string }) {
  const { t } = useTranslation();
  usePageTitle(title);
  return (
    <div className="mx-auto w-full max-w-[37.5rem] animate-rise-in space-y-6 px-3 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-10">
      <Link href={backHref} className="inline-flex items-center gap-1 text-small text-text-muted hover:text-text" data-settings-back="">
        <ArrowLeft size={16} />
        {backLabel ?? t("settings.backToSettings")}
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
      <h2 id={id} className="px-1 font-display text-h3 font-bold text-text">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * Ayar bölümü kartı (referans ayar sayfası, docs/history/474-*): üstte başlık (+ soluk açıklama), altında ince ayırıcı, gövdede aralıklı satırlar.
 * Ayar sayfaları, topluluk/ekip yönetimi aynı iskeleti kullanır; kendi kart + başlık biçimini yazma.
 */
export const SETTINGS_SECTION_CLASS = "overflow-hidden rounded-lg card-flat shadow-card";
export const SETTINGS_SECTION_HEAD_CLASS = "border-b border-border-soft px-5 py-4 sm:px-6";
export const SETTINGS_SECTION_BODY_CLASS = "space-y-6 px-5 py-5 sm:px-6";

/** Bölüm kartının üst bandı. */
export function SettingsSectionHead({ title, hint, id }: { title: string; hint?: string; id?: string }) {
  return (
    <div className={SETTINGS_SECTION_HEAD_CLASS}>
      <h3 id={id} className="text-h3 font-bold text-text">
        {title}
      </h3>
      {hint && <p className="mt-1 text-small leading-relaxed text-text-muted">{hint}</p>}
    </div>
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
    <Tag onSubmit={onSubmit} className={SETTINGS_SECTION_CLASS}>
      <SettingsSectionHead title={title} hint={hint} />
      <div className={SETTINGS_SECTION_BODY_CLASS}>{children}</div>
    </Tag>
  );
}

/** Ayar satırının metni: kalın başlık + soluk açıklama (anahtar satırının içinde de kullanılır). */
export function SettingText({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-body font-semibold text-text">{title}</span>
      {hint && <span className="mt-0.5 block text-small leading-relaxed text-text-muted">{hint}</span>}
    </span>
  );
}

/** Anahtar satırı (`SwitchRow`) için düz biçim: kutu/kenarlık yok, satır aralığı kartın `space-y-6`'sından gelir. */
export const SETTING_SWITCH_ROW_CLASS = "items-start py-0.5";

/** Bir ayara bağlı alt ayarlar: solda ince çizgiyle girintili. */
export function SettingNested({ children }: { children: ReactNode }) {
  return <div className="ml-1 space-y-6 border-l-2 border-border-soft pl-4">{children}</div>;
}

/** Tam genişlik gezinme satırı (ana listedeki kategoriler, engellenenler, yasal metinler…). */
export function SettingsLinkRow({ href, icon, title, hint }: { href: string; icon?: ReactNode; title: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg card-flat p-4 shadow-card transition-colors duration-200 ease-soft hover:border-border-strong sm:px-5"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-text">{title}</span>
        {hint && <span className="block text-caption text-text-muted">{hint}</span>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform duration-200 ease-soft group-hover:translate-x-0.5" />
    </Link>
  );
}
