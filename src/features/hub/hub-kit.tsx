"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { Button, buttonClassName } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CARD_SURFACE_CLASS } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PAGE_GUTTER_CLASS, PAGE_WIDTH_CLASS } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { usePhoneDuplicateClass } from "@/components/layout/phone-title";

/**
 * Hub düzeni (docs/history/379-*): Spaces, Topluluklar ve Ekipler'in ana sayfaları ile iç sayfaları TEK iskeleti paylaşır.
 *
 * Ana sayfa (docs/history/474-*, "Stil 2 · Kart ızgarası"): `HubBand` (başlık · açıklama · tek birincil düğme) → altı çizgili `Tabs variant="hub"` →
 * `HubControls` (sayı · arama · "Yalnız yeni") → `HubAttentionStrip` (davet/bekleyen iş, tek satır) → `HubGrid` içinde `HubCard`'lar.
 * İç sayfa: `HubDetailBand` (kapak · tür etiketi · başlık · alt bilgi · eylemler) → aynı `Tabs` → `HubDetailLayout` (içerik + "Hakkında" yan sütunu).
 *
 * Yeni bir Space/Topluluk/Ekip ekranı yazarken bu parçaları kullan; ikinci bir bant, sekme çubuğu ya da kart gövdesi çizme.
 */

/** Sayfa kabuğu: telefonda 12, tablette 24, masaüstünde 32 px kenar boşluğu — üç alanda aynı genişlik. */
export const HUB_PAGE_CLASS = `mx-auto w-full ${PAGE_WIDTH_CLASS.hub} ${PAGE_GUTTER_CLASS} pb-16 pt-4 sm:pt-6 lg:pt-8`;

/** Detay bandındaki ⋮ düğmesi (docs/history/420-*): üç alanda aynı 40 px kenarlıklı yuvarlak; menüyü kendi bileşeni çizer. */
export const HUB_BAND_MENU_BUTTON_CLASS =
  "grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-border bg-surface/80 text-text transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/**
 * Ana sayfa bandı (Stil 2): solda büyük başlık + açıklama, sağda tek birincil düğme. Başlık telefonda üst çubuktaki adla aynı olduğundan gizlidir;
 * düğme telefonda açıklamanın altında tam genişliktir.
 */
