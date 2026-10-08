import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelativeTime, profileHref, tagHref } from "@/lib/utils";
import type { Language } from "@/lib/i18n/translations";
import type { Tag, UserProfile } from "@/types";

/*
 * Shared building blocks for the five detail pages (Prompt, Prompt İsteği,
 * Generator, Workflow, Hazır Ayar) — the "Editorial Premium" language of
 * Bölüm 9.110 applied once, so every detail page has the same rhythm:
 * eyebrow → serif title → lede → byline → floating action bar → sections →
 * side column of cards. Purely presentational; no data, no state.
 */

/** Page frame: centered column + the main/side grid. */
export function DetailShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl animate-fade-in px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-10">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        {children}
        {aside}
      </div>
    </div>
  );
}

/** The side column: cards stack, and stick under the header on desktop. */
export function DetailAside({ children, className }: { children: ReactNode; className?: string }) {
  return <aside className={cn("mt-8 space-y-6 lg:sticky lg:top-24 lg:mt-0 lg:self-start", className)}>{children}</aside>;
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
    <p className={cn("max-w-2xl whitespace-pre-line text-body leading-relaxed text-text-secondary sm:text-[1.0625rem]", className)}>
      {children}
    </p>
  );
}

/** Author line: avatar, display name, @handle · relative time. */
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Link href={profileHref(person)} className="group inline-flex max-w-full items-center gap-2.5 rounded-md">
        <Avatar src={person.avatarUrl} alt={person.displayName} size={36} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-label font-semibold text-text transition-colors group-hover:text-primary">
            {person.displayName}
          </span>
          <span className="block truncate text-caption text-text-muted">
            @{person.username} · {formatRelativeTime(createdAt, language)}
          </span>
        </span>
      </Link>
      {trailing}
    </div>
  );
}

/** Floating toolbar holding Beğeni · Yorum · Kaydet · İstatistik … Paylaş. */
export function DetailActionBar({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-border-soft bg-surface px-1.5 py-1 shadow-card">
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
 * A titled block in the side column: eyebrow heading + a raised card. `bare`
 * drops the card (for chip rows that read better unframed).
 */
export function AsideSection({
  id,
  title,
  children,
  bare = false,
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
  bare?: boolean;
}) {
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <Eyebrow as="h2" id={id} className="px-1">
        {title}
      </Eyebrow>
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

/** `#etiket` links under the content. */
export function DetailTags({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Link
          key={tag.slug}
          href={tagHref(tag)}
          className="inline-flex h-7 items-center rounded-full border border-border-soft bg-surface px-2.5 text-caption font-medium text-text-secondary shadow-xs transition-colors hover:border-primary/40 hover:text-primary"
        >
          <span aria-hidden className="mr-0.5 text-primary/70">
            #
          </span>
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
