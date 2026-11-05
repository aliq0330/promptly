"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TEXT_COPIED_EVENT } from "@/features/prompts/copy-events";

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
 * - Kopyala bu metni kopyalayınca blok bir kez renk alıp söner (docs/history/335-*; metin eşleşmesiyle, çocuk düz metinse).
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
  const [flash, setFlash] = useState(false);
  const text = typeof children === "string" ? children : null;
  useEffect(() => {
    if (!text) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onCopied = (event: Event) => {
      if ((event as CustomEvent<{ text?: string }>).detail?.text !== text) return;
      setFlash(true);
      clearTimeout(timer);
      timer = setTimeout(() => setFlash(false), 950);
    };
    window.addEventListener(TEXT_COPIED_EVENT, onCopied);
    return () => {
      window.removeEventListener(TEXT_COPIED_EVENT, onCopied);
      clearTimeout(timer);
    };
  }, [text]);
  return (
    <Tag
      tabIndex={0}
      className={cn(
        "prompt-text scrollbar-thin-soft overscroll-contain whitespace-pre-wrap [overflow-wrap:anywhere] overflow-y-auto overflow-x-hidden",
        "max-h-60 sm:max-h-72 md:max-h-80 lg:max-h-[26rem]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        flash && "mi-copy-flash",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
