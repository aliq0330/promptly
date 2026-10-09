"use client";

import Image from "next/image";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";
import type { PromptMedia } from "@/types";

/**
 * Four real, working alternatives for how PROMPTCARD'S OUTPUT FIGURE (the
 * "Çıktı" preview under the prompt block — never the whole card, see
 * prompt-card.tsx's own doc comment) should behave when a prompt has MORE
 * THAN ONE image, not just one. Presented and compared visually (real
 * screenshots) in /dev/multi-image-card-options before the choice was made —
 * **`OutputThumbnailStrip` is the one actually wired into `prompt-card.tsx`**;
 * the other three are kept here (and the comparison page stays live, same
 * precedent as /dev/share-modal-test etc.) as a documented, re-runnable
 * record of the alternatives, not dead code.
 *
 * None of the four add swipe/drag interaction to the card's image itself:
 * the whole card is already one giant "stretched link" to the detail page
 * (see ContentCard's own doc comment on why hover avoids `transform`, and
 * post-menu/post-header for how real controls carve out their own
 * `relative z-10` — adding a second, competing gesture surface over that
 * same area risks exactly that class of stacking/pointer-event conflict).
 * Browsing every image stays a detail-page job, via the `ImageLightbox` this
 * feature just wired into all four detail views.
 */

const FRAME_CLASS = "relative w-full overflow-hidden rounded-md border border-border-soft bg-surface-soft";
const SIZES = "(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw";

function OutputCaption() {
  const { t } = useTranslation();
  return (
    <figcaption className="absolute bottom-2 left-2 rounded-xs bg-black/55 px-1.5 py-0.5 text-caption font-medium text-white backdrop-blur-sm">
      {t("prompt.output")}
    </figcaption>
  );
}

/** Option 1 — Rozet (Badge only): today's single-image figure, unchanged, plus a small "+N" pill when there's more. Zero extra height, zero new interaction. */
export function OutputBadgeOnly({ media }: { media: PromptMedia[] }) {
  const { t } = useTranslation();
  const cover = media[0];
  if (!cover) return null;
  return (
    <figure className={FRAME_CLASS} style={{ aspectRatio: Math.max(1, clampedAspectRatio(cover.width, cover.height)) }}>
      <Image src={cover.url} alt={cover.alt} fill sizes={SIZES} className="object-cover" />
      <OutputCaption />
      {media.length > 1 && (
        <span className="absolute right-2 top-2 rounded-xs bg-black/55 px-1.5 py-0.5 text-caption font-medium text-white backdrop-blur-sm">
          {t("media.moreImagesBadge", { count: media.length - 1 })}
        </span>
      )}
    </figure>
  );
}

/** Option 2 — Önizleme şeridi (Thumbnail strip): same hero, plus a row of small previews of the other images below it, capped at 4 visible. Adds a little height, but reuses the exact strip the lightbox/detail views already use — zero new pattern. */
export function OutputThumbnailStrip({ media }: { media: PromptMedia[] }) {
  const cover = media[0];
  if (!cover) return null;
  const rest = media.slice(1);
  const visible = rest.slice(0, 4);
  const overflow = rest.length - visible.length;
  return (
    <div className="space-y-1.5">
      <figure className={FRAME_CLASS} style={{ aspectRatio: Math.max(1, clampedAspectRatio(cover.width, cover.height)) }}>
        <Image src={cover.url} alt={cover.alt} fill sizes={SIZES} className="object-cover" />
        <OutputCaption />
      </figure>
      {rest.length > 0 && (
        <div className="flex gap-1.5">
          {visible.map((item, index) => (
            <div key={item.id} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-sm border border-border-soft bg-surface-soft">
              <Image src={item.url} alt={item.alt} fill sizes="44px" className="object-cover" />
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

/** Option 3 — Kolaj / mozaik (Collage grid): fills the SAME single-image footprint (no extra height) with a 1/2/3/4+ cell collage, Instagram-multi-photo style. Richest at-a-glance preview, but smaller crops and the most layout branching. */
export function OutputCollageGrid({ media }: { media: PromptMedia[] }) {
  const { t } = useTranslation();
  const cover = media[0];
  if (!cover) return null;
  const count = media.length;

  if (count === 1) {
    return (
      <figure className={FRAME_CLASS} style={{ aspectRatio: Math.max(1, clampedAspectRatio(cover.width, cover.height)) }}>
        <Image src={cover.url} alt={cover.alt} fill sizes={SIZES} className="object-cover" />
        <OutputCaption />
      </figure>
    );
  }

  const cellClass = "relative overflow-hidden bg-surface-soft";

  return (
    <figure className={cn(FRAME_CLASS, "aspect-square")}>
      {count === 2 && (
        <div className="grid h-full grid-cols-2 gap-0.5">
          {media.slice(0, 2).map((item) => (
            <div key={item.id} className={cellClass}>
              <Image src={item.url} alt={item.alt} fill sizes="15vw" className="object-cover" />
            </div>
          ))}
        </div>
      )}
      {count === 3 && (
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-0.5">
          <div className={cn(cellClass, "row-span-2")}>
            <Image src={media[0].url} alt={media[0].alt} fill sizes="15vw" className="object-cover" />
          </div>
          {media.slice(1, 3).map((item) => (
            <div key={item.id} className={cellClass}>
              <Image src={item.url} alt={item.alt} fill sizes="15vw" className="object-cover" />
            </div>
          ))}
        </div>
      )}
      {count >= 4 && (
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-0.5">
          {media.slice(0, 4).map((item, index) => (
            <div key={item.id} className={cellClass}>
              <Image src={item.url} alt={item.alt} fill sizes="15vw" className="object-cover" />
              {index === 3 && count > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-h3 font-semibold text-white">
                  {t("media.moreImagesBadge", { count: count - 4 })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <figcaption className="absolute bottom-2 left-2 z-10 rounded-xs bg-black/55 px-1.5 py-0.5 text-caption font-medium text-white backdrop-blur-sm">
        {t("prompt.output")}
      </figcaption>
    </figure>
  );
}

/** Option 4 — Nokta göstergesi (Dot indicator): today's single-image figure, unchanged, plus a small, non-swipeable row of dots at the bottom center — a static "there's more" cue, the same affordance language as Instagram's carousel dots, without actually adding swipe interaction to the card. Zero extra height. */
export function OutputDotIndicator({ media }: { media: PromptMedia[] }) {
  const cover = media[0];
  if (!cover) return null;
  return (
    <figure className={FRAME_CLASS} style={{ aspectRatio: Math.max(1, clampedAspectRatio(cover.width, cover.height)) }}>
      <Image src={cover.url} alt={cover.alt} fill sizes={SIZES} className="object-cover" />
      <OutputCaption />
      {media.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden>
          {media.map((item, index) => (
            <span
              key={item.id}
              className={cn("h-1.5 w-1.5 rounded-full", index === 0 ? "bg-white" : "bg-white/50")}
            />
          ))}
        </div>
      )}
    </figure>
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
      <Image src={media.url} alt={media.alt} fill sizes={SIZES} className="object-cover" />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <Play size={18} fill="currentColor" />
        </span>
      </span>
      <OutputCaption />
    </figure>
  );
}
