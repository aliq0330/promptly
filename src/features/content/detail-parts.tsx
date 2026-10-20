"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, profileHref, tagHref } from "@/lib/utils";
import type { Language } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";

/*
 * Shared building blocks for the four detail pages (Prompt, Prompt İsteği, Workflow, Hazır Ayar) — the ALBÜM language
 * (docs/history/201-*, chosen by the user from nine directions; like a music app's album page):
 *  - a BAND across the top, tinted by the post's own picture (enlarged + blurred, the same trick as the community
 *    cover's automatic mode) — the "album art" (the output, never cropped), the type kicker, a big title, the author line;
 *  - an ACTIONS row under it: the page's one big primary action (Kopyala / Yanıtla / Çalıştır / Studio'da aç), the
 *    engagement icons (Beğeni · Yorum · Kaydet · İstatistik … Paylaş, the cards' order), Takip Et + ⋮ on the right;
 *  - the body in two columns from `lg`: the content (description, sections, comments) and "Hakkında" (tool,
 *    classification, related content). One column on phones. Purely presentational; no data, no state.
 */

/** Page frame: band · actions row · [content | Hakkında]. */
export function DetailShell({
  band,
  actions,
  aside,
  children,
  entrance = "rise",
}: {
  band: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  /** "fade" while a card's cover is morphing into the art (a rising page would shift the measured target). */
  entrance?: "rise" | "fade";
}) {
  return (
    <div className={cn("w-full pb-16", entrance === "fade" ? "animate-fade-in" : "animate-rise-in")}>
      {band}
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
        {actions}
        <div className="pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12 lg:pt-8">
          <div className="min-w-0">{children}</div>
          {aside}
        </div>
      </div>
    </div>
  );
}

/**
 * The top band. `backdrop` is the post's picture (an `<img>`/`StorageImage` filling its box) — shown enlarged and blurred
 * under a veil of the page colour so the band takes the picture's colours and the text stays readable; without one the
 * band is the quiet brand tint. `art` sits on the left from `lg` (centred above the title below it), the kicker/title/author on the right.
 */
export function DetailBand({
  art,
  backdrop,
  kicker,
  title,
  byline,
}: {
  art: ReactNode;
  backdrop?: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
  byline: ReactNode;
}) {
  return (
    <header data-detail-band className="relative isolate overflow-hidden bg-primary-soft">
      {backdrop && (
        <>
          <div aria-hidden className="absolute inset-0 -z-20 scale-150 opacity-70 blur-3xl saturate-150">
            {backdrop}
          </div>
          <div aria-hidden className="absolute inset-0 -z-10 bg-background/55" />
        </>
      )}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-7 pt-6 sm:px-6 lg:flex-row lg:items-end lg:gap-9 lg:px-10 lg:pb-10 lg:pt-10">
        <div className="flex min-w-0 shrink-0 flex-col items-center gap-3 lg:max-w-[42%] lg:items-start">{art}</div>
        <div className="min-w-0 flex-1 space-y-3">
          {kicker}
          {title}
          {byline}
        </div>
      </div>
    </header>
  );
}

/**
 * The album art: the post's picture in its own aspect ratio (never cropped), at most 240px tall on phones and 300px from
 * `md` (beside the title from `lg`, at most 460px / 42% wide), opening the lightbox. `thumbnails` (more pictures) sit under it.
 */
export function DetailArt({
  ratio,
  caption,
  onOpen,
  buttonRef,
  thumbnails,
  children,
}: {
  ratio: number;
  caption: string;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  thumbnails?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <figure className="flex w-full flex-col items-center gap-3 lg:w-[460px] lg:max-w-full lg:items-start">
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        aria-label={t("media.viewFullscreen")}
        className="relative block w-full overflow-hidden rounded-[22px] bg-surface-soft shadow-pop [--art-h:240px] md:[--art-h:300px]"
        style={{ aspectRatio: ratio, maxWidth: `min(100%, calc(var(--art-h) * ${ratio}))` }}
      >
        {children}
      </button>
      <figcaption className="sr-only">{caption}</figcaption>
      {thumbnails && <div className="flex flex-wrap justify-center gap-2 lg:justify-start">{thumbnails}</div>}
    </figure>
  );
}

/** One thumbnail under the art (opens the lightbox at that image). */
export function DetailArtThumb({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("media.viewFullscreen")}
      className="h-12 w-12 overflow-hidden rounded-[12px] border border-border-soft opacity-85 transition-opacity hover:opacity-100"
    >
      {children}
    </button>
  );
}

/** Art for a post without a picture: its type's icon on a soft tile, so every band has the same rhythm. */
export function DetailArtPlaceholder({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden className="flex h-36 w-36 items-center justify-center rounded-[22px] bg-surface/80 text-primary shadow-pop lg:h-48 lg:w-48">
      <Icon size={56} strokeWidth={1.4} />
    </span>
  );
}

/** "Hakkında": the side column from `lg` (tool, classification, related content); stacked under the content below it. */
export function DetailAside({ children, className }: { children: ReactNode; className?: string }) {
  return <aside data-detail-aside className={cn("mt-12 space-y-8 lg:sticky lg:top-24 lg:mt-0 lg:self-start", className)}>{children}</aside>;
}

