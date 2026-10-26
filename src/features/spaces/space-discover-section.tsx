"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Link2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { StorageImg } from "@/components/ui/storage-media";
import { CARD_PRIMARY_CLASS, CONTENT_GRID_ITEM_CLASS, ContentCard, ContentCardPost, ContentCardTitle, ContentGrid } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { LoadMore } from "@/features/feed/load-more";
import { postMeta } from "@/features/prompts/post-header";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KIND_LABEL, SPACE_PAGE_SIZE, spaceHref } from "@/lib/spaces";
import { fetchLeadPalettes, listSpaces, spaceFromSummary, summaryArt, summaryCover, type SpaceSummary } from "@/lib/supabase/spaces";
import { absoluteUrl } from "@/lib/utils";
import { SpaceMenu } from "./space-menu";
import { PaletteStrip, SpaceCoverArt, SpacesIcon } from "./space-visuals";

/**
 * Keşfet'in Spaces bölümündeki kart (docs/history/241-*): diğer gönderilerle AYNI Albüm kabuğu. Space'in kendi beğeni/yorumu yoktur — akışta
 * görünmesi bir ALINTIDIR; kartta yalnız Paylaş (→ "Alıntıla") vardır, tek büyük eylem "Panoyu gez".
 */
export function SpaceDiscoverCard({ space, palette }: { space: SpaceSummary; palette: string[] }) {
  const { t, language } = useTranslation();
  const [copied, setCopied] = useState(false);
  const href = spaceHref(space.id);
  const cover = summaryCover(space);
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
    <ContentCard href={href}>
      <ContentCardPost
        author={space.owner}
        meta={space.owner ? postMeta(space.owner.username, space.updatedAt, language) : ""}
        badges={<ContentTypePill icon={SpacesIcon} label="Space" detail={t(SPACE_KIND_LABEL[space.kind])} />}
        menu={
          <SpaceMenu
            label={t("spaces.card.menu", { title: space.title })}
            items={[{ key: "copy", label: copied ? t("common.copied") : t("common.copyLink"), icon: Link2, onSelect: () => void copyLink() }]}
          />
        }
        art={
          <span data-card-media className="block">
            <SpaceCoverArt urls={art} className="aspect-[16/9] w-full overflow-hidden rounded-lg shadow-pop" iconSize={40} />
          </span>
        }
        backdrop={cover ? <StorageImg src={cover} alt="" className="h-full w-full object-cover" /> : undefined}
        title={<ContentCardTitle href={href} title={space.title} />}
        primary={
          <Link href={`${href}&tab=board`} className={CARD_PRIMARY_CLASS}>
            <Eye size={14} aria-hidden />
            {t("spaces.page.viewBoard")}
          </Link>
        }
        footer={
          <>
            <span className="ml-auto" />
            <ShareTriggerButton target={{ contentType: "space", space: spaceFromSummary(space), art }} />
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
  hasMore: boolean;
  failed: boolean;
  loading: boolean;
  loadingMore: boolean;
}

/** Herkese açık (başkalarının) Space'ler: `list_spaces('public')`, ofsetle sayfalanır; palet çizgisi ayrı tek sorgu. */
function usePublicSpaces(enabled: boolean) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<SectionState>({ spaces: [], palettes: new Map(), hasMore: false, failed: false, loading: true, loadingMore: false });
  const offset = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    offset.current = 0;
    listSpaces({ filter: "public", offset: 0 })
      .then(async (spaces) => {
        const palettes = await fetchLeadPalettes(spaces.map((s) => s.id)).catch(() => new Map<string, string[]>());
        if (cancelled) return;
        offset.current = spaces.length;
        setState({ spaces, palettes, hasMore: spaces.length >= SPACE_PAGE_SIZE, failed: false, loading: false, loadingMore: false });
      })
      .catch((err) => {
        console.error("listSpaces public", err);
        if (!cancelled) setState({ spaces: [], palettes: new Map(), hasMore: false, failed: true, loading: false, loadingMore: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, retry]);

  const loadMore = useCallback(async () => {
    setState((prev) => ({ ...prev, loadingMore: true, failed: false }));
    try {
      const next = await listSpaces({ filter: "public", offset: offset.current });
      const palettes = await fetchLeadPalettes(next.map((s) => s.id)).catch(() => new Map<string, string[]>());
      offset.current += next.length;
      setState((prev) => {
        const known = new Set(prev.spaces.map((s) => s.id));
        return {
          ...prev,
          spaces: [...prev.spaces, ...next.filter((s) => !known.has(s.id))],
          palettes: new Map([...prev.palettes, ...palettes]),
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
            <SpaceDiscoverCard space={space} palette={pages.palettes.get(space.id) ?? []} />
          </div>
        ))}
      </ContentGrid>
      <LoadMore failed={pages.failed} hasMore={pages.hasMore} loadingMore={pages.loadingMore} onLoadMore={() => void pages.loadMore()} />
    </>
  );
}
