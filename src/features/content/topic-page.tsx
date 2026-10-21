"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LayoutGrid, Sparkles, SquareTerminal, SlidersHorizontal, Workflow as WorkflowIcon, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { StorageImage } from "@/components/ui/storage-media";
import { BandActionRow, CollageArt, DetailBand, DetailShell, DetailTitle, Eyebrow } from "@/features/content/detail-parts";
import { contentImage } from "@/features/content/content-image";
import { SectionNav } from "@/features/content/section-nav";
import { TaxonomySheetSections, taxonomyActiveCount } from "@/features/content/list-toolbar";
import { TaxonomyTypeChips } from "@/features/content/taxonomy-filter";
import { SORT_KEYS, type ContentSortKey } from "@/features/content/sort-select";
import { FeedItemsView } from "@/features/feed/feed-items-view";
import { LoadMore } from "@/features/feed/load-more";
import { useFeedPages } from "@/features/feed/use-feed-pages";
import { ShareButton } from "@/features/prompts/share-button";
import { fetchFeedCount, fetchFeedPage, type FeedKind } from "@/lib/supabase/feed";
import { feedOrderForSort } from "@/lib/feed-cursor";
import { EMPTY_TAXONOMY_FILTER, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { formatCount } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PromptMedia } from "@/types";

type Section = "all" | FeedKind;

const SECTIONS: { key: Section; labelKey: TranslationKey; icon: LucideIcon }[] = [
  { key: "all", labelKey: "common.all", icon: LayoutGrid },
  { key: "prompt", labelKey: "feed.filterPrompts", icon: SquareTerminal },
  { key: "workflow", labelKey: "nav.workflows", icon: WorkflowIcon },
  { key: "preset", labelKey: "nav.presets", icon: SlidersHorizontal },
  { key: "request", labelKey: "nav.requestsShort", icon: Sparkles },
];

/** What a topic page lists: a fixed taxonomy level (category page), a tag, a tool — server-side (`feed_page`), keyset. */
export interface TopicFilter {
  taxonomy: TaxonomyFilterValue;
  tag?: string | null;
  tool?: string | null;
}

/**
 * The one page template behind tag, category and tool pages (docs/history/211-*): a compact Albüm band (a collage of the
 * topic's most liked pictures + kicker, title, count), one action row (`primary` — Takip Et for a tag/tool — then Paylaş),
 * then — like Ana Sayfa and Keşfet — the section tiles with ONE control row (sort, Filtre, Kart | Izgara) and the posts.
 * `beforeNav` (a category's subcategory chips) sits between the action row and the tiles.
 */
