"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import type { IconComponent } from "@/components/icons/icon";
import { Plus } from "@/components/icons/plus";
import { Button, buttonClassName } from "@/components/ui/button";
import { CARD_SURFACE_CLASS } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Hub düzeni (docs/history/379-*): Spaces, Topluluklar ve Ekipler'in ana sayfaları ile iç sayfaları TEK iskeleti paylaşır.
 *
 * Ana sayfa: `HubBand` (simge karosu · başlık · açıklama · tek birincil düğme) → altı çizgili `Tabs` → `HubControlRow` (sayı + arama/filtre/
 * görünüm simgeleri) → `HubAttentionStrip` (davet/bekleyen iş, tek satır) → `HubGrid` içinde `HubCard`'lar.
 * İç sayfa: `HubDetailBand` (kapak · tür etiketi · başlık · alt bilgi · eylemler) → aynı `Tabs` → `HubDetailLayout` (içerik + "Hakkında" yan sütunu).
 *
 * Yeni bir Space/Topluluk/Ekip ekranı yazarken bu parçaları kullan; ikinci bir bant, sekme çubuğu ya da kart gövdesi çizme.
 */

/** Sayfa kabuğu: telefonda 12, tablette 24, masaüstünde 32 px kenar boşluğu — üç alanda aynı genişlik. */
export const HUB_PAGE_CLASS = "mx-auto w-full max-w-6xl px-3 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-7";

