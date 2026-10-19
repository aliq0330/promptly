"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useTheme } from "@/components/theme/theme-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, profileHref, tagHref } from "@/lib/utils";
import type { Language } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";

/*
 * Shared building blocks for the four detail pages (Prompt, Prompt İsteği, Workflow, Hazır Ayar) — the SAHNE language
 * (docs/history/201-*, chosen by the user from six directions): the post's media on a dark STAGE, the post itself on a
 * light PANEL. From `lg` the stage is a sticky column filling the viewport and the panel sits beside it (Instagram's post
 * window, but in the page); below `lg` the stage is a band at the top and the panel rises over it like a sheet. A post
 * without media has no stage — the panel alone, centred. The actions (Beğeni · Yorum · Kaydet · İstatistik … Paylaş) are
 * one row: right under the stage on phones, stuck to the bottom of the panel from `lg` (and everywhere when there is no
 * stage). Purely presentational; no data, no state.
 */

/** Page frame: [dark stage] · panel (children → aside) + the actions row. */
export function DetailShell({
  children,
  stage,
  aside,
  actions,
  entrance = "rise",
}: {
  children: ReactNode;
  /** The post's media (`DetailStageFigure` …) — omit when there is none. */
  stage?: ReactNode;
  aside?: ReactNode;
  /** The page's `DetailActionBar`. */
  actions?: ReactNode;
  /** "fade" while a card's cover is morphing into the hero (a rising page would shift the measured target). */
  entrance?: "rise" | "fade";
}) {
  const { palette } = useTheme();
  const hasStage = Boolean(stage);
  return (
    <div
      className={cn(
        "w-full",
        hasStage && "lg:grid lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_460px]",
        entrance === "fade" ? "animate-fade-in" : "animate-rise-in",
      )}
    >
      {hasStage && (
        // Always dark, in the visitor's palette (`.dark` + `data-palette` re-scope every token, as Odak's stage does).
        <div
          data-detail-stage
          data-palette={palette}
          className="dark flex min-h-64 items-center justify-center bg-background px-4 pb-11 pt-5 text-text lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:self-start lg:px-10 lg:py-10"
        >
          {stage}
        </div>
      )}
      <div
        className={cn(
          "relative flex min-w-0 flex-col bg-surface",
          hasStage
            ? "-mt-6 rounded-t-[28px] lg:mt-0 lg:min-h-[calc(100dvh-4rem)] lg:rounded-none lg:border-l lg:border-border-soft"
            : "mx-auto max-w-2xl md:mt-6 md:rounded-[28px] md:border md:border-border-soft",
        )}
      >
        {hasStage && <span aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border lg:hidden" />}
        <div className="order-2 min-w-0 px-4 pb-10 pt-4 sm:px-6 lg:px-7 lg:pt-6">
          {children}
          {aside}
        </div>
        {actions && (
          <div
            className={cn(
              "z-20 bg-surface/95 px-2 backdrop-blur-xl sm:px-4",
              hasStage
                ? "order-1 pt-1 lg:sticky lg:bottom-0 lg:order-3 lg:border-t lg:border-border-soft lg:py-2"
                : "sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] order-3 border-t border-border-soft py-1.5 md:bottom-0 md:rounded-b-[28px]",
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The stage's picture, never cropped: a box with the media's own aspect ratio, as large as the stage allows (60% of the
 * screen height on phones, the stage's height from `lg`), opening the lightbox. `thumbnails` (more images) sit under it.
 */
export function DetailStageFigure({
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
    <figure className="flex w-full flex-col items-center gap-4">
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        aria-label={t("media.viewFullscreen")}
        className="relative block w-full overflow-hidden rounded-[18px] bg-surface-soft [--hero-h:min(60vh,520px)] lg:[--hero-h:calc(100dvh-13rem)]"
        style={{ aspectRatio: ratio, maxWidth: `calc(var(--hero-h) * ${ratio})` }}
      >
        {children}
      </button>
      <figcaption className="sr-only">{caption}</figcaption>
      {thumbnails && <div className="flex flex-wrap justify-center gap-2">{thumbnails}</div>}
    </figure>
  );
}

/** One thumbnail under the stage picture (opens the lightbox at that image). */
export function DetailStageThumb({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("media.viewFullscreen")}
      className="h-14 w-14 overflow-hidden rounded-[12px] border border-border-soft opacity-80 transition-opacity hover:opacity-100"
    >
      {children}
    </button>
  );
}

/** Related content at the end of the panel (similar posts, contributors…), under a hairline. */
export function DetailAside({ children, className }: { children: ReactNode; className?: string }) {
  return <aside className={cn("mt-10 space-y-6 border-t border-border-soft pt-8", className)}>{children}</aside>;
}

/** A titled section of the panel ("Prompt Metni   [actions]"); `action` sits on the right of the heading row. */
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
        <h2 id={headingId} className="min-w-0 flex-1 font-display text-h3 font-bold text-text">
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

/** The page title (display type, sized for the panel). */
export function DetailTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn("break-words font-display text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.025em] text-text sm:text-[2rem]", className)}>
      {children}
    </h1>
  );
}

/** The description under the title. */
export function DetailLede({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("whitespace-pre-line break-words [overflow-wrap:anywhere] text-[0.9375rem] leading-relaxed text-text-secondary sm:text-body", className)}>
      {children}
    </p>
  );
}

/**
 * The panel's first row: avatar, display name, @handle · relative time (+ `meta`, e.g. "7 kez kullanıldı") on the left;
 * `trailing` (Takip Et, ⋮) pinned to the right of the same row, a hairline under it.
 */
export function DetailByline({
  person,
  createdAt,
  language,
  meta,
  trailing,
}: {
  person: UserProfile;
  createdAt: string;
  language: Language;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border-soft pb-4">
      <Link href={profileHref(person)} className="group inline-flex min-w-0 flex-1 items-center gap-2.5 rounded-md">
        <Avatar src={person.avatarUrl} alt={person.displayName} size={40} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-label font-semibold text-text transition-colors group-hover:text-primary">
            {person.displayName}
          </span>
          <span className="block truncate text-caption text-text-muted">
            @{person.username} · {formatRelativeTime(createdAt, language)}
            {meta && <> · {meta}</>}
          </span>
        </span>
      </Link>
      {trailing && <div className="flex shrink-0 items-center gap-1">{trailing}</div>}
    </div>
  );
}

/**
 * The page's actions as one row — Beğeni · Yorum · Kaydet · İstatistik … on the left, `trailing` (Paylaş) on the right,
 * the same order as the cards (`ContentCardPost`). Where the row sits is `DetailShell`'s job (pass it as `actions`).
 */
export function DetailActionBar({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div role="toolbar" aria-label={t("detail.actionsAria")} data-detail-actions className="flex items-center gap-0.5">
      {children}
      {trailing && <div className="ml-auto flex items-center">{trailing}</div>}
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

/** The comments: the panel's last section, jump target `#comments` (pass `EngageComments … headless`). */
export function DetailComments({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <DetailSection id="comments" title={t("comments.title")}>
      {children}
    </DetailSection>
  );
}
