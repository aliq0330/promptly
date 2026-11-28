"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "@/components/icons/chevron-right";
import { usePageTitle } from "@/components/layout/page-title";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Ayarlar ortak parçaları (docs/history/318-*): ana liste (`/settings`) ve alt sayfalar (`/settings/account` …) aynı kart/satır/başlık dilini kullanır.
 * Yeni bir ayar sayfası yazarken bunları kullan; kendi kart/başlık biçimini yazma.
 */

export const settingsLabelClassName = "mb-1.5 block text-body font-semibold text-text";

/**
 * Alt sayfa iskeleti (docs/history/482-*, ayar/yönetim sayfalarıyla AYNI dil): solda geri oku + üstte küçük "Ayarlar" adı ve kalın başlık,
 * altında kısa açıklama, sonra etiket + kart bölümleri (tek okuma sütunu). Stil `app/ayar-kit.css` (`sx-set-*`).
 */
export function SettingsSubpage({ title, description, children, backHref = "/settings", backLabel }: { title: string; description?: string; children: ReactNode; backHref?: string; backLabel?: string }) {
  const { t } = useTranslation();
  usePageTitle(title);
  const parent = backLabel ?? t("nav.settings");
  return (
    <div className="mx-auto w-full max-w-[37.5rem] animate-rise-in px-3 pb-10 pt-2 sm:px-6 lg:px-8 lg:pt-6">
      <header className="sx-set-bar">
        <Link href={backHref} className="sx-set-back" aria-label={backLabel ?? t("settings.backToSettings")} data-settings-back="" />
        <div className="min-w-0">
          <small className="sx-set-parent">{parent}</small>
          <h1 className="sx-set-title">{title}</h1>
        </div>
      </header>
      {description && <p className="sx-set-lead">{description}</p>}
      <div className="sx-set-body">{children}</div>
    </div>
  );
}

/** Bir başlıklı kart grubu (alt sayfa içinde bölüm etiketi + altındaki kartlar). */
export function SettingsGroup({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <h2 id={id} className="sx-set-label">
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

/** Tek ayar bölümü: üstte büyük harfli etiket (+ soluk açıklama), altında kenarlıklı kart; gönderiliyorsa kart `<form>` olarak çizilir. */
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
    <section>
      <h2 className="sx-set-label">{title}</h2>
      {hint && <p className="sx-set-hint">{hint}</p>}
      <Tag onSubmit={onSubmit} className="sx-set-card space-y-6 p-4 sm:p-5">
        {children}
      </Tag>
    </section>
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

/** Gezinme satırı (ana listedeki kategoriler, engellenenler, yasal metinler…): ikon + başlık + soluk açıklama + ›. Kartın içinde (`SettingsLinkCard`) ya da tek başına kullanılır. */
export function SettingsLinkRow({ href, icon, title, hint }: { href: string; icon?: ReactNode; title: string; hint?: string }) {
  return (
    <Link href={href} className="sx-set-row group">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-text">{title}</span>
        {hint && <span className="block text-small text-text-muted">{hint}</span>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform duration-200 ease-soft group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Gezinme satırlarını tek kartta çizgilerle ayırır (ayar sayfalarının liste kalıbı). */
export function SettingsLinkCard({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section>
      {label && <h2 className="sx-set-label">{label}</h2>}
      <div className="sx-set-card sx-set-rows">{children}</div>
    </section>
  );
}
