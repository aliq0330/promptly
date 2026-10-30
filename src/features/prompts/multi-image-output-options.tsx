"use client";

import { clampedAspectRatio } from "@/lib/placeholder-image";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptMedia } from "@/types";
import { StorageAppearanceImage } from "@/components/ui/storage-media";

/**
 * The OUTPUT FIGURE a PromptCard shows as its picture (never the whole card, see prompt-card.tsx's own doc comment).
 *
 * It adds no swipe/drag to the card itself: the whole card is one "stretched
 * link" to the detail page (see ContentCard's doc comment on why hover avoids
 * `transform`), and a second gesture surface over that area risks stacking /
 * pointer-event conflicts.
 */

// The visual card's art (`ContentCardPost`): the picture fills the rounded media box; the box sets no frame of its own.
const FRAME_CLASS = "relative w-full overflow-hidden bg-surface-soft";
const SIZES = "(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw";

/**
 * The cover of a prompt with one or more output images. Only the first is shown (browsing every image is a detail-page job,
 * via the `ImageLightbox` — the card is one "stretched link", see ContentCard's doc comment); a small "+N" chip says there are more.
 */
export function OutputThumbnailStrip({ media }: { media: PromptMedia[] }) {
  const { t } = useTranslation();
  const cover = media[0];
  if (!cover) return null;
  return (
    <figure className={FRAME_CLASS} style={{ aspectRatio: clampedAspectRatio(cover.width, cover.height) }}>
      <StorageAppearanceImage src={cover.url} alt={cover.alt} color={cover.color} placeholder={cover.placeholder} sizes={SIZES} className="object-cover" />
      {media.length > 1 && (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-caption font-semibold text-white backdrop-blur-sm">
          {t("media.moreImagesBadge", { count: media.length - 1 })}
        </span>
      )}
    </figure>
  );
}

/**
 * Video/ses promptlarının kart önizlemesi: kapak (poster/waveform). Tür simgesi kartın köşesindedir (`ContentCardPost`); kart bir
 * "stretched link" olduğundan burada oynatma yok — tıklama detay sayfasına gider, gerçek oynatıcı orada (PromptPlayableOutput).
 */
export function OutputPosterPreview({ media }: { media: PromptMedia }) {
  return (
    <figure className={FRAME_CLASS} style={{ aspectRatio: clampedAspectRatio(media.width, media.height) }}>
      <StorageAppearanceImage src={media.url} alt={media.alt} color={media.color} placeholder={media.placeholder} sizes={SIZES} className="object-cover" />
    </figure>
  );
}