/** Ana sayfa bandı. Telefonda düğme kısa etiketle aynı satırda kalır. */
export function HubBand({
  icon: Icon,
  title,
  description,
  action,
  testId,
  ...rest
}: {
  icon: IconComponent;
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <div className="flex items-center gap-3 sm:gap-4" data-hub-band="" data-testid={testId} {...rest}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon size={24} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-h2 font-extrabold text-text md:text-h1">{title}</h1>
        {description && <p className="truncate text-small text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Bandın tek birincil düğmesi ("Yeni Space", "Topluluk oluştur", "Ekip oluştur"): telefonda `shortLabel` görünür. */
export function HubCreateButton({
  label,
  shortLabel,
  onClick,
  testId,
  attr,
}: {
  label: string;
  shortLabel?: string;
  onClick: () => void;
  testId?: string;
  /** Eski testlerin bulduğu veri özniteliği (ör. `data-create-community`). */
  attr?: Record<`data-${string}`, string | boolean>;
}) {
  return (
    <Button type="button" onClick={onClick} title={label} aria-label={label} data-testid={testId} className="h-10 shrink-0 rounded-full px-3.5 sm:px-5" {...attr}>
      <Plus size={18} aria-hidden />
      <span className="max-sm:hidden">{label}</span>
      <span className="sm:hidden">{shortLabel ?? label}</span>
    </Button>
  );
}

/** Sayı metni solda, simge eylemleri sağda tek satır. */
export function HubControlRow({ count, children, className }: { count?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-9 items-center justify-between gap-3", className)} data-hub-controls="">
      <span className="min-w-0 truncate text-small text-text-secondary">{count}</span>
      <div className="flex shrink-0 items-center gap-0.5">{children}</div>
    </div>
  );
}

/** Dikkat şeridi: davet, bekleyen onay gibi tek satırlık yönlendirme. `href` ya da `onAction` verilir. */
export function HubAttentionStrip({
  icon: Icon,
  children,
  actionLabel,
  href,
  onAction,
  testId,
}: {
  icon: IconComponent;
  children: ReactNode;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
  testId?: string;
}) {
  const action = buttonClassName({ variant: "outline", size: "sm", className: "shrink-0" });
  return (
    <div
      className={cn("flex h-[3.75rem] items-center gap-3 rounded-lg border border-border-soft bg-surface pl-3.5 pr-3 shadow-card", onAction && "cursor-pointer")}
      data-testid={testId}
      data-hub-attention=""
      // Şeridin boş yerine dokunmak da eylemi çalıştırır (düğme kendi tıklamasını zaten işler).
      onClick={onAction ? (event) => !(event.target as HTMLElement).closest("button,a") && onAction() : undefined}
    >
      <span className="grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center rounded-[0.625rem] bg-warning/10 text-warning">
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-small text-text-secondary [&_b]:font-semibold [&_b]:text-text">{children}</span>
      {href ? (
        <Link href={href} className={action}>
          {actionLabel}
        </Link>
      ) : (
        <button type="button" onClick={onAction} className={action}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Kart ızgarası: telefonda 1, tablette 2, geniş masaüstünde 3 sütun (12 / 16 / 20 px aralık). */
export const HUB_GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 xl:gap-5";

export function HubGrid({ children, className, ...rest }: { children: ReactNode; className?: string; [data: `data-${string}`]: string | undefined }) {
  return (
    <ul className={cn(HUB_GRID_CLASS, className)} {...rest}>
      {children}
    </ul>
  );
}

/** Kartın sol üst tür etiketi / sağ üst eylem düğmesi (kapağın üstünde yüzer; kartın bağlantısının üstünde `relative z-10`). */
export const HUB_CARD_CHIP_CLASS = "rounded-full bg-surface/90 px-2.5 py-0.5 text-caption font-semibold text-text shadow-xs";
export const HUB_CARD_CORNER_BUTTON_CLASS =
  "grid h-8 w-8 place-items-center rounded-full bg-surface/90 text-text-secondary shadow-xs transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Kart gövdesinin sabit yüksekliği: üç alanda her kart aynı boyda olsun diye başlık + özet + alt satır bu kutuya sığar. */
export const HUB_CARD_BODY_CLASS = "h-[6.5rem]";

/**
 * Tek kart (üç alanda aynı): 16:9 kapak + sabit yükseklikli gövde. Başlık bağlantısı kartın tamamını kaplar (`after:inset-0`), kapağın köşe
 * öğeleri ve alt satır `relative z-10` ile üstünde kalır; kart yığın bağlamı kurmaz (⋮ menüsü sonraki kartın üstüne açılabilsin).
 */
export function HubCard({
  href,
  title,
  meta,
  cover,
  chip,
  corner,
  coverOverlay,
  footerStart,
  footerEnd,
  extra,
  className,
  ...rest
}: {
  href: string;
  title: ReactNode;
  /** Başlığın altındaki tek satır özet (sahip · sayılar · zaman). */
  meta?: ReactNode;
  /** Kapağın içi: kapsayıcıyı dolduran görsel/çizim. */
  cover: ReactNode;
  /** Sol üst tür etiketi. */
  chip?: ReactNode;
  /** Sağ üst köşe (Sabitle, ⋮ menüsü). */
  corner?: ReactNode;
  /** Kapağın alt kenarına konan küçük öğe (palet çizgisi, "N yeni" rozeti). */
  coverOverlay?: ReactNode;
  /** Alt satırın solu (üye yüzleri) ve sağı (durum rozeti ya da tek eylem). */
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
  /** Kartın altına eklenen satır dışı bildirim (hata gibi). */
  extra?: ReactNode;
  className?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <li
      className={cn(
        "group relative flex min-w-0 flex-col transition-[border-color,box-shadow] duration-200 ease-soft hover:border-border hover:shadow-card-hover",
        CARD_SURFACE_CLASS,
        className,
      )}
      data-hub-card=""
      {...rest}
    >
      <div className="relative aspect-video overflow-hidden rounded-t-lg bg-primary-soft">
        {cover}
        {chip && <span className="absolute left-2.5 top-2.5 z-10 max-w-[70%] truncate">{chip}</span>}
        {corner && <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">{corner}</div>}
        {coverOverlay && <div className="absolute inset-x-2.5 bottom-2 z-10 flex items-center gap-1.5">{coverOverlay}</div>}
      </div>
      <div className={cn(HUB_CARD_BODY_CLASS, "flex min-w-0 flex-col px-3.5 py-3")}>
        <h3 className="min-w-0 truncate font-display text-[1.0625rem] font-bold leading-tight tracking-[-0.01em] text-text">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary">
            {title}
          </Link>
        </h3>
        {meta && <div className="mt-0.5 min-w-0 truncate text-caption text-text-muted">{meta}</div>}
        <div className="relative z-10 mt-auto flex min-h-8 min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center">{footerStart}</div>
          <div className="flex shrink-0 items-center gap-1.5">{footerEnd}</div>
        </div>
      </div>
      {extra}
    </li>
  );
}

/** Yüklenirken kartın yerini tutan iskelet (aynı 16:9 kapak + sabit gövde: kayma yok). */
export function HubCardSkeleton() {
  return (
    <li aria-hidden className="overflow-hidden rounded-lg border border-border-soft bg-surface">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className={cn(HUB_CARD_BODY_CLASS, "space-y-2 px-3.5 py-3")}>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </li>
  );
}

/** Kart alt satırının üye yüzleri: örtüşen avatarlar + "+N". */
export function HubFaces({ children, more }: { children: ReactNode; more?: number }) {
  return (
    <span className="flex min-w-0 items-center" data-hub-faces="">
      <span className="flex items-center [&>*]:-ml-1.5 [&>*]:rounded-full [&>*]:ring-2 [&>*]:ring-surface [&>*:first-child]:ml-0">{children}</span>
      {more !== undefined && more > 0 && <span className="ml-1.5 whitespace-nowrap text-caption text-text-muted">+{more}</span>}
    </span>
  );
}

/** Durum rozeti (kartın sağ altı). */
export function HubBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "primary" | "success" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold",
        tone === "primary" && "bg-primary-soft text-primary",
        tone === "success" && "bg-success/10 text-success",
        tone === "warning" && "bg-warning/10 text-warning",
        tone === "neutral" && "bg-surface-soft text-text-secondary",
      )}
    >
      {children}
    </span>
  );
}

/**
 * İç sayfa bandı: solda 16:9 (telefonda kare) kapak, ortada geri bağlantısı + tür etiketleri + başlık + alt bilgi, `xl`+'ta sağda, daha dar
 * ekranda altta eylem satırı. `backdrop` kapağın bulanık kopyasıyla bandı boyar (verilmezse marka tonu).
 */
export function HubDetailBand({
  art,
  backdrop,
  backHref,
  backLabel,
  backAttrs,
  kicker,
  title,
  byline,
  description,
  actions,
  menu,
  className,
  ...rest
}: {
  art: ReactNode;
  backdrop?: ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Geri bağlantısına eklenen veri öznitelikleri. */
  backAttrs?: Record<`data-${string}`, string>;
  /** Başlığın üstündeki tür/görünürlük etiketleri. */
  kicker?: ReactNode;
  title: ReactNode;
  byline?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  menu?: ReactNode;
  className?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <header className={cn("relative isolate rounded-lg border border-border-soft bg-primary-soft", className)} data-hub-detail-band="" {...rest}>
      {backdrop && (
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden rounded-lg">
          <div className="absolute inset-0 scale-150 opacity-70 blur-3xl saturate-150">{backdrop}</div>
          <div className="absolute inset-0 bg-background/55" />
        </div>
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 md:gap-x-5 md:p-5 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-xl border-2 border-surface bg-surface shadow-pop md:aspect-video md:w-32 xl:w-44" data-hub-band-art="">
          {art}
        </div>
        <div className="min-w-0 space-y-1.5">
          {(backHref || kicker) && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
              {backHref && (
                <Link href={backHref} aria-label={backLabel} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface/70 text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-hub-back="" {...backAttrs}>
                  <ArrowLeft size={16} aria-hidden />
                </Link>
              )}
              {kicker}
            </div>
          )}
          <div className="min-w-0 [&>h1]:break-words [&>h1]:font-display [&>h1]:text-h2 [&>h1]:font-extrabold [&>h1]:text-text md:[&>h1]:text-h1">{title}</div>
          {byline && <div className="min-w-0 text-small text-text-secondary">{byline}</div>}
          {description && <div className="line-clamp-2 min-w-0 max-w-3xl whitespace-pre-line break-words text-small text-text-secondary">{description}</div>}
        </div>
        {(actions || menu) && (
          <div className="col-span-2 flex flex-wrap items-center gap-2 xl:col-span-1" data-hub-band-actions="">
            {actions}
            {menu}
          </div>
        )}
      </div>
    </header>
  );
}

/** İç sayfa gövdesi: içerik + `xl`+ sağ "Hakkında" sütunu (300 px). Yan sütun yoksa içerik tam genişlik. */
export function HubDetailLayout({ children, aside, asideLabel }: { children: ReactNode; aside?: ReactNode; asideLabel?: string }) {
  return (
    <div className={cn("min-w-0", aside && "xl:grid xl:grid-cols-[minmax(0,1fr)_18.75rem] xl:items-start xl:gap-7")}>
      <div className="min-w-0 space-y-4 sm:space-y-5">{children}</div>
      {aside && (
        <aside className="hidden space-y-3 xl:sticky xl:top-20 xl:block" aria-label={asideLabel} data-testid="hub-aside">
          {aside}
        </aside>
      )}
    </div>
  );
}
