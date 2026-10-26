"use client";

import Link from "next/link";
import { ArrowUpRight, Eye, Palette } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonClassName } from "@/components/ui/button";
import { StorageImg } from "@/components/ui/storage-media";
import { BAND_PRIMARY_CLASS, BandActionRow, DetailBand } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KIND_LABEL, spaceHref } from "@/lib/spaces";
import { summaryArt, summaryCover, type SpaceFeedCard } from "@/lib/supabase/spaces";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import { PaletteStrip, SpaceCoverArt, SpacesIcon } from "./space-visuals";

/**
 * Bir alıntının / başvuru gönderisinin içinde Space'in ÖNİZLEMESİ (docs/history/241-*): diğer dört türün detay sayfası gibi Albüm bandı (kapak kolajından
 * renk, kolaj, "Space · tür", başlık, açıklama, sahip, ilk paletin çizgisi) + "Panoyu gez" / "Space'i aç". Space'in kendi beğeni/yorumu yoktur —
 * etkileşim, bu önizlemeyi çevreleyen alıntıya ya da gönderiye aittir (`QuoteEngagement` / `PostEngagement`).
 */
export function SpacePreview({ space }: { space: SpaceFeedCard }) {
  const { t, language } = useTranslation();
  const art = summaryArt(space);
  const cover = summaryCover(space);
  const href = spaceHref(space.id);
  return (
    <div data-space-preview={space.id}>
      <DetailBand
        compact
        backdrop={cover ? <StorageImg src={cover} alt="" className="h-full w-full object-cover" /> : undefined}
        art={
          <SpaceCoverArt
            urls={art}
            className="h-24 w-24 overflow-hidden rounded-[18px] border-[3px] border-surface shadow-pop lg:h-[200px] lg:w-[200px] lg:rounded-[22px] lg:border-4"
            iconSize={40}
          />
        }
        kicker={
          <p className="flex flex-wrap items-center gap-2 text-caption font-bold uppercase tracking-[0.1em] text-primary">
            <span className="inline-flex items-center gap-1.5">
              <SpacesIcon size={13} strokeWidth={2.25} aria-hidden />
              Space · {t(SPACE_KIND_LABEL[space.kind])}
            </span>
          </p>
        }
        title={<h2 className="break-words font-display text-[clamp(1.6rem,4vw,2.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-text">{space.title}</h2>}
        byline={
          <div className="space-y-2">
            {space.description && <p className="max-w-2xl whitespace-pre-wrap break-words text-small text-text-secondary">{space.description}</p>}
            {space.owner && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
                <Link href={profileHref(space.owner)} className="inline-flex items-center gap-1.5 font-semibold text-text hover:text-primary">
                  <Avatar src={space.owner.avatarUrl} alt="" size={22} />
                  {space.owner.displayName}
                </Link>
                <span aria-hidden>·</span>
                <span>{t("spaces.card.edited", { time: formatRelativeTime(space.updatedAt, language) })}</span>
              </p>
            )}
            {space.palette.length > 0 && (
              <div className="flex max-w-xl items-center gap-3 pt-1 max-lg:-ml-28 max-lg:pt-3">
                <Palette size={14} aria-hidden className="shrink-0 text-text-secondary" />
                <PaletteStrip colors={space.palette} className="min-w-0 flex-1" />
              </div>
            )}
          </div>
        }
      />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
        <BandActionRow label={t("spaces.page.actions")}>
          <Link href={`${href}&tab=board`} data-space-preview-board className={buttonClassName({ className: cn(BAND_PRIMARY_CLASS, "max-sm:flex-1") })}>
            <Eye size={18} aria-hidden />
            {t("spaces.page.viewBoard")}
          </Link>
          <Link href={href} data-post-space={space.id} className={buttonClassName({ variant: "outline", className: "h-12 gap-1.5 rounded-full px-5" })}>
            {t("spaces.preview.open")}
            <ArrowUpRight size={14} aria-hidden />
          </Link>
        </BandActionRow>
      </div>
    </div>
  );
}
