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
 * Shared building blocks for the four detail pages (Prompt, Prompt İsteği, Workflow, Hazır Ayar) — the EDITORIAL language
 * (docs/history/201-*, chosen by the user from three directions): a magazine-like page that reads top to bottom —
 * kicker → large display title → lede → byline between hairlines → output → NUMBERED sections ("01 Prompt",
 * "02 Kendine uyarla", … "Yorumlar"; `DetailSection`, numbered by a CSS counter so a hidden section never leaves a gap)
 * → colophon (tool + classification) → comments; related content in a side column from `xl`. The actions
 * (Beğeni · Yorum · Kaydet · İstatistik · Paylaş) are one toolbar: a floating pill at the bottom on phones / tablets, a
 * sticky vertical rail left of the article from `xl` (`DetailShell`'s `actions`). Purely presentational; no data, no state.
 */

/** Page frame: [actions rail] · article · [side column] from `xl`; one centred column below it. */
export function DetailShell({
  children,
  aside,
  actions,
  entrance = "rise",
}: {
  children: ReactNode;
  aside?: ReactNode;
  /** The page's `DetailActionBar` — floating pill below `xl`, sticky rail in the first column from `xl`. */
  actions?: ReactNode;
  /** "fade" while a card's cover is morphing into the hero (a rising page would shift the measured target). */
  entrance?: "rise" | "fade";
}) {
  return (
    <div
      className={cn(
        // Bottom room below `xl` so the floating action pill never covers the last lines.
        "mx-auto w-full max-w-6xl px-4 pb-28 pt-6 [counter-reset:detail-section] sm:px-6 sm:pt-8 lg:px-8 lg:pt-12 xl:pb-16",
        entrance === "fade" ? "animate-fade-in" : "animate-rise-in",
      )}
    >
      <div className="xl:grid xl:grid-cols-[64px_minmax(0,1fr)_300px] xl:gap-12">
        <div className="min-w-0 xl:col-start-2 xl:row-start-1">{children}</div>
        {actions && <div className="xl:col-start-1 xl:row-start-1">{actions}</div>}
        {aside}
      </div>
    </div>
  );
}

/** The side column: cards stack, and stick under the header on desktop. */
export function DetailAside({ children, className }: { children: ReactNode; className?: string }) {
  return <aside className={cn("mt-12 space-y-6 xl:col-start-3 xl:row-start-1 xl:sticky xl:top-24 xl:mt-0 xl:self-start", className)}>{children}</aside>;
}

/**
 * A numbered section of the article ("01  Prompt   [actions]"): the number comes from the page's CSS counter, so the
 * sections that are shown are always numbered 01, 02, 03… in order. `action` sits on the right of the heading row.
 */
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
    <section ref={ref} id={id} aria-labelledby={headingId} className={cn("scroll-mt-24 space-y-4 [counter-increment:detail-section]", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span aria-hidden className="font-display text-label font-bold tabular-nums text-secondary before:content-[counter(detail-section,decimal-leading-zero)]" />
        <h2 id={headingId} className="min-w-0 flex-1 font-display text-h2 font-bold text-text">
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

/** The page title: large display type, tight leading (the magazine headline). */
export function DetailTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "break-words font-display text-[clamp(2.25rem,1.55rem+2.6vw,3.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-text",
        className,
      )}
    >
      {children}
    </h1>
  );
}

/** The standfirst under the title — larger and looser than body copy. */
export function DetailLede({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "max-w-2xl whitespace-pre-line break-words [overflow-wrap:anywhere] text-[1.0625rem] leading-relaxed text-text-secondary sm:text-lg",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * Author line between hairlines: avatar, display name, @handle · relative time (+ `meta`, e.g. "7 kez kullanıldı") on the
 * left; `trailing` (Takip Et) pinned to the right of the same row.
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
    <div className="flex items-center gap-3 border-y border-border-soft py-3.5">
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
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/**
 * The page's actions — Beğeni · Yorum · Kaydet · İstatistik … Paylaş — as one toolbar: a pill floating above the bottom
 * edge on phones (over the bottom nav) and tablets, a sticky vertical rail beside the article from `xl`
 * (pass it as `DetailShell`'s `actions`). Icons + counts only; every control keeps its own accessible name.
 */
export function DetailActionBar({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t("detail.actionsAria")}
      data-detail-actions
      className={cn(
        "fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex w-max max-w-[calc(100%-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-full border border-border-soft bg-surface/95 px-1.5 py-1 shadow-pop backdrop-blur-xl md:bottom-6",
        "xl:sticky xl:inset-x-auto xl:bottom-auto xl:top-28 xl:mx-0 xl:w-full xl:flex-col xl:gap-1 xl:overflow-visible xl:rounded-[28px] xl:bg-surface xl:px-1 xl:py-2 xl:shadow-card",
        // On the rail each action stacks its icon over its count.
        "xl:[&>:not([data-sep])]:h-auto xl:[&>:not([data-sep])]:w-full xl:[&>:not([data-sep])]:flex-col xl:[&>:not([data-sep])]:gap-0.5 xl:[&>:not([data-sep])]:px-0 xl:[&>:not([data-sep])]:py-2 xl:[&>:not([data-sep])]:text-caption",
      )}
    >
      {children}
      {trailing && (
        <>
          <span aria-hidden data-sep className="mx-1 h-5 w-px shrink-0 bg-border-soft xl:mx-auto xl:my-1 xl:h-px xl:w-6" />
          {trailing}
        </>
      )}
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

/** The comments: the article's last numbered section, jump target `#comments` (pass `EngageComments … headless`). */
export function DetailComments({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <DetailSection id="comments" title={t("comments.title")}>
      {children}
    </DetailSection>
  );
}
