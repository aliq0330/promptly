import { cn } from "@/lib/utils";

/**
 * The one shared surface for showing long literal prompt text on detail
 * pages (Prompt, Prompt İsteği, Generator output). A 200-line prompt must not
 * stretch the page: the text scrolls inside a capped, responsive box while
 * the page itself (and any action row — Kopyala, Çalıştır… — which callers
 * render OUTSIDE this element) stays put.
 *
 * - Short text → no scrollbar (`overflow-y-auto`, cap only bites when exceeded).
 * - `overscroll-contain` keeps wheel/touch scroll from chaining to the page.
 * - Line breaks preserved, long tokens wrap (`overflow-wrap:anywhere`) so
 *   there is never horizontal overflow.
 * - Focusable so keyboard users can scroll it; mono styling comes from the
 *   existing `prompt-text` utility.
 */
export function ScrollablePrompt({
  as: Tag = "p",
  className,
  children,
  ...rest
}: {
  as?: "p" | "pre";
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">) {
  return (
    <Tag
      tabIndex={0}
      className={cn(
        "prompt-text scrollbar-thin-soft overscroll-contain whitespace-pre-wrap [overflow-wrap:anywhere] overflow-y-auto overflow-x-hidden",
        "max-h-72 sm:max-h-80 md:max-h-[26rem] lg:max-h-[30rem]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
