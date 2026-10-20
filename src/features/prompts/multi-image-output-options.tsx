"use client";

import { clampedAspectRatio } from "@/lib/placeholder-image";
import { useTranslation } from "@/lib/i18n/language-provider";
import { Play } from "lucide-react";
import type { PromptMedia } from "@/types";
import { StorageImage } from "@/components/ui/storage-media";

/**
 * How PromptCard's OUTPUT FIGURE (the "Çıktı" preview — never the whole card,
 * see prompt-card.tsx's own doc comment) behaves when a prompt has MORE THAN
 * ONE image: the hero plus a short strip of the others (`OutputThumbnailStrip`,
 * chosen after comparing four real variants; the other three were removed).
 *
 * It adds no swipe/drag to the card itself: the whole card is one "stretched
 * link" to the detail page (see ContentCard's doc comment on why hover avoids
 * `transform`), and a second gesture surface over that area risks stacking /
 * pointer-event conflicts. Browsing every image is a detail-page job, via the
 * `ImageLightbox`.
 */

// The Albüm card's art (docs/history/202-*): a lifted picture on the tinted band.
const FRAME_CLASS = "relative w-full overflow-hidden rounded-lg bg-surface-soft shadow-pop";
const SIZES = "(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw";

function OutputCaption() {
  const { t } = useTranslation();
  return (
    <figcaption className="absolute bottom-2 left-2 rounded-xs bg-black/55 px-1.5 py-0.5 text-caption font-medium text-white backdrop-blur-sm">
      {t("prompt.output")}
    </figcaption>
  );
}

/** Thumbnail strip: same hero, plus a row of small previews of the other images below it, capped at 4 visible. Adds a little height, but reuses the exact strip the lightbox/detail views already use — zero new pattern. */
export function OutputThumbnailStrip({ media }: { media: PromptMedia[] }) {
  const cover = media[0];
  if (!cover) return null;
  const rest = media.slice(1);
  const visible = rest.slice(0, 4);
  const overflow = rest.length - visible.length;
  return (
    <div className="space-y-1.5">
      <figure data-card-media className={FRAME_CLASS} style={{ aspectRatio: Math.max(1, clampedAspectRatio(cover.width, cover.height)) }}>
        <StorageImage src={cover.url} alt={cover.alt} fill sizes={SIZES} className="object-cover" />
        <OutputCaption />
      </figure>
      {rest.length > 0 && (
        <div className="flex gap-1.5">
          {visible.map((item, index) => (
            <div key={item.id} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-sm border border-surface bg-surface-soft">
              <StorageImage src={item.url} alt={item.alt} fill sizes="44px" className="object-cover" />
              {index === visible.length - 1 && overflow > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-caption font-semibold text-white">
                  +{overflow}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Video/ses promptlarının kart önizlemesi: kapak (poster/waveform) + ortada
 * oynat işareti. Kart bir "stretched link" olduğundan burada oynatma yok —
 * tıklama detay sayfasına gider, gerçek oynatıcı orada (PromptPlayableOutput).
 */
export function OutputPosterPreview({ media }: { media: PromptMedia }) {
  return (
    <figure className={FRAME_CLASS} style={{ aspectRatio: clampedAspectRatio(media.width, media.height) }}>
      <StorageImage src={media.url} alt={media.alt} fill sizes={SIZES} className="object-cover" />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <Play size={18} fill="currentColor" />
        </span>
      </span>
      <OutputCaption />
    </figure>
  );
}
