"use client";

import Link from "next/link";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import { LayoutDashboard } from "@/components/icons/layout-dashboard";
import { List } from "@/components/icons/list";
import type { IconComponent } from "@/components/icons/icon";
import { Plus } from "@/components/icons/plus";
import { Button, buttonClassName } from "@/components/ui/button";
import { CARD_SURFACE_CLASS } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PAGE_GUTTER_CLASS, PAGE_WIDTH_CLASS } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { CONTROL_ICON_BUTTON } from "@/features/content/section-menu";
import { useTranslation } from "@/lib/i18n/language-provider";

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
export const HUB_PAGE_CLASS = `mx-auto w-full ${PAGE_WIDTH_CLASS.hub} ${PAGE_GUTTER_CLASS} pb-16 pt-4 sm:pt-6 lg:pt-7`;

/** Ağır/stabil düzen (docs/history/458-*): üç alanda aynı nötr simge karosu; `tone` imzası korunur ama artık renk taşımaz. */
const HUB_BAND_TONE = { primary: "bg-surface-soft text-text-secondary", secondary: "bg-surface-soft text-text-secondary", neutral: "bg-surface-soft text-text-secondary" } as const;

/**
 * Düz başlık yüzeyi (Yön D "Merkez"): bant + sekmeler tek beyaz yüzeyde, sayfa kenarına kadar uzanır, altında tek ince çizgi.
 * Sekmelerin kendi alt çizgisi şeffaflaşır (yüzeyin çizgisi tam genişliktedir). Yalnız görünümdür; içindeki bileşenlerin davranışı değişmez.
 */
export function HubHeader({ children, className, ...rest }: { children: ReactNode; className?: string; [data: `data-${string}`]: string | undefined }) {
  return (
    <div
      className={cn(
        "-mx-3 -mt-4 space-y-3 border-b border-border-soft bg-surface px-3 pt-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6 lg:-mx-8 lg:-mt-7 lg:px-8 lg:pt-7 [&_[role=tablist]]:border-transparent",
        className,
      )}
      data-hub-header=""
      {...rest}
    >
      {children}
    </div>
  );
}

/** Detay bandındaki ⋮ düğmesi (docs/history/420-*): üç alanda aynı 40 px kenarlıklı yuvarlak; menüyü kendi bileşeni çizer. */
export const HUB_BAND_MENU_BUTTON_CLASS =
  "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface/80 text-text transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Ana sayfa bandı. Telefonda düğme kısa etiketle aynı satırda kalır. */
