"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Portal } from "./portal";
import { lockBodyScroll, unlockBodyScroll } from "./modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

export interface LightboxImage {
  url: string;
  alt?: string;
}

/**
 * A fullscreen image viewer — the "tıkladığımızda tam ekran olsun" request.
 * Built directly on `Portal` rather than the shared `Modal` shell: `Modal`
 * is specifically shaped for a card-style panel (bottom sheet on mobile,
 * centered dialog, `bg-surface` content) and would fight a lightbox's own
 * edge-to-edge black backdrop + centered, contain-fit image — but it DOES
 * reuse `Modal`'s own scroll lock (`lockBodyScroll`/`unlockBodyScroll`)
 * rather than a second one. Escape/backdrop-click closes; a multi-image
 * gallery gets arrow-key navigation, on-screen prev/next buttons, a
 * counter, and a bottom thumbnail strip to jump directly to any image —
 * a single image gets none of that extra chrome.
 */
export function ImageLightbox({
  images,
  initialIndex = 0,
  onClose,
}: {
  images: LightboxImage[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);
  const hasMultiple = images.length > 1;

  useEffect(() => {
    lockBodyScroll();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (hasMultiple && event.key === "ArrowRight") setIndex((prev) => (prev + 1) % images.length);
      else if (hasMultiple && event.key === "ArrowLeft") setIndex((prev) => (prev - 1 + images.length) % images.length);
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      unlockBodyScroll();
    };
  }, [onClose, hasMultiple, images.length]);

  const current = images[index];
  if (!current) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-black/95 animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={t("media.imageGalleryLabel")}
        onClick={onClose}
      >
        <div className="flex items-center justify-between px-4 py-3 text-white/90" onClick={(event) => event.stopPropagation()}>
          {hasMultiple ? (
            <span className="text-sm tabular-nums">
              {index + 1} / {images.length}
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-full p-2 text-white hover:bg-white/10"
          >
            <X size={22} />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4" onClick={(event) => event.stopPropagation()}>
          {hasMultiple && (
            <button
              type="button"
              onClick={() => setIndex((prev) => (prev - 1 + images.length) % images.length)}
              aria-label={t("media.previousImage")}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:left-4"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- fullscreen viewer, source may be a local data URL or a real stored URL */}
          <img src={current.url} alt={current.alt ?? ""} className="max-h-full max-w-full select-none object-contain" draggable={false} />
          {hasMultiple && (
            <button
              type="button"
              onClick={() => setIndex((prev) => (prev + 1) % images.length)}
              aria-label={t("media.nextImage")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:right-4"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>

        {hasMultiple && (
          <div
            className="flex gap-2 overflow-x-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(event) => event.stopPropagation()}
          >
            {images.map((image, i) => (
              <button
                key={`${image.url}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  "h-14 w-14 shrink-0 overflow-hidden rounded-md border-2",
                  i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail strip, same source list as the main viewer */}
                <img src={image.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Portal>
  );
}
