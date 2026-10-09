"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Long generated text, cut to a few lines. Tapping the text (or the link
 * under it) shows all of it; tapping again folds it back. The toggle only
 * appears when the text really is longer than the clamp.
 */
export function ClampedText({ text, lines = 6, className, inset = "p-4" }: { text: string; lines?: number; className?: string; inset?: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded, lines]);

  const toggle = () => overflowing || expanded ? setExpanded((v) => !v) : undefined;

  return (
    <div className={inset}>
      <p
        ref={ref}
        onClick={toggle}
        style={expanded ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        className={cn("prompt-text whitespace-pre-wrap break-words text-small text-text", (overflowing || expanded) && "cursor-pointer", className)}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="mt-2 text-small font-medium text-primary hover:underline">
          {expanded ? t("common.showLess") : t("common.showMore")}
        </button>
      )}
    </div>
  );
}
