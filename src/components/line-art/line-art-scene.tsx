"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { LINE_ART, type LineArtKind } from "./kinds";

/**
 * An animated line-art scene (docs/history/373-*, 374-*): ink on paper, drawn live in SVG. Ink is the text colour and paper the
 * surface colour, so it follows light / dark mode — dark mode turns the scene to night. Decoration only: people and animals react to
 * a tap, the pointer is wind, nothing navigates. The drawing code is loaded on demand; with reduced motion it is a single still
 * frame. The box takes the drawing's own ratio (no jump when it loads); give it a width and rounding with `className`.
 * `value` is a real number a few scenes draw (the milestone's scoreboard).
 */
export function LineArtScene({ kind, className, value }: { kind: LineArtKind; className?: string; value?: string }) {
  const { t, language } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const meta = LINE_ART[kind];
  const label = t(meta.label);
  const hint = "hint" in meta && meta.hint ? t(meta.hint) : undefined;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let alive = true;
    let stop: (() => void) | undefined;
    import("./scenes")
      .then(({ mountLineArt }) => {
        if (alive) stop = mountLineArt(kind, host, { label, hint, value });
      })
      .catch((err) => console.error("line-art scene", err));
    return () => {
      alive = false;
      stop?.();
    };
  }, [kind, label, hint, value, language]);

  return <div ref={ref} data-line-art={kind} style={{ aspectRatio: meta.ratio }} className={cn("line-art overflow-hidden bg-surface", className)} />;
}
