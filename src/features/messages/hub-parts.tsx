"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BellOff } from "@/components/icons/bell-off";
import { Check } from "@/components/icons/check";
import { ChevronLeft } from "@/components/icons/chevron-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import { Pin } from "@/components/icons/pin";
import { Plus } from "@/components/icons/plus";
import { CONTROL_ICON_BUTTON } from "@/features/content/section-menu";
import { MuteChip } from "@/features/teams/mute-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, formatUnread } from "@/lib/utils";

/**
 * Ekip / proje / topluluk KANAL LİSTESİNİN ortak iskeleti (docs/history/369-*, 381-*): Mesajlar sohbet listesinin YERİNE açılır — bilgisayarda sol sütun
 * (`embedded`), telefonda sayfa — ve sohbet listesiyle aynı dili konuşur: aynı satırlar, kontrol satırı, ⋮ menüsü ve seçim modu.
 * Üç görünüm (`team-hub-view`, `community-hub-view`) aynı parçaları kullanır, ikinci iskelet yazma.
 */
export function HubFrame({ kind, embedded, children }: { kind: "team" | "project" | "community"; embedded: boolean; children: ReactNode }) {
  return (
    <div data-hub={kind} data-hub-embedded={embedded ? "" : undefined} className={cn("flex min-h-0 flex-1 flex-col", embedded ? "" : "mx-auto w-full max-w-3xl px-0 pb-6 pt-1 sm:px-5 sm:pt-3")}>
      {children}
    </div>
  );
}

/** Başlık bölgesi: geri bağlantısı (üst düzeye), kimlik bandı (karo + ad + alt bilgi), sessize alma kartı. Seçim modunda yerine `SelectionHeader` gelir. */
export function HubHeader({
  backHref,
  backLabel,
  topRight,
  media,
  title,
  meta,
  muteCard,
}: {
  backHref: string;
  backLabel: string;
  topRight?: ReactNode;
  media: ReactNode;
  title: string;
  meta: string;
  muteCard?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-4 pt-2">
      <div className="mb-1 flex items-center gap-1">
        <Link
          href={backHref}
          data-hub-back
          aria-label={t("hub.backTo", { name: backLabel })}
          className="-ml-2 inline-flex h-10 min-w-0 items-center gap-0.5 rounded-full pl-1 pr-3 text-small font-bold text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft size={20} aria-hidden className="shrink-0" />
          <span className="truncate">{backLabel}</span>
        </Link>
        <span className="flex-1" />
        {topRight}
      </div>
      <div className="flex items-center gap-3.5 pb-3 pt-1">
        {media}
        <div className="min-w-0">
          <h1 data-hub-title className="truncate font-display text-h2 font-extrabold leading-[1.15] tracking-[-0.02em] text-text">
            {title}
          </h1>
          <p data-hub-meta className="truncate text-small text-text-muted">
            {meta}
          </p>
        </div>
      </div>
      {muteCard && <div className="pb-2.5">{muteCard}</div>}
    </div>
  );
}

/** Başlığın sağındaki küçük yuvarlak bağlantı (ekip/topluluk/proje sayfasına). */
export function HubTopLink({ href, label, dataAttr, children }: { href: string; label: string; dataAttr: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      {...{ [dataAttr]: "" }}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </Link>
  );
}

