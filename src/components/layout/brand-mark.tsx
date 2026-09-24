import { cn } from "@/lib/utils";

/**
 * Promptly's mark: a prompt caret inside a soft square — "the thing you
 * type", not a camera/image glyph. Pure SVG + tokens, so it follows the
 * active palette.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7l5 5-5 5" />
        <path d="M13 17h6" />
      </svg>
    </span>
  );
}