export function HubBand({
  title,
  description,
  action,
  testId,
  ...rest
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  const duplicate = usePhoneDuplicateClass(title);
  return (
    <div className="mb-5 flex flex-wrap items-start gap-4 max-sm:mb-3 max-sm:gap-3" data-hub-band="" data-testid={testId} {...rest}>
      <div className="min-w-[16.25rem] flex-1 max-sm:min-w-[13.75rem]">
        <h1 className={cn("mb-1.5 text-h1 font-bold text-text", duplicate)}>{title}</h1>
        {description && <p className="max-w-[35rem] text-body text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Bandın tek birincil düğmesi ("Yeni Space", "Topluluk oluştur", "Ekip oluştur"): telefonda tam genişlik, 44 px. */
export function HubCreateButton({
  label,
  onClick,
  testId,
  attr,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
  /** Eski testlerin bulduğu veri özniteliği (ör. `data-create-community`). */
  attr?: Record<`data-${string}`, string | boolean>;
}) {
  return (
    <Button type="button" onClick={onClick} title={label} aria-label={label} data-testid={testId} className="h-11 w-full shrink-0 px-5 sm:h-10 sm:w-auto" {...attr}>
      {label}
    </Button>
  );
}

/** "Yalnız yeni" gibi tek tıkla açılıp kapanan süzgeç: 40 px, açıkken turuncu çerçeve + yumuşak zemin. */
export function HubFilterChip({ selected, onClick, children, ...rest }: { selected: boolean; onClick: () => void; children: ReactNode; [data: `data-${string}`]: string | undefined }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center rounded-sm border px-[0.875rem] text-small font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        selected ? "border-primary bg-primary-soft text-primary-text" : "border-border-strong bg-surface text-text hover:bg-surface-soft",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Kontrol satırı (Stil 2): solda sayı metni, sağda arama kutusu (telefonda tam genişlik, kendi satırında) ve süzgeç çipleri (`children`:
 * `HubFilterChip`, sayfaya özgü ek denetimler). Arama yazdıkça listeyi süzer; `onSubmit` verilirse Enter genel aramaya gider.
 */
export function HubControls({
  count,
  query,
  onQuery,
  label,
  onSubmit,
  children,
  hideSearch,
}: {
  count?: ReactNode;
  query: string;
  onQuery: (value: string) => void;
  /** Aramanın erişilebilir adı ("Ekip ara…"); kutuda kısa "Ara…" yazar. */
  label: string;
  onSubmit?: () => void;
  children?: ReactNode;
  hideSearch?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="my-[0.875rem] flex flex-wrap items-center gap-[0.625rem]" data-hub-controls="">
      <span className="min-w-[5.625rem] flex-1 text-small text-text-muted" aria-live="polite">
        {count}
      </span>
      {!hideSearch && (
        <form
          role="search"
          className="w-full shrink-0 sm:w-[13.75rem]"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.();
          }}
        >
          <SearchField dense value={query} onChange={onQuery} placeholder={t("hub.search")} aria-label={label} clearLabel={t("common.clear")} data-hub-search="" />
        </form>
      )}
      {children}
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

/** Kartın sol üst tür etiketi / sağ üst rozeti ve ⋮ düğmesi (kapağın üstünde yüzer; kartın bağlantısının üstünde `relative z-10`). */
export const HUB_CARD_CHIP_CLASS = "rounded-xs bg-surface px-2 py-[3px] text-caption font-semibold text-text";
/** Sağ üst köşedeki "N yeni" / "2 onay" gibi dikkat rozeti (kapağın rengi ne olursa olsun okunsun diye beyaz zemin, turuncu metin). */
export const HUB_CARD_BADGE_CLASS = "rounded-xs bg-surface px-2 py-[3px] text-caption font-semibold text-primary-text";
export const HUB_CARD_CORNER_BUTTON_CLASS =
  "grid h-8 w-8 place-items-center rounded-sm bg-surface/90 text-text-secondary shadow-xs transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** Kartın alt satırındaki küçük eylem düğmesi (36 px): birincil (Aç, Katıl) ya da kenarlıklı (tamamlanmış durum). */
export const HUB_CARD_ACTION_CLASS = "h-9 shrink-0 px-[0.875rem] text-label";

/** Kapak ve gövde yükseklikleri (Stil 2): kapak 150 (telefonda 132) px, gövde 112 px — üç alanda her kart aynı boyda. */
export const HUB_CARD_COVER_CLASS = "h-[9.375rem] max-sm:h-[8.25rem]";
export const HUB_CARD_BODY_CLASS = "h-28";

/**
 * Tek kart (üç alanda aynı): sabit yükseklikli kapak + sabit yükseklikli gövde. Başlık bağlantısı kartın tamamını kaplar (`after:inset-0`),
 * kapağın köşe öğeleri ve alt satır `relative z-10` ile üstünde kalır; kart yığın bağlamı kurmaz (⋮ menüsü sonraki kartın üstüne açılabilsin).
 * Gövde: başlık · tek satır açıklama · alt satır (solda küçük özet `footerStart`, sağda tek eylem `footerEnd`).
 */
export function HubCard({
  href,
  title,
  description,
  cover,
  chip,
  badge,
  corner,
  coverOverlay,
  footerStart,
  footerEnd,
  extra,
  className,
  ...rest
}: {
  /** Kartın bağlantısı; verilmezse (davet gibi henüz açılamayan kart) başlık düz metindir ve kart tıklanmaz. */
  href?: string;
  title: ReactNode;
  /** Başlığın altındaki tek satır açıklama. */
  description?: ReactNode;
  /** Kapağın içi: kapsayıcıyı dolduran görsel/çizim. */
  cover: ReactNode;
  /** Sol üst tür etiketi. */
  chip?: ReactNode;
  /** Sağ üst köşede ⋮ menüsünün solundaki dikkat rozeti ("3 yeni"). */
  badge?: ReactNode;
  /** Sağ üst köşe (Sabitle, ⋮ menüsü). */
  corner?: ReactNode;
  /** Kapağın alt kenarına konan küçük öğe (palet çizgisi). */
  coverOverlay?: ReactNode;
  /** Alt satırın solu (küçük özet: üye sayısı · rol) ve sağı (tek eylem düğmesi). */
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
      <div className={cn("relative overflow-hidden rounded-t-lg bg-primary-soft", HUB_CARD_COVER_CLASS)}>
        {cover}
        {chip && <span className="absolute left-3 top-3 z-10 max-w-[60%] truncate">{chip}</span>}
        {(badge || corner) && (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
            {badge}
            {corner}
          </div>
        )}
        {coverOverlay && <div className="absolute inset-x-3 bottom-2 z-10 flex items-center gap-1.5">{coverOverlay}</div>}
      </div>
      <div className={cn(HUB_CARD_BODY_CLASS, "flex min-w-0 flex-col gap-1 px-[0.875rem] py-3")}>
        <h3 className="min-w-0 truncate text-h3 font-bold leading-tight text-text">
          {href ? (
            <Link href={href} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        <div className="min-w-0 truncate text-small text-text-muted">{description}</div>
        <div className="relative z-10 mt-auto flex min-h-9 min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-label text-text-muted">{footerStart}</div>
          <div className="flex shrink-0 items-center gap-1.5">{footerEnd}</div>
        </div>
      </div>
      {extra}
    </li>
  );
}

/** Yüklenirken kartın yerini tutan iskelet (aynı kapak + gövde yüksekliği: kayma yok). */
export function HubCardSkeleton() {
  return (
    <li aria-hidden className="overflow-hidden rounded-lg card-flat">
      <Skeleton className={cn("w-full rounded-none", HUB_CARD_COVER_CLASS)} />
      <div className={cn(HUB_CARD_BODY_CLASS, "space-y-2 px-[0.875rem] py-3")}>
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
 * Telefonda (`< md`) iç sayfa bandı ve altındaki sekmeler kenardan kenara akar (mockup: bant üst çubuğun hemen altında, köşesiz). Sayfa kabuğunun
 * kenar boşluğu `sm` altında 12, `sm`–`md` arasında 24 px olduğundan negatif boşluk ikisini ayrı karşılar.
 */
export const HUB_BLEED_CLASS = "max-sm:-mx-3 sm:max-md:-mx-6";
export const HUB_BLEED_TOP_CLASS = "max-sm:-mt-4 sm:max-md:-mt-6";
/** Bandın altındaki sekme çubuğu telefonda kenardan kenara; ilk sekmenin yazısı bant içeriğiyle (16 px) hizalanır. */
export const HUB_PHONE_TABS_CLASS = cn(HUB_BLEED_CLASS, "max-md:[&_[role=tablist]]:px-1");

/** Detay bandındaki ⋮ düğmesinin 48 px'lik hâli (Topluluk ve Space'in büyük birincil düğmesinin yanında). */
export const HUB_BAND_MENU_BUTTON_LG_CLASS = "h-12 w-12";

/** Bant kapağının üç boyutu (mockup): Ekip için küçük, Topluluk için büyük; köşe yarıçapı boyutla birlikte büyür. */
const BAND_ART_SIZE: Record<"sm" | "lg", string> = {
  sm: "size-14 rounded-md md:size-20 md:rounded-lg xl:size-26 xl:rounded-xl",
  lg: "size-18 rounded-lg md:size-22 md:rounded-lg xl:size-30 xl:rounded-xl",
};

/**
 * İç sayfa bandı (mockup "Ekip · Merkez bandı" / "Topluluk · Albüm bandı"): kare kapak solda, yanında başlık + tek satır alt bilgi; `md+`'da
 * başlığın üstünde etiketler (`kicker`), altında açıklama ve üye yüzleri (`faces`), sağda eylemler + ⋮ `menu`. Telefonda kapak ve başlık tek satır, altında
 * açıklama, en altta tam genişlik birincil düğme + ⋮ gelir (birincil düğme `max-md:flex-1` alır). `backdrop` kapağın bulanık kopyasıyla bandı boyar
 * (verilmezse marka tonu). Geri oku YOKTUR: dönüş yan menü / üst çubuktadır (mockup).
 */
export function HubDetailBand({
  art,
  artSize = "sm",
  backdrop,
  kicker,
  title,
  byline,
  description,
  faces,
  actions,
  menu,
  className,
  ...rest
}: {
  art: ReactNode;
  artSize?: "sm" | "lg";
  backdrop?: ReactNode;
  /** Başlığın üstündeki tür/görünürlük etiketleri (yalnız `md+`; telefonda bilgi alt satıra taşınır). */
  kicker?: ReactNode;
  title: ReactNode;
  byline?: ReactNode;
  description?: ReactNode;
  /** Başlığın altındaki üye yüzleri (yalnız `md+`). */
  faces?: ReactNode;
  actions?: ReactNode;
  menu?: ReactNode;
  className?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <header
      className={cn(
        "relative isolate bg-primary-soft",
        "max-md:rounded-none md:rounded-lg md:border md:border-border-soft xl:rounded-xl",
        HUB_BLEED_CLASS,
        HUB_BLEED_TOP_CLASS,
        className,
      )}
      data-hub-detail-band=""
      {...rest}
    >
      {backdrop && (
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden md:rounded-lg xl:rounded-xl">
          <div className="absolute inset-0 scale-150 opacity-70 blur-3xl saturate-150">{backdrop}</div>
          <div className="absolute inset-0 bg-background/55" />
        </div>
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 p-4 md:grid-cols-[auto_minmax(12rem,1fr)_auto] md:gap-x-5 md:p-5 xl:gap-x-6 xl:px-7 xl:py-6">
        <div className={cn("relative shrink-0 overflow-hidden bg-surface md:row-span-3", BAND_ART_SIZE[artSize])} data-hub-band-art="">
          {art}
        </div>
        <div className="col-start-2 row-start-1 min-w-0">
          {kicker && <div className="mb-1.5 hidden min-w-0 flex-wrap items-center gap-2 text-caption text-text-secondary md:flex" data-hub-band-kicker="">{kicker}</div>}
          <div className="min-w-0 [&>h1]:break-words [&>h1]:font-display [&>h1]:text-h2 [&>h1]:font-bold [&>h1]:text-text md:[&>h1]:text-h1">{title}</div>
          {byline && <div className="mt-0.5 min-w-0 text-caption text-text-secondary md:mt-1.5">{byline}</div>}
        </div>
        {description && (
          <div className="col-span-2 row-start-2 mt-3 line-clamp-3 min-w-0 whitespace-pre-line break-words font-serif text-small text-text-secondary md:col-span-1 md:col-start-2 md:mt-2 md:line-clamp-2 md:max-w-xl md:text-body" data-hub-band-description="">
            {description}
          </div>
        )}
        {faces && <div className="mt-3 hidden min-w-0 md:col-start-2 md:row-start-3 md:block" data-hub-band-faces="">{faces}</div>}
        {(actions || menu) && (
          <div className="col-span-2 row-start-3 mt-3 flex min-w-0 items-center gap-2 md:col-span-1 md:col-start-3 md:row-span-3 md:row-start-1 md:mt-0 md:max-w-sm md:self-center xl:max-w-none" data-hub-band-actions="">
            {actions}
            {menu && <div className="shrink-0" data-hub-band-menu="">{menu}</div>}
          </div>
        )}
      </div>
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
