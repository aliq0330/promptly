"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, Palette } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { StorageImg } from "@/components/ui/storage-media";
import { buttonClassName } from "@/components/ui/button";
import { DropdownMenu, MenuItem } from "@/features/communities/dropdown-menu";
import { EngageCommentCount, EngageComments, EngageLike, EngageShare, EngageStatistics } from "@/features/content/scoped-engagement";
import {
  AsideSection,
  DetailActionBar,
  DetailAside,
  DetailBand,
  DetailComments,
  DetailLede,
  DetailSection,
  DetailShell,
  DetailTitle,
} from "@/features/content/detail-parts";
import { usePostMenuExtras } from "@/features/prompts/post-menu-extras";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KIND_LABEL, spaceHref } from "@/lib/spaces";
import { spaceFromSummary, summaryArt, summaryCover, type SpaceFeedCard } from "@/lib/supabase/spaces";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { PaletteStrip, SpaceCoverArt, SpacesIcon } from "./space-visuals";

/**
 * Bir alıntının / başvuru gönderisinin içinde Space (docs/history/241-*): diğer dört türün detay sayfasıyla AYNI iskelet (`DetailShell`: Albüm bandı,
 * tek eylem satırı, "Hakkında" sütunu, yorumlar). Space'in detay sayfası yoktur (pano/vitrin kendi sayfasıdır) ve kendi beğeni/yorumu da yoktur —
 * `Engage*` ailesi çevreleyen `QuoteScope`/`PostScope`'u okur, yani her etkileşim ALINTIYA/GÖNDERİYE gider. Birincil eylem "Panoyu gez";
 * ⋮ menüsü `PostMenuExtras`'tan (alıntıyı sil / şikâyet et…) beslenir.
 */
export function SpacePreview({ space }: { space: SpaceFeedCard }) {
  const { t, language } = useTranslation();
  const extras = usePostMenuExtras();
  const highlight = useSearchParams().get("hl");
  const highlightCommentId = highlight?.startsWith("comment:") ? highlight.slice("comment:".length) : null;
  const art = summaryArt(space);
  const cover = summaryCover(space);
  const href = spaceHref(space.id);
  const counts = [
    t("spaces.count.images", { count: space.imageCount }),
    t("spaces.count.prompts", { count: space.promptCount }),
    t("spaces.count.notes", { count: space.noteCount }),
  ];

  const aside = (
    <DetailAside>
      <AsideSection id="space-info-title" title={t("spaces.preview.about")}>
        <dl className="divide-y divide-border-soft text-small">
          {[
            [t("spaces.tab.images"), space.imageCount],
            [t("spaces.tab.prompts"), space.promptCount],
            [t("spaces.tab.notes"), space.noteCount],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums text-text">{value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-text-muted">{t("spaces.preview.updated")}</dt>
            <dd className="truncate font-semibold text-text">{formatRelativeTime(space.updatedAt, language)}</dd>
          </div>
        </dl>
      </AsideSection>
    </DetailAside>
  );

  return (
    <DetailShell
      band={
        <DetailBand
          data-space-preview={space.id}
          backdrop={cover ? <StorageImg src={cover} alt="" className="h-full w-full object-cover" /> : undefined}
          art={
            <SpaceCoverArt
              urls={art}
              className="aspect-[16/9] w-full overflow-hidden rounded-[22px] border-4 border-surface shadow-pop"
              iconSize={48}
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
          title={<DetailTitle>{space.title}</DetailTitle>}
          byline={
            space.owner ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
                <Link href={profileHref(space.owner)} className="inline-flex items-center gap-1.5 font-semibold text-text hover:text-primary">
                  <Avatar src={space.owner.avatarUrl} alt="" size={22} />
                  {space.owner.displayName}
                </Link>
                <span aria-hidden>·</span>
                <span>{formatRelativeTime(space.createdAt, language)}</span>
              </p>
            ) : null
          }
          menu={
            extras.length > 0 ? (
              <DropdownMenu label={t("quotes.card.menu")}>
                {(close) => (
                  <>
                    {extras.map((extra) => (
                      <MenuItem key={extra.key} icon={extra.icon} label={extra.label} danger={extra.danger} onClick={() => { close(); extra.onSelect(); }} />
                    ))}
                  </>
                )}
              </DropdownMenu>
            ) : undefined
          }
        />
      }
      aside={aside}
      actions={
        <DetailActionBar
          primary={
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`${href}&tab=board`} data-space-preview-board className={buttonClassName({ size: "lg", className: "h-14 rounded-full px-7 shadow-pop" })}>
                <Eye size={18} aria-hidden /> {t("spaces.page.viewBoard")}
              </Link>
              <Link href={href} data-post-space={space.id} className={buttonClassName({ variant: "outline", size: "lg", className: "h-14 rounded-full px-6" })}>
                {t("spaces.preview.open")}
              </Link>
            </div>
          }
          end={
            <>
              <EngageStatistics target={{ contentType: "space", contentId: space.id, likeCount: 0, commentCount: 0 }} size={20} />
              <EngageShare target={{ contentType: "space", space: spaceFromSummary(space), art }} />
            </>
          }
        >
          <EngageLike id={space.id} likeCount={0} size={20} />
          <EngageCommentCount baseCount={0} size={20} />
        </DetailActionBar>
      }
    >
      <article className="min-w-0 space-y-8">
        {space.description && <DetailLede>{space.description}</DetailLede>}
        <p className="text-small text-text-muted">{counts.join(" · ")}</p>

        {space.palette.length > 0 && (
          <DetailSection title={t("spaces.tab.palette")}>
            <div className="flex items-center gap-3">
              <Palette size={16} aria-hidden className="shrink-0 text-text-secondary" />
              <PaletteStrip colors={space.palette} copyable className="min-w-0 flex-1" />
            </div>
          </DetailSection>
        )}

        {space.previewUrls.length > 0 && (
          <DetailSection title={t("spaces.tab.images")}>
            <Link href={`${href}&tab=images`} className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t("spaces.tab.images")}>
              {space.previewUrls.slice(0, 4).map((url) => (
                <span key={url} className="block aspect-square overflow-hidden rounded-lg bg-surface-soft">
                  <StorageImg src={url} alt="" className="h-full w-full object-cover" />
                </span>
              ))}
            </Link>
          </DetailSection>
        )}

        <DetailComments>
          <EngageComments target={{ spaceId: space.id }} highlightCommentId={highlightCommentId} headless />
        </DetailComments>
      </article>
    </DetailShell>
  );
}
