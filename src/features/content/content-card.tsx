import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared shell of every content card on the platform —
 *
 *   ContentCard
 *   ├── PromptCard     (image / text / video / code / music prompts)
 *   ├── GeneratorCard
 *   └── RequestCard
 *
 * Same surface, border, radius, padding, hover and "stretched link" for all
 * of them, so the feed reads as one system and only the content block in
 * the middle differs per type. The full-card `<Link>` sits behind everything
 * (`z-0`); every real control inside (author link, menu, copy, actions) is
 * `relative z-10`, so it stays independently clickable.
 *
 * Hover is border + shadow only — no transform, because a transform would
 * create a stacking context and trap the card's own dropdown menu under the
 * next card in the column.
 */
export function ContentCard({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-lg border border-border-soft bg-surface shadow-card",
        "transition-[border-color,box-shadow] duration-200 ease-soft hover:border-border hover:shadow-card-hover",
        className,
      )}
    >
      {children}
      {/* Mouse/touch convenience only: hidden from assistive tech and the tab
          order — the card title (ContentCardTitle) is the accessible link. */}
      <Link href={href} className="absolute inset-0 z-0 rounded-lg" aria-hidden tabIndex={-1} />
    </article>
  );
}

/** Padded content column inside a ContentCard. */
export function ContentCardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-3 p-4", className)}>{children}</div>;
}

/**
 * Card title — a real link so keyboard users reach the item from its title
 * (the stretched link behind the card is `tabIndex=-1`, mouse-only).
 */
export function ContentCardTitle({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-h3 font-semibold text-text">
        <Link
          href={href}
          className="relative z-10 rounded-xs outline-none decoration-primary/40 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-primary"
        >
          {title}
        </Link>
      </h3>
      {description && <p className="line-clamp-2 text-small text-text-muted">{description}</p>}
    </div>
  );
}
