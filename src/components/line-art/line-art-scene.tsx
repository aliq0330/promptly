"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import type { LineArtKind } from "./scenes";

const LABELS: Record<LineArtKind, { label: TranslationKey; hint?: TranslationKey }> = {
  meydan: { label: "lineArt.meydanLabel", hint: "lineArt.meydanHint" },
  lost: { label: "lineArt.lostLabel" },
  share: { label: "lineArt.shareLabel" },
};

/**
 * An animated line-art scene (docs/history/373-*): ink on paper, drawn live in SVG. Ink is the text colour and paper the
 * surface colour, so it follows light / dark mode — dark mode turns the scene to night. Decoration only: people and birds
 * react to a tap, the pointer is wind, nothing navigates. The drawing code is loaded on demand; with reduced motion it is a
 * single still frame. Size it with the className (an aspect ratio and a width); the scene fills and crops to it.
 */
export function LineArtScene({ kind, className }: { kind: LineArtKind; className?: string }) {
  const { t, language } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const labels = LABELS[kind];
  const label = t(labels.label);
  const hint = labels.hint ? t(labels.hint) : undefined;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let alive = true;
    let stop: (() => void) | undefined;
    import("./scenes")
      .then(({ mountLineArt }) => {
        if (alive) stop = mountLineArt(kind, host, { label, hint });
      })
      .catch((err) => console.error("line-art scene", err));
    return () => {
      alive = false;
      stop?.();
    };
  }, [kind, label, hint, language]);

  return <div ref={ref} data-line-art={kind} className={cn("line-art overflow-hidden bg-surface", className)} />;
}
