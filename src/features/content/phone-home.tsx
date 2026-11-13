"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { cn } from "@/lib/utils";
import type { PhoneSectionItem } from "./phone-sections";
import { CountBadge } from "@/components/ui/badge";

/**
 * Telefonda "ana ekran" kalıbı (docs/history/358-*, kullanıcı mockup'ı onayladı): Ekip ve Topluluk sayfalarının KÖK ekranı aynı iskeletten
 * kurulur — kimlik bloğu (geri bağlantısı + karo + etiket/ad/özet + birincil ve ikincil düğme), 2 sütunlu bölüm karoları (sayı + bekleyen iş rozeti),
 * altında gerçek içerik önizlemeleri; sayfa sonunda alt menü kadar boşluk. Yalnız telefonda (`md:` ve üstü eski düzen). Yeni bir iki seviyeli
 * sayfanın kök ekranı bunları kullanır, ikinci bir kimlik bloğu çizilmez.
 */

/** Alt menünün (64 px + güvenli alan) altında hiçbir şey kalmasın diye kök ekranın sonuna konan boşluk. */
export const PHONE_HOME_BOTTOM_PAD = "pb-28";

export function PhoneHomeIdentity({
  backHref,
  backLabel,
  backProps,
  mark,
  eyebrow,
  title,
  meta,
  primary,
  secondary,
  testId,
}: {
  backHref: string;
  backLabel: string;
  backProps?: Record<string, string>;
  mark: ReactNode;
  eyebrow: string;
  title: string;
  meta: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-2.5 md:hidden" data-phone-home-identity data-testid={testId}>
      <Link href={backHref} className="-ml-1 inline-flex h-8 items-center gap-0.5 rounded-full pr-2 text-small font-medium text-text-secondary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-phone-back {...backProps}>
        <ArrowLeft size={18} aria-hidden />
        {backLabel}
      </Link>
      <div className="flex items-center gap-3">
        <span className="shrink-0 [&>*]:!rounded-lg">{mark}</span>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-bold uppercase tracking-[0.08em] text-primary">{eyebrow}</p>
          <h1 className="font-display text-h2 font-bold leading-tight text-text [overflow-wrap:anywhere]">{title}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-text-secondary">{meta}</div>
        </div>
      </div>
      {(primary || secondary) && (
        <div className="flex items-center gap-2" data-phone-home-actions>
          {primary}
          {secondary}
        </div>
      )}
    </div>
  );
}

/** Bölüm karoları: 2 sütun; her karo gerçek bağlantıdır (adres = bölüm). Rozet = bekleyen iş (turuncu). */
export function PhoneTileGrid({ items, ariaLabel, className }: { items: PhoneSectionItem[]; ariaLabel: string; className?: string }) {
  return (
    <nav aria-label={ariaLabel} className={cn("grid grid-cols-2 gap-2 md:hidden", className)} data-phone-section-list data-phone-tiles>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            data-phone-section={item.key}
            className="relative flex h-[62px] items-center gap-2.5 rounded-lg border border-border-soft bg-surface px-3 transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <Icon size={18} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-body font-bold text-text">{item.label}</span>
              {(item.sub ?? item.meta) !== undefined && (item.sub ?? item.meta) !== "" && <span className="block truncate text-caption text-text-muted">{item.sub ?? item.meta}</span>}
            </span>
            {item.badge ? (
              <CountBadge className="absolute -right-1 -top-1.5 ring-2 ring-background" data-phone-badge>
                {item.badge}
              </CountBadge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Önizleme bölümü: küçük başlık + (varsa) sağda bağlantı. */
export function PhoneHomeSection({ title, href, linkLabel, children, testId }: { title: string; href?: string; linkLabel?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-4 md:hidden" data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <h2 className="font-display text-body font-bold text-text">{title}</h2>
        {href && linkLabel && (
          <Link href={href} className="text-small font-bold text-primary hover:underline">
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function PhoneHomeCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border-soft overflow-hidden rounded-lg border border-border-soft bg-surface", className)}>{children}</div>;
}

/** Önizleme satırı: küçük görsel/simge + iki satır metin (bağlantı) + (varsa) sağda eylem. Eylem bağlantının DIŞINDA durur (iç içe bağlantı olmaz). */
export function PhoneHomeRow({ thumb, title, sub, href, action, testId }: { thumb: ReactNode; title: string; sub?: ReactNode; href?: string; action?: ReactNode; testId?: string }) {
  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary-soft text-primary">{thumb}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-body font-bold text-text">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-caption text-text-muted">{sub}</span>}
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5" data-testid={testId}>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{inner}</div>
      )}
      {action}
    </div>
  );
}

/** Küçük hap düğme sınıfı (önizleme satırlarındaki "İncele" / "Katıl"). */
export const PHONE_HOME_PILL = "inline-flex h-8 shrink-0 items-center rounded-full bg-primary px-3.5 text-small font-bold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
export const PHONE_HOME_PILL_OUTLINE = "inline-flex h-8 shrink-0 items-center rounded-full border border-border-strong bg-surface px-3.5 text-small font-bold text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
