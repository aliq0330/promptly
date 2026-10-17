"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, profileHref, tagHref } from "@/lib/utils";
import type { Language } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";

/*
 * Shared building blocks for the five detail pages (Prompt, Prompt İsteği,
 * Generator, Workflow, Hazır Ayar) — the "Editorial Premium" language of
 * Bölüm 9.110 + 9.189 applied once, so every detail page has the same rhythm:
 * eyebrow → serif title → lede → "Kaynak ve lisans" row → byline (+ Takip Et) →
 * output → action bar → sections → meta card → results → comments → related
 * (a side column from `xl` up, stacked below on phones/tablets). Purely presentational; no data, no state.
 */

/** Page frame: centered column + the main/side grid. */
export function DetailShell({
  children,
  aside,
  entrance = "rise",
}: {
  children: ReactNode;
  aside?: ReactNode;
  /** "fade" while a card's cover is morphing into the hero (a rising page would shift the measured target). */
  entrance?: "rise" | "fade";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-10",
        entrance === "fade" ? "animate-fade-in" : "animate-rise-in",
      )}
    >
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-10">
        {children}
        {aside}
      </div>
    </div>
  );
}

/** The side column: cards stack, and stick under the header on desktop. */
export function DetailAside({ children, className }: { children: ReactNode; className?: string }) {
  return <aside className={cn("mt-8 space-y-6 xl:sticky xl:top-24 xl:mt-0 xl:self-start", className)}>{children}</aside>;
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

/** Serif page title (the `text-h1` rule in globals.css sets the face/weight). */
export function DetailTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("break-words text-h1 text-text", className)}>{children}</h1>;
}

/** The standfirst under the title — a touch larger and looser than body copy. */
export function DetailLede({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("max-w-2xl whitespace-pre-line break-words [overflow-wrap:anywhere] text-body leading-relaxed text-text-secondary", className)}>
      {children}
    </p>
  );
}

/** Author line: avatar, display name, @handle · relative time on the left; `trailing` (Takip Et) pinned to the right of the same row. */
export function DetailByline({
  person,
  createdAt,
  language,
  trailing,
}: {
  person: UserProfile;
  createdAt: string;
  language: Language;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Link href={profileHref(person)} className="group inline-flex min-w-0 flex-1 items-center gap-2.5 rounded-md">
        <Avatar src={person.avatarUrl} alt={person.displayName} size={40} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-label font-semibold text-text transition-colors group-hover:text-primary">
            {person.displayName}
          </span>
          <span className="block truncate text-caption text-text-muted">
            @{person.username} · {formatRelativeTime(createdAt, language)}
          </span>
        </span>
      </Link>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/** Floating toolbar holding Beğeni · Yorum · Kaydet · İstatistik … Paylaş. */
export function DetailActionBar({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-border-soft bg-surface px-2 py-1 shadow-card">
      {children}
      {trailing && (
        <>
          <span className="ml-auto" />
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
    <Tag className={cn("rounded-xl border border-border-soft bg-surface shadow-card", className)} {...rest}>
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

/** Comments live in their own raised card, jump target `#comments`. */
export function DetailComments({ children }: { children: ReactNode }) {
  return (
    <DetailCard id="comments" className="scroll-mt-20 p-4 sm:p-6">
      {children}
    </DetailCard>
  );
}
