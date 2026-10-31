"use client";

import { Pause, Play } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * The round play / pause button in the MIDDLE of a playing video / audio picture — the same one on the post cards and in Odak.
 * Shown while paused; while playing it fades out (and returns on hover or keyboard focus), so nothing sits over the picture —
 * and there is no progress bar or counter anywhere. Put it inside a `relative` box; on a card it is `z-10`, above the card's
 * stretched link (its click never opens the post).
 */
export function MediaPlayButton({ playing, onToggle, className }: { playing: boolean; onToggle: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      aria-label={playing ? t("focusFeed.pause") : t("focusFeed.play")}
      aria-pressed={playing}
      className={cn(
        "absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white outline-none backdrop-blur-md transition-opacity duration-200 ease-soft focus-visible:ring-2 focus-visible:ring-white",
        playing ? "opacity-0 focus-visible:opacity-100 group-hover:opacity-100" : "opacity-100",
        className,
      )}
    >
      {playing ? <Pause size={26} fill="currentColor" aria-hidden /> : <Play size={26} fill="currentColor" aria-hidden />}
    </button>
  );
}
