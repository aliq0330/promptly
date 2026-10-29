"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Sohbet bilgi sayfalarının ortak parçaları: birebir sohbetteki Kişi bilgisi (`ContactInfoPanel`) ile toplulukta başlığa
 * dokununca açılan Topluluk bilgisi (`GroupInfoModal`) AYNI ekranı paylaşır — telefonda tam ekran, geniş ekranda sağdan açılan
 * panel. Kenarlıksız dolgulu kartlar; yeni bir sohbet bilgi yüzeyi yazarken bunları kullan.
 */

export function InfoPanelShell({
  title,
  titleId,
  onClose,
  menu,
  attrs,
  children,
}: {
  /** Ekranda görünmez (başlık sayfanın kendisidir) ama diyalogun adıdır. */
  title: string;
  titleId: string;
  onClose: () => void;
  /** Sağ üstteki ⋮ menüsü (verilmezse çizilmez). */
  menu?: ReactNode;
  attrs?: Record<string, string>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onClose} labelledBy={titleId} variant="side">
      <div {...attrs} className="flex h-full w-screen max-w-full flex-col bg-background sm:w-[26rem]" onClick={(event) => event.stopPropagation()}>
        <div className="flex h-16 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
          {menu}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </Modal>
  );
}

/** Kimlik bloğu: büyük avatar/simge, ad, alt satır, açıklama. */
export function InfoIdentity({
  media,
  name,
  sub,
  description,
  footer,
  nameAttr,
  subAttr,
}: {
  media: ReactNode;
  name: string;
  sub?: ReactNode;
  description?: string | null;
  footer?: ReactNode;
  nameAttr?: string;
  subAttr?: string;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center px-7 pt-1 text-center">
      {media}
      <p className="mt-3.5 break-words font-display text-[1.625rem] font-bold leading-tight tracking-[-0.02em] text-text" {...(nameAttr ? { [nameAttr]: "" } : {})}>
        {name}
      </p>
      {sub && (
        <p className="mt-0.5 text-body text-text-muted" {...(subAttr ? { [subAttr]: "" } : {})}>
          {sub}
        </p>
      )}
      {description && <p className="mt-2.5 max-w-[19.5rem] break-words text-small leading-relaxed text-text-secondary">{description}</p>}
      {footer}
    </div>
  );
}

const TILE =
  "relative flex min-h-[4.75rem] flex-1 flex-col items-center justify-center gap-2 rounded-[20px] bg-surface px-1 py-3 text-center text-[0.78rem] font-medium leading-tight text-text shadow-xs transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

/** Kimliğin altındaki hızlı eylem karoları (Profil · Ara · Sessize al gibi). */
export function InfoTiles({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 gap-2.5 px-4 pt-5">{children}</div>;
}

export function InfoTile({
  icon,
  label,
  onClick,
  href,
  badge,
  pressed,
  disabled,
  testId,
  attrs,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  /** Ek `data-*` öznitelikleri (testler / dış bağlantılar için). */
  attrs?: Record<string, string>;
  badge?: number;
  pressed?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const inner = (
    <>
      <span className={cn("text-primary", pressed && "text-text")} aria-hidden>
        {icon}
      </span>
      {label}
      {badge !== undefined && badge > 0 && (
        <span data-info-tile-badge className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={TILE} data-info-tile={testId} {...attrs}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed} className={TILE} data-info-tile={testId} {...attrs}>
      {inner}
    </button>
  );
}

/** Dolgulu, kenarlıksız kart; içine `InfoRow`lar ya da serbest içerik konur. */
export function InfoCard({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<string, unknown>) {
  return (
    <section className={cn("mx-4 mt-3 shrink-0 overflow-hidden rounded-[22px] bg-surface py-1 shadow-xs", className)} {...rest}>
      {children}
    </section>
  );
}

const ROW =
  "flex h-14 w-full items-center gap-3.5 px-4 text-left text-body text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50";

export function InfoRow({
  icon,
  children,
  value,
  onClick,
  href,
  danger,
  disabled,
  testId,
}: {
  icon: ReactNode;
  children: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const inner = (
    <>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft", danger ? "text-danger" : "text-text-secondary")} aria-hidden>
        {icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", danger && "text-danger")}>{children}</span>
      {value !== undefined && <span className="shrink-0 text-small text-text-muted">{value}</span>}
      {(onClick || href) && !danger && value !== undefined && <ChevronRight size={17} className="-ml-2 shrink-0 text-text-muted" aria-hidden />}
    </>
  );
  return href ? (
    <Link href={href} className={ROW} data-info-row={testId} data-contact-row={testId}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={ROW} data-info-row={testId} data-contact-row={testId}>
      {inner}
    </button>
  );
}