export function HubBand({
  icon: Icon,
  title,
  description,
  action,
  testId,
  tone = "primary",
  ...rest
}: {
  icon: IconComponent;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Alanın simge tonu (P1-4): Topluluk mavi, Space turuncu ("senin olan"), Ekip nötr — üç ana sayfa ilk bakışta ayrışsın. */
  tone?: "primary" | "secondary" | "neutral";
  testId?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <div className="flex items-center gap-3 sm:gap-4" data-hub-band="" data-testid={testId} {...rest}>
      <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-lg", HUB_BAND_TONE[tone])}>
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

/** Özet şeridi (Yön D): tek çerçevede 2–4 kutu (etiket + büyük sayı). Telefonda 2×2, `lg`+'ta tek satır. Sayılar çağıranın elindeki GERÇEK değerlerdir. */
export function HubStatStrip({ items, className }: { items: { key: string; label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 rounded-lg card-flat", items.length >= 4 ? "lg:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : undefined, className)} data-hub-stats="">
      {items.map((item, index) => (
        <div key={item.key} className={cn("min-w-0 border-border-soft px-4 py-3", index > 0 && "lg:border-l", index % 2 === 1 && "max-lg:border-l", index >= 2 && "max-lg:border-t")} data-hub-stat={item.key}>
          <dt className="truncate text-small text-text-muted">{item.label}</dt>
          <dd className="mt-0.5 font-display text-h2 font-bold text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Tablo (Yön D, docs/history/459-*): üç alanın liste ekranlarında ortak çizgili tablo. Sütun şablonları üç kırılım içindir
 * (`cols` masaüstü · `colsMd` tablet · `colsSm` telefon); satırdaki hücreler `HUB_COL_LG` (yalnız masaüstü) ya da `HUB_COL_MD`
 * (tablet ve masaüstü) ile saklanır — saklanan hücre sayısı şablondaki sütun sayısına uymalıdır. Başlık satırı telefonda görünmez.
 */
export const HUB_ROW_GRID = "grid grid-cols-[var(--hub-cols-sm)] items-center gap-x-4 px-4 md:grid-cols-[var(--hub-cols-md)] lg:grid-cols-[var(--hub-cols)]";
export const HUB_COL_MD = "max-md:hidden";
export const HUB_COL_LG = "max-lg:hidden";

export function HubTable({
  label,
  cols,
  colsMd,
  colsSm = "minmax(0,1fr) auto",
  head,
  children,
  footer,
  className,
  ...rest
}: {
  label: string;
  cols: string;
  colsMd?: string;
  colsSm?: string;
  head?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  const style = { "--hub-cols": cols, "--hub-cols-md": colsMd ?? cols, "--hub-cols-sm": colsSm } as CSSProperties;
  return (
    <div role="table" aria-label={label} style={style} className={cn("overflow-hidden rounded-lg card-flat", className)} data-hub-table="" {...rest}>
      {head && (
        <div role="row" className={cn(HUB_ROW_GRID, "min-h-10 bg-surface-soft text-caption font-semibold text-text-muted max-md:hidden")}>
          {head}
        </div>
      )}
      {children}
      {footer && <div className="border-t border-border-soft bg-surface-soft px-4 py-2.5 text-small text-text-muted">{footer}</div>}
    </div>
  );
}

/** Tablo gövdesi (`ul role=rowgroup`): satırlar `HubRow` (`li role=row`). */
export function HubTableBody({ children, className, ...rest }: { children: ReactNode; className?: string; [data: `data-${string}`]: string | undefined }) {
  return (
    <ul role="rowgroup" className={className} {...rest}>
      {children}
    </ul>
  );
}

/** Satır: sütun şablonunu üstten alır; adın bağlantısı satırı kaplar (`HUB_ROW_LINK_CLASS`), satırdaki düğmeler `relative z-10` ile üstte kalır. */
export function HubRow({ children, className, ...rest }: { children: ReactNode; className?: string; [data: `data-${string}`]: string | undefined }) {
  return (
    <li
      role="row"
      className={cn(HUB_ROW_GRID, "relative min-h-16 border-t border-border-soft py-2 transition-colors first:border-t-0 hover:bg-surface-soft focus-within:bg-surface-soft", className)}
      data-hub-card=""
      {...rest}
    >
      {children}
    </li>
  );
}
export const HUB_ROW_LINK_CLASS = "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary";

/** Liste görünümü tercihi (tablo ↔ kart): alan başına cihazda saklanır; aynı alanı okuyan tüm bileşenler birlikte güncellenir. */
export type HubView = "table" | "cards";
const hubViewListeners = new Set<() => void>();
const hubViewKey = (area: string) => `promptly-hub-view-${area}`;
export function readHubView(area: string): HubView {
  try {
    return localStorage.getItem(hubViewKey(area)) === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}
export function useHubView(area: string): [HubView, (next: HubView) => void] {
  const view = useSyncExternalStore(
    (notify) => {
      hubViewListeners.add(notify);
      window.addEventListener("storage", notify);
      return () => {
        hubViewListeners.delete(notify);
        window.removeEventListener("storage", notify);
      };
    },
    () => readHubView(area),
    () => "table" as HubView,
  );
  const set = (next: HubView) => {
    try {
      localStorage.setItem(hubViewKey(area), next);
    } catch {
      // Tercih yalnız bu sayfa açıkken kalır.
    }
    hubViewListeners.forEach((notify) => notify());
  };
  return [view, set];
}

/** Kontrol satırındaki tablo ↔ kart anahtarı (tek simge düğmesi: şu an olmayan görünümü önerir). */
export function HubViewToggle({ view, onChange }: { view: HubView; onChange: (next: HubView) => void }) {
  const { t } = useTranslation();
  const label = t(view === "table" ? "hub.view.cards" : "hub.view.table");
  return (
    <button type="button" onClick={() => onChange(view === "table" ? "cards" : "table")} aria-label={label} title={label} data-hub-view-toggle={view} className={CONTROL_ICON_BUTTON}>
      {view === "table" ? <LayoutDashboard size={24} aria-hidden /> : <List size={24} aria-hidden />}
    </button>
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
    <Button type="button" onClick={onClick} title={label} aria-label={label} data-testid={testId} className="h-10 shrink-0 rounded-full px-4 sm:px-5" {...attr}>
      <Plus size={20} aria-hidden />
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
      className={cn("flex h-[3.75rem] items-center gap-3 rounded-lg card-flat pl-4 pr-3 shadow-card", onAction && "cursor-pointer")}
      data-testid={testId}
      data-hub-attention=""
      // Şeridin boş yerine dokunmak da eylemi çalıştırır (düğme kendi tıklamasını zaten işler).
      onClick={onAction ? (event) => !(event.target as HTMLElement).closest("button,a") && onAction() : undefined}
    >
      <span className="grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center rounded-md bg-warning-soft text-warning">
        <Icon size={20} aria-hidden />
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
export const HUB_GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3";

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
      <div className={cn(HUB_CARD_BODY_CLASS, "flex min-w-0 flex-col px-4 py-3")}>
        <h3 className="min-w-0 truncate font-display text-h3 font-bold leading-tight tracking-[-0.01em] text-text">
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
    <li aria-hidden className="overflow-hidden rounded-lg card-flat">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className={cn(HUB_CARD_BODY_CLASS, "space-y-2 px-4 py-3")}>
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
    <Badge variant={tone === "primary" ? "default" : tone} className="shrink-0 whitespace-nowrap">
      {children}
    </Badge>
  );
}

/**
 * İç sayfa bandı: üstte tam genişlikli satır (solda geri oku + tür etiketleri, sağ üst köşede ⋮ `menu`), altında solda 16:9 (telefonda kare) kapak, ortada başlık + alt bilgi, `xl`+'ta sağda, daha dar
 * ekranda altta eylem satırı. Düz yüzey: bulanık kapak arka planı yoktur (docs/history/458-*).
 */
export function HubDetailBand({
  art,
  backHref,
  backLabel,
  backAttrs,
  crumbs,
  kicker,
  title,
  byline,
  description,
  actions,
  menu,
  tabs,
  className,
  ...rest
}: {
  art: ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Geri bağlantısına eklenen veri öznitelikleri. */
  backAttrs?: Record<`data-${string}`, string>;
  /** Sayfa yolu (Yön D): "Spaces › Ad". Son öğe bağlantısızdır; telefonda gizlenir. */
  crumbs?: { label: string; href?: string }[];
  /** Başlığın üstündeki tür/görünürlük etiketleri. */
  kicker?: ReactNode;
  title: ReactNode;
  byline?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  menu?: ReactNode;
  /** Sekmeler (Yön D): bandın altında, ince çizgiyle ayrılmış satırda; sekmelerin kendi alt çizgisi şeffaflaşır. */
  tabs?: ReactNode;
  className?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <header className={cn("relative isolate rounded-lg card-flat", className)} data-hub-detail-band="" {...rest}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 md:gap-x-5 md:p-5 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* Üst satır bandın tam genişliğidir: geri oku + etiketler SOLA, ⋮ menüsü SAĞ ÜST köşeye dayanır (telefonda da; menü paneli sağa hizalı açıldığı için ekran dışına taşmaz). */}
        {(backHref || kicker || menu || (crumbs && crumbs.length > 0)) && (
          <div className="col-span-full flex min-w-0 items-start justify-between gap-2" data-hub-band-top="">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
              {backHref && (
                <Link href={backHref} aria-label={backLabel} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface/70 text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-hub-back="" {...backAttrs}>
                  <ArrowLeft size={16} aria-hidden />
                </Link>
              )}
              {crumbs && crumbs.length > 0 && (
                <nav aria-label={t("hub.crumbs")} className="flex min-w-0 items-center gap-1 max-sm:hidden" data-hub-crumbs="">
                  {crumbs.map((crumb, index) => (
                    <span key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-1">
                      {index > 0 && <ChevronRight size={12} aria-hidden className="shrink-0 text-text-muted" />}
                      {crumb.href ? (
                        <Link href={crumb.href} className="truncate hover:text-text hover:underline">
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="truncate font-semibold text-text" aria-current="page">
                          {crumb.label}
                        </span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
              {kicker}
            </div>
            {menu && <div className="shrink-0" data-hub-band-menu="">{menu}</div>}
          </div>
        )}
        <div className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-xl border-2 border-surface bg-surface shadow-card md:aspect-video md:w-32 xl:w-44" data-hub-band-art="">
          {art}
        </div>
        <div className="min-w-0 space-y-1.5">
          <div className="min-w-0 [&>h1]:break-words [&>h1]:font-display [&>h1]:text-h2 [&>h1]:font-extrabold [&>h1]:text-text md:[&>h1]:text-h1">{title}</div>
          {byline && <div className="min-w-0 text-small text-text-secondary">{byline}</div>}
          {description && <div className="line-clamp-2 min-w-0 max-w-3xl whitespace-pre-line break-words text-small text-text-secondary">{description}</div>}
        </div>
        {actions && (
          <div className="col-span-2 flex flex-wrap items-center gap-2 xl:col-span-1" data-hub-band-actions="">
            {actions}
          </div>
        )}
      </div>
      {tabs && (
        <div className="border-t border-border-soft px-2 md:px-4 [&_[role=tablist]]:border-transparent" data-hub-band-tabs="">
          {tabs}
        </div>
      )}
    </header>
  );
}

/** İç sayfa gövdesi: içerik + `xl`+ sağ "Hakkında" sütunu (300 px). Yan sütun yoksa içerik tam genişlik. */
export function HubDetailLayout({ children, aside, asideLabel }: { children: ReactNode; aside?: ReactNode; asideLabel?: string }) {
  return (
    <div className={cn("min-w-0", aside && "xl:grid xl:grid-cols-[minmax(0,1fr)_var(--aside-w)] xl:items-start xl:gap-7")}>
      <div className="min-w-0 space-y-4 sm:space-y-5">{children}</div>
      {aside && (
        <aside className="hidden space-y-3 xl:sticky xl:top-20 xl:block" aria-label={asideLabel} data-testid="hub-aside">
          {aside}
        </aside>
      )}
    </div>
  );
}