/** Kontrol satırındaki "+" (kanal / oda ekle): sohbet listesindeki "+" ile aynı görünüm. Bağlantı ya da düğme olabilir. */
export function HubAddButton({ label, href, onClick, dataAttr }: { label: string; href?: string; onClick?: () => void; dataAttr: string }) {
  const className = cn(CONTROL_ICON_BUTTON, "bg-surface-soft hover:bg-border-soft");
  const attr = { [dataAttr]: "" };
  return href ? (
    <Link href={href} {...attr} aria-label={label} title={label} className={className}>
      <Plus size={22} strokeWidth={1.75} aria-hidden />
    </Link>
  ) : (
    <button type="button" onClick={onClick} {...attr} aria-label={label} title={label} className={className}>
      <Plus size={22} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** Kaydırılan gövde: masaüstü sütununda kendi kaydırması, telefonda sayfa kaydırır. Seçim çubuğu telefonda ekrana sabit olduğundan altta boşluk kalır. */
export function HubBody({ embedded, selecting, children }: { embedded: boolean; selecting: boolean; children: ReactNode }) {
  // Sütunda içerik kısaysa seçim çubuğu (`mt-auto`) sütunun altına yapışsın diye gövde dikeyde esner.
  return (
    <div className={cn("min-h-0 flex-1", embedded && "overflow-y-auto", selecting && !embedded && "pb-28")}>
      {embedded ? <div className="flex min-h-full flex-col">{children}</div> : children}
    </div>
  );
}

export function HubSection({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="space-y-0.5 pb-1">
      <h2 className="px-4 pb-0.5 pt-2 text-label font-bold uppercase tracking-wide text-text-muted">{title}</h2>
      {hint && <p className="px-4 pb-1 text-caption text-text-muted">{hint}</p>}
      <div>{children}</div>
    </section>
  );
}

/**
 * Kanal / oda / proje satırı — sohbet listesi satırıyla (`ConversationRow`) aynı dil: sol karo, kalın başlık (+ etiketler + sessizlik kaynağı), zaman,
 * ikinci satırda önizleme, okunmamış rozeti, sabit raptiyesi. Seçim modunda satırın başında daire açılır ve satır bağlantı değil seçim düğmesi olur.
 */
export function HubRow({
  href,
  testKey,
  tile,
  title,
  tags,
  muteScope,
  at,
  subtitle,
  unread = 0,
  pinned = false,
  active = false,
  chevron = false,
  trailing,
  selection,
}: {
  href?: string;
  testKey: string;
  tile: ReactNode;
  title: string;
  tags?: ReactNode;
  muteScope?: "team" | "project" | "channel" | null;
  at?: string | null;
  subtitle?: ReactNode;
  unread?: number;
  pinned?: boolean;
  /** Sağ bölmede açık olan kanal (bilgisayarda vurgulanır). */
  active?: boolean;
  chevron?: boolean;
  trailing?: ReactNode;
  /** Verilirse seçim modundadır; `selected` seçili mi, `onToggle` satıra dokunuşu karşılar. */
  selection?: { selected: boolean; onToggle: () => void };
}) {
  const { t, language } = useTranslation();
  const shownUnread = muteScope ? 0 : unread;
  const selecting = selection !== undefined;
  const selected = selection?.selected === true;
  const body = (
    <>
      {/* Seçim halkası: genişlik 0 → 40 px geçişiyle satırı sağa iter (sohbet listesiyle aynı). */}
      <span aria-hidden className={cn("flex shrink-0 items-center overflow-hidden transition-[width] duration-200 ease-soft", selecting ? "w-10" : "w-0")}>
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200 ease-soft", selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-transparent")}>
          {selected && <Check size={15} strokeWidth={3} />}
        </span>
      </span>
      <span className="py-2 pr-3">{tile}</span>
      <span className="flex min-h-[68px] min-w-0 flex-1 flex-col justify-center gap-0.5 border-b border-border-soft py-2 pr-4">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-body tracking-[-0.01em] text-text", shownUnread > 0 ? "font-bold" : "font-semibold")}>{title}</span>
            {tags}
            <MuteChip scope={muteScope} />
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {pinned && <Pin size={12} data-hub-pinned aria-label={t("rooms.list.pinned")} className="text-text-muted" />}
            {at && <span className={cn("text-caption tabular-nums", shownUnread > 0 ? "font-semibold text-text" : "text-text-muted")}>{formatRelativeTime(at, language)}</span>}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-small", shownUnread > 0 ? "font-medium text-text" : "text-text-muted")}>{subtitle}</span>
          {shownUnread > 0 && (
            <span data-hub-unread className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {formatUnread(shownUnread)}
            </span>
          )}
          {muteScope && <BellOff size={14} className="shrink-0 text-text-muted" aria-hidden />}
          {trailing}
          {chevron && !selecting && <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />}
        </span>
      </span>
    </>
  );
  const className = cn(
    "flex w-full items-stretch gap-0 pl-4 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
    (active && !selecting) || selected ? "bg-primary-soft hover:bg-primary-soft" : "",
  );
  if (selecting) {
    return (
      <button type="button" role="checkbox" aria-checked={selected} onClick={selection.onToggle} data-hub-row={testKey} data-selected={selected ? "true" : "false"} className={className}>
        {body}
      </button>
    );
  }
  return href ? (
    <Link href={href} data-hub-row={testKey} aria-current={active ? "true" : undefined} className={className}>
      {body}
    </Link>
  ) : (
    <div data-hub-row={testKey} className={className}>
      {body}
    </div>
  );
}

/** Kanal simgesi karosu: `tone` "primary" = vurgulu, "plain" = sıradan, "success" = duyuru kanalı; `square` proje klasörü gibi yuvarlak köşeli kare. */
export function HubTile({ children, tone = "plain", square = false }: { children: ReactNode; tone?: "primary" | "plain" | "success"; square?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center font-display text-[1.125rem] font-bold",
        square ? "rounded-[14px]" : "rounded-full",
        tone === "primary" ? "bg-primary-soft text-primary" : tone === "success" ? "bg-success/10 text-success" : "bg-surface-soft text-text-secondary",
      )}
    >
      {children}
    </span>
  );
}

/** Süzgeç/arama sonucu boşsa ve yüklenme bittiyse tek satırlık açıklama. */
export function HubEmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-small text-text-muted">{children}</p>;
}
