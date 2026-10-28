"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { CONTENT_GRID_ITEM_CLASS, ContentCard, ContentCardPost, ContentCardTitle, ContentGrid } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { LoadMore } from "@/features/feed/load-more";
import { postMeta } from "@/features/prompts/post-header";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KIND_LABEL, SPACE_PAGE_SIZE, spaceHref } from "@/lib/spaces";
import { fetchLeadPalettes, fetchSpaceStats, listSpaces, summaryArt, type SpaceSummary } from "@/lib/supabase/spaces";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { formatRating } from "./tabs/comments-tab";
import { absoluteUrl } from "@/lib/utils";
import { SpaceMenu } from "./space-menu";
import { PaletteStrip, SpaceCoverArt, SpacesIcon } from "./space-visuals";

/**
 * Keşfet'in Spaces bölümündeki kart (docs/history/241-*, 242-*): diğer gönderilerle AYNI görsel kart kabuğu (docs/history/266-*). Space'in beğenisi yoktur — akışta
 * görünmesi bir ALINTIDIR; kartta puan ortalaması + alıntı sayısı vardır. Paylaş ("Alıntıla") ve "Panoyu gez" Space sayfasındadır.
 */
export type SpaceCardStats = { quoteCount: number; ratingAvg: number; ratingCount: number };

export function SpaceDiscoverCard({ space, palette, stats }: { space: SpaceSummary; palette: string[]; stats?: SpaceCardStats }) {
  const { t, language } = useTranslation();
  const [copied, setCopied] = useState(false);
  const href = spaceHref(space.id);
  const art = summaryArt(space);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl(href));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Panoya yazılamadı: kart değişmez.
    }
  }

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={space.owner}
        meta={space.owner ? postMeta(space.owner.username, space.updatedAt, language) : ""}
        typeIcon={SpacesIcon}
        badges={<ContentTypePill icon={SpacesIcon} label="Space" detail={t(SPACE_KIND_LABEL[space.kind])} />}
        menu={
          <SpaceMenu
            label={t("spaces.card.menu", { title: space.title })}
            items={[{ key: "copy", label: copied ? t("common.copied") : t("common.copyLink"), icon: Link2, onSelect: () => void copyLink() }]}
          />
        }
        art={
          <SpaceCoverArt urls={art} className="aspect-[4/3] w-full overflow-hidden" iconSize={40} />
        }
        title={<ContentCardTitle href={href} title={space.title} />}
        footer={
          <>
            {stats && stats.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-caption font-semibold tabular-nums text-text-secondary" data-space-card-rating="">
                <StarRatingDisplay value={stats.ratingAvg} size={13} />
                {formatRating(stats.ratingAvg, language)}
                <span className="font-normal text-text-muted">({stats.ratingCount})</span>
              </span>
            )}
            {stats && stats.quoteCount > 0 && <span className="text-caption text-text-muted">{t("quotes.count", { count: stats.quoteCount })}</span>}
          </>
        }
      >
        {palette.length > 0 && <PaletteStrip colors={palette} className="h-1.5" />}
      </ContentCardPost>
    </ContentCard>
  );
}

interface SectionState {
  spaces: SpaceSummary[];
  palettes: Map<string, string[]>;
  stats: Map<string, SpaceCardStats>;
  hasMore: boolean;
  failed: boolean;
  loading: boolean;
  loadingMore: boolean;
}

/** Herkese açık (başkalarının) Space'ler: `list_spaces('public')`, ofsetle sayfalanır; palet çizgisi ayrı tek sorgu. */
function usePublicSpaces(enabled: boolean) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<SectionState>({ spaces: [], palettes: new Map(), stats: new Map(), hasMore: false, failed: false, loading: true, loadingMore: false });
  const offset = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    offset.current = 0;
    listSpaces({ filter: "public", sort: "recommended", offset: 0 })
      .then(async (spaces) => {
        const ids = spaces.map((s) => s.id);
        const [palettes, stats] = await Promise.all([
          fetchLeadPalettes(ids).catch(() => new Map<string, string[]>()),
          fetchSpaceStats(ids).catch(() => new Map<string, SpaceCardStats>()),
        ]);
        if (cancelled) return;
        offset.current = spaces.length;
        setState({ spaces, palettes, stats, hasMore: spaces.length >= SPACE_PAGE_SIZE, failed: false, loading: false, loadingMore: false });
      })
      .catch((err) => {
        console.error("listSpaces public", err);
        if (!cancelled) setState({ spaces: [], palettes: new Map(), stats: new Map(), hasMore: false, failed: true, loading: false, loadingMore: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, retry]);

  const loadMore = useCallback(async () => {
    setState((prev) => ({ ...prev, loadingMore: true, failed: false }));
    try {
      const next = await listSpaces({ filter: "public", sort: "recommended", offset: offset.current });
      const ids = next.map((s) => s.id);
      const [palettes, stats] = await Promise.all([
        fetchLeadPalettes(ids).catch(() => new Map<string, string[]>()),
        fetchSpaceStats(ids).catch(() => new Map<string, SpaceCardStats>()),
      ]);
      offset.current += next.length;
      setState((prev) => {
        const known = new Set(prev.spaces.map((s) => s.id));
        return {
          ...prev,
          spaces: [...prev.spaces, ...next.filter((s) => !known.has(s.id))],
          palettes: new Map([...prev.palettes, ...palettes]),
          stats: new Map([...prev.stats, ...stats]),
          hasMore: next.length >= SPACE_PAGE_SIZE,
          loadingMore: false,
        };
      });
    } catch (err) {
      console.error("listSpaces public more", err);
      setState((prev) => ({ ...prev, failed: true, loadingMore: false }));
    }
  }, []);

  const retryAll = () => {
    setState((prev) => ({ ...prev, loading: true, failed: false }));
    setRetry((n) => n + 1);
  };

  return { ...state, retry: retryAll, loadMore };
}

export function SpaceDiscoverSection() {
  const { t } = useTranslation();
  const pages = usePublicSpaces(true);

  if (pages.loading) return <PromptCardSkeletonGrid count={6} />;
  if (pages.failed && pages.spaces.length === 0) {
    return <EmptyState icon={SpacesIcon} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: pages.retry }} />;
  }
  if (pages.spaces.length === 0) return <EmptyState icon={SpacesIcon} title={t("discover.noSpacesYet")} />;
  return (
    <>
      <ContentGrid columns="sm:columns-2">
        {pages.spaces.map((space) => (
          <div key={space.id} className={CONTENT_GRID_ITEM_CLASS}>
            <SpaceDiscoverCard space={space} palette={pages.palettes.get(space.id) ?? []} stats={pages.stats.get(space.id)} />
          </div>
        ))}
      </ContentGrid>
      <LoadMore failed={pages.failed} hasMore={pages.hasMore} loadingMore={pages.loadingMore} onLoadMore={() => void pages.loadMore()} />
    </>
  );
}
