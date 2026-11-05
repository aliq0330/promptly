import { cn } from "@/lib/utils";

/**
 * Promptly's mark (docs/history/342-*): a prompt template's curly braces with a heart inside — the prompt you fill in and
 * the community that shares it. The braces take Promptly blue (`--color-primary`), the heart the logo heart's orange
 * (`--color-heart`), so the mark follows light / dark mode on its own. The same geometry is drawn into the app icons,
 * favicon and share image by `scripts/build-brand-assets.mjs` — change both together.
 */
export const BRAND_BRACE_LEFT = "M25 13c-6 0-7.5 3-7.5 8v5.5c0 3.5-2 5.5-5.5 5.5 3.5 0 5.5 2 5.5 5.5V43c0 5 1.5 8 7.5 8";
export const BRAND_BRACE_RIGHT = "M39 13c6 0 7.5 3 7.5 8v5.5c0 3.5 2 5.5 5.5 5.5-3.5 0-5.5 2-5.5 5.5V43c0 5-1.5 8-7.5 8";
export const BRAND_HEART = "M32 41.5c-1-.8-9-6.4-9-12.2a4.6 4.6 0 0 1 9-1.5a4.6 4.6 0 0 1 9 1.5c0 5.8-8 11.4-9 12.2z";

export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="8 8 48 48"
      className={cn("shrink-0", className)}
    >
      <g fill="none" stroke="var(--color-primary)" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round">
        <path d={BRAND_BRACE_LEFT} />
        <path d={BRAND_BRACE_RIGHT} />
      </g>
      <path d={BRAND_HEART} fill="var(--color-heart)" stroke="var(--color-heart)" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The wordmark: "promptly" in lower case, Bricolage Grotesque ExtraBold, tight tracking. It is a logo, not running text —
 * the product's name in sentences stays "Promptly". Size it with a `text-*` class; screen readers get the name from the
 * surrounding link's label.
 */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("font-display font-extrabold leading-none tracking-[-0.045em] text-text", className)}>
      promptly
    </span>
  );
}