/** A titled section of the content column ("Prompt", "Yorumlar · 4" …); `action` sits on the right of the heading row. */
export function DetailSection({
  ref,
  id,
  title,
  action,
  children,
  className,
}: {
  ref?: Ref<HTMLElement>;
  id?: string;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section ref={ref} id={id} aria-labelledby={headingId} className={cn("scroll-mt-24 space-y-3.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={headingId} className="min-w-0 flex-1 font-display text-[1.375rem] font-bold leading-tight text-text">
          {title}
        </h2>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Small uppercase label — the same voice as the cards' ContentTypeLabel. */
export function Eyebrow({
  children,
  icon: Icon,
  as: Tag = "p",
  id,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  as?: "p" | "h2" | "h3" | "span";
  id?: string;
  tone?: "muted" | "primary";
  className?: string;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "flex items-center gap-1.5 font-sans text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.08em]",
        tone === "primary" ? "text-primary" : "text-text-muted",
        className,
      )}
    >
      {Icon && <Icon size={13} strokeWidth={2.1} aria-hidden className="shrink-0" />}
      {children}
    </Tag>
  );
}

/** The page title: the band's big display line. */
export function DetailTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "break-words font-display text-[2rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-text sm:text-[2.5rem] xl:text-[3.5rem]",
        className,
      )}
    >
      {children}
    </h1>
  );
}

/** The description under the title. */
export function DetailLede({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("whitespace-pre-line break-words [overflow-wrap:anywhere] text-body leading-relaxed text-text-secondary sm:text-[1.0625rem]", className)}>
      {children}
    </p>
  );
}

/** The band's author line: small avatar, display name, @handle · relative time (+ `meta`, e.g. "7 kez kullanıldı"). */
export function DetailByline({
  person,
  createdAt,
  language,
  meta,
}: {
  person: UserProfile;
  createdAt: string;
  language: Language;
  meta?: ReactNode;
}) {
  return (
    <Link href={profileHref(person)} className="group inline-flex max-w-full items-center gap-2.5 rounded-md">
      <Avatar src={person.avatarUrl} alt={person.displayName} size={32} />
      <span className="min-w-0 text-label leading-tight">
        <span className="font-semibold text-text transition-colors group-hover:text-primary">{person.displayName}</span>{" "}
        <span className="text-text-secondary">
          @{person.username} · {formatRelativeTime(createdAt, language)}
          {meta && <> · {meta}</>}
        </span>
      </span>
    </Link>
  );
}

/**
 * The actions row under the band: `primary` (the page's one big action) · the engagement icons (`children`, then
 * `trailing` = Paylaş — the cards' order) · `extra` (Takip Et, ⋮) on the right. On phones the icons take their own line.
 */
export function DetailActionBar({
  primary,
  extra,
  trailing,
  children,
}: {
  primary?: ReactNode;
  extra?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-border-soft py-4">
      {primary && <div className="order-1 flex items-center gap-2">{primary}</div>}
      {extra && <div className="order-2 ml-auto flex items-center gap-1 sm:order-3">{extra}</div>}
      <div
        role="toolbar"
        aria-label={t("detail.actionsAria")}
        data-detail-actions
        className="order-3 -ml-1.5 flex basis-full items-center gap-0.5 sm:order-2 sm:ml-0 sm:basis-auto"
      >
        {children}
        {trailing}
      </div>
    </div>
  );
}

/** A raised content card (comments, side-column blocks, info lists). */
export function DetailCard({
  children,
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <Tag className={cn("rounded-[22px] border border-border-soft bg-surface", className)} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * A titled block ("Benzer promptlar", "Bilgi", …): a plain bold title with an optional "Tümünü gör →" link on the right, then a raised card.
 * `bare` drops the card (for chip rows that read better unframed). Same header on phones (stacked under the content) and desktop (side column).
 */
export function AsideSection({
  id,
  title,
  children,
  bare = false,
  href,
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
  bare?: boolean;
  /** Where "Tümünü gör" leads; omit for a block with nothing to expand into. */
  href?: string;
}) {
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id={id} className="text-label font-semibold text-text">
          {title}
        </h2>
        {href && <ViewAllLink href={href} />}
      </div>
      {bare ? (
        children
      ) : (
        <DetailCard as="div" className="overflow-hidden">
          {children}
        </DetailCard>
      )}
    </section>
  );
}

/** "Tümünü gör →" — the one link style for every section header that can expand. */
export function ViewAllLink({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-caption font-medium text-primary transition-opacity hover:opacity-80">
      {t("common.viewAll")}
      <ArrowRight size={13} aria-hidden />
    </Link>
  );
}

/** Rows of an `AsideSection` link list (related / similar content). */
export function AsideLinkRow({
  href,
  icon: Icon,
  title,
  meta,
}: {
  href: string;
  icon: LucideIcon;
  title: ReactNode;
  meta: ReactNode;
}) {
  return (
    <Link href={href} className="group flex items-start gap-3 px-3.5 py-3 transition-colors duration-200 hover:bg-surface-soft">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon size={14} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="line-clamp-2 text-label font-semibold text-text transition-colors group-hover:text-primary">{title}</span>
        <span className="mt-0.5 block truncate text-caption text-text-muted">{meta}</span>
      </span>
    </Link>
  );
}

/** Tag links under the content (same pill as the category chips; the page title row already says what they are). */
export function DetailTags({ tags, className }: { tags: Tag[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => (
        <Link
          key={tag.slug}
          href={tagHref(tag)}
          className="inline-flex h-7 items-center rounded-full border border-primary/25 bg-primary-soft px-2.5 text-caption font-medium text-primary transition-colors hover:border-primary/50"
        >
          {tag.label}
        </Link>
      ))}
    </div>
  );
}

/** The comments: the content column's last section, jump target `#comments` (pass `EngageComments … headless`). */
export function DetailComments({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <DetailSection id="comments" title={t("comments.title")}>
      {children}
    </DetailSection>
  );
}