export function TopicPage({
  filter,
  kicker,
  title,
  icon,
  count,
  countKey = "topic.postCount",
  primary,
  shareUrl,
  shareTitle,
  actionsLabel,
  description,
  beforeNav,
}: {
  filter: TopicFilter;
  kicker: ReactNode;
  title: string;
  icon: LucideIcon;
  /** Known up front (a tag's `usage_count`); otherwise counted by the database with the page's own filters. */
  count?: number | null;
  countKey?: TranslationKey;
  primary?: ReactNode;
  shareUrl: string;
  shareTitle: string;
  actionsLabel: string;
  /** One quiet line under the count (a category's description). */
  description?: string | null;
  beforeNav?: ReactNode;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("all");
  const [sort, setSort] = useState<ContentSortKey>("newest");
  // A category page fixes the type; elsewhere the viewer can narrow by type / category in the Filtre sheet.
  const typeFixed = Boolean(filter.taxonomy.contentType);
  const [picked, setPicked] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const taxonomy = typeFixed ? filter.taxonomy : picked;
  const { tag = null, tool = null } = filter;
  const filterKey = `${filter.taxonomy.contentType}|${filter.taxonomy.category}|${filter.taxonomy.subcategory}|${tag}|${tool}`;

  const feed = useFeedPages(
    { scope: "all", order: feedOrderForSort(sort), kind: section === "all" ? "all" : section, taxonomy, tag, tool },
    true,
  );

  const countKnown = count !== undefined;
  // The band: the topic's most liked pictures (collage + tint) and its count, once per topic.
  const [cover, setCover] = useState<{ key: string; images: PromptMedia[] } | null>(null);
  const [counted, setCounted] = useState<{ key: string; value: number | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const base = { taxonomy: filter.taxonomy, tag, tool };
    fetchFeedPage({ scope: "all", order: "popular", kind: "all", ...base, limit: 12 })
      .then((page) => {
        if (cancelled) return;
        const images = page.items.map((item) => contentImage(item)).filter((media): media is PromptMedia => media !== null).slice(0, 4);
        setCover({ key: filterKey, images });
      })
      .catch(() => !cancelled && setCover({ key: filterKey, images: [] }));
    if (!countKnown) fetchFeedCount(base).then((value) => !cancelled && setCounted({ key: filterKey, value }));
    return () => {
      cancelled = true;
    };
    // `filterKey` is the topic's identity; the objects behind it are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, countKnown]);

  const images = cover?.key === filterKey ? cover.images : [];
  const total = countKnown ? count : counted?.key === filterKey ? counted.value : null;

  return (
    <DetailShell
      band={
        <DetailBand
          compact
          data-topic-band=""
          backdrop={images[0] ? <StorageImage src={images[0].url} alt="" fill sizes="100vw" className="object-cover" /> : undefined}
          art={<CollageArt compact images={images} icon={icon} />}
          kicker={kicker}
          title={<DetailTitle className="text-[1.625rem] sm:text-[2.5rem]">{title}</DetailTitle>}
          byline={
            <div className="space-y-1">
              <p className="text-small text-text-secondary sm:text-body" data-topic-count="">
                {typeof total === "number" ? t(countKey, { count: formatCount(total) }) : " "}
              </p>
              {description && <p className="line-clamp-2 max-w-2xl text-small text-text-muted max-sm:hidden">{description}</p>}
            </div>
          }
        />
      }
      actions={
        <BandActionRow label={actionsLabel} data-topic-actions="">
          {primary}
          <ShareButton url={shareUrl} title={shareTitle} label={primary ? undefined : t("common.share")} className="h-11 min-w-11 rounded-full px-3" />
        </BandActionRow>
      }
    >
      <div className="space-y-4">
        {beforeNav}
        <SectionNav
          items={SECTIONS.map((s) => ({ key: s.key, label: t(s.labelKey), icon: s.icon }))}
          active={section}
          onChange={setSection}
          ariaLabel={t("topic.sectionsAria")}
          chips={typeFixed ? undefined : <TaxonomyTypeChips value={picked} onChange={setPicked} />}
          chipsLabel={t("toolbar.contentTypeAria")}
          sort={sort}
          onSortChange={setSort}
          sortKeys={SORT_KEYS}
          sheetSections={typeFixed ? undefined : <TaxonomySheetSections value={picked} onChange={setPicked} />}
          activeCount={typeFixed ? 0 : taxonomyActiveCount(picked, true)}
          onClear={typeFixed ? undefined : () => setPicked(EMPTY_TAXONOMY_FILTER)}
        />
        {feed.loading ? (
          <PromptCardSkeletonGrid count={4} />
        ) : feed.failed && feed.items.length === 0 ? (
          <EmptyState icon={icon} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: feed.retry }} />
        ) : (
          <>
            <FeedItemsView items={feed.items} emptyTitle={section === "all" && !taxonomyActiveCount(picked, true) ? t("topic.empty") : t("topic.emptyFilter")} />
            <LoadMore failed={feed.failed} hasMore={feed.hasMore} loadingMore={feed.loadingMore} onLoadMore={() => void feed.loadMore()} />
          </>
        )}
      </div>
    </DetailShell>
  );
}

/** The kicker of a topic band ("ETİKET", "KATEGORİ · GÖRSEL", "ARAÇ · OPENAI"). */
export function TopicKicker({ children }: { children: ReactNode }) {
  return <Eyebrow tone="primary">{children}</Eyebrow>;
}
