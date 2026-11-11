"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import { MuteChip } from "@/features/teams/mute-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, formatUnread } from "@/lib/utils";

/**
 * Ekip / proje / topluluk sayfalarının ORTAK iskeleti (docs/history/369-*): Mesajlar listesinden açılan "kanallar listesi" sayfası. Üstte geri, kimlik bandı,
 * altında bölümler ve sabit eylem satırı; satırlar WhatsApp Toplulukları gibi tek satır + sağda zaman/okunmamış/›. Üç sayfa aynı parçaları kullanır, ikinci iskelet yazma.
 */
export function HubShell({
  kind,
  backHref,
  topRight,
  media,
  title,
  meta,
  children,
  footer,
}: {
  kind: "team" | "project" | "community";
  backHref: string;
  topRight?: ReactNode;
  media: ReactNode;
  title: string;
  meta: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div data-hub={kind} className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
      <div className="flex shrink-0 items-center gap-1 px-1 py-2 max-md:pt-[calc(0.5rem+env(safe-area-inset-top))] md:px-3">
        <Link
          href={backHref}
          aria-label={t("messages.backToListAriaLabel")}
          data-hub-back
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1" />
        {topRight}
      </div>
      <div className="flex shrink-0 items-center gap-3.5 px-4 pb-4 pt-1">
        {media}
        <div className="min-w-0">
          <h1 data-hub-title className="truncate font-display text-h2 font-extrabold tracking-[-0.02em] text-text">
            {title}
          </h1>
          <p data-hub-meta className="truncate text-small text-text-muted">
            {meta}
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-4 pb-4">{children}</div>
      {footer && <div className="sticky bottom-0 shrink-0 space-y-2 bg-background px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">{footer}</div>}
    </div>
  );
}

export function HubSection({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="space-y-1">
      <h2 className="px-4 text-label font-bold uppercase tracking-wide text-text-muted">{title}</h2>
      {hint && <p className="px-4 pb-1 text-caption text-text-muted">{hint}</p>}
      <div>{children}</div>
    </section>
  );
}

/** Kanal / proje satırı: sol simge karosu, başlık (+ etiketler + sessizlik kaynağı), zaman, ikinci satırda önizleme, okunmamış rozeti ve isteğe bağlı ›. */
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
  chevron = false,
  trailing,
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
  chevron?: boolean;
  trailing?: ReactNode;
}) {
  const { language } = useTranslation();
  const shownUnread = muteScope ? 0 : unread;
  const body = (
    <>
      <span className="py-1">{tile}</span>
      <span className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-0.5 border-b border-border-soft py-2 pr-4">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-body tracking-[-0.01em] text-text", shownUnread > 0 ? "font-bold" : "font-semibold")}>{title}</span>
            {tags}
            <MuteChip scope={muteScope} />
          </span>
          {at && <span className={cn("shrink-0 text-caption tabular-nums", shownUnread > 0 ? "font-semibold text-text" : "text-text-muted")}>{formatRelativeTime(at, language)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-small", shownUnread > 0 ? "font-medium text-text" : "text-text-muted")}>{subtitle}</span>
          {shownUnread > 0 && (
            <span data-hub-unread className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {formatUnread(shownUnread)}
            </span>
          )}
          {trailing}
          {chevron && <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />}
        </span>
      </span>
    </>
  );
  const className = "flex items-stretch gap-3 pl-4 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";
  return href ? (
    <Link href={href} data-hub-row={testKey} className={className}>
      {body}
    </Link>
  ) : (
    <div data-hub-row={testKey} className={className}>
      {body}
    </div>
  );
}

/** Kanal simgesi karosu: `tone` "primary" = varsayılan/vurgulu, "plain" = sıradan, "project" = proje klasörü (yuvarlak köşeli kare). */
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
