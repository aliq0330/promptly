"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { AlertCircle } from "@/components/icons/alert-circle";
import { Chip } from "@/components/ui/chip";
import { Filter as FilterIcon } from "@/components/icons/filter";
import { CountBadge } from "@/components/ui/badge";
import { CONTROL_ICON_BUTTON } from "@/features/content/section-menu";
import { ListFilterSheet, SheetChips, SheetSection } from "@/features/content/list-toolbar";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { LoadMore } from "@/features/feed/load-more";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_COMPAT_IDS, SKILL_COMPAT_LABEL, skillLabelText } from "@/lib/skills/categories";
import { fetchSkillFeedPage, type SkillMatchSource, type SkillSort } from "@/lib/supabase/skill-discovery";
import type { SearchCursor } from "@/lib/supabase/search";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Skill, SkillCategory, SkillCompat } from "@/types";
import { SkillCard } from "./skill-card";
import { useSkillCategories } from "./use-skill-categories";
import { skillCategoryIds, skillCategoryName } from "@/lib/skills/categories";

const SORTS: { key: SkillSort; labelKey: TranslationKey }[] = [
  { key: "recommended", labelKey: "skill.discover.sortRecommended" },
  { key: "new", labelKey: "skill.discover.sortNew" },
  { key: "popular", labelKey: "skill.discover.sortPopular" },
  { key: "most_used", labelKey: "skill.discover.sortMostUsed" },
];

const MATCH_LABEL: Record<SkillMatchSource, TranslationKey> = {
  title: "skill.discover.matchTitle",
  summary: "skill.discover.matchSummary",
  tag: "skill.discover.matchTag",
  tool: "skill.discover.matchTool",
  instructions: "skill.discover.matchInstructions",
};

/**
 * Keşfet → Skill'ler (docs/history/392-*): sunucu sorgusu `skill_feed_page` (keyset). Süzgeçler (uzmanlık alanı, uyumlu araç, paketli mi) ve sıralama
 * (Önerilen · En yeni · Popüler · En çok kullanılan) veritabanında uygulanır; metin araması varsa her kartın altında eşleşmenin nerede bulunduğu yazar.
 * Skill'ler karma akışa (`feed_page`) GİRMEZ — ayrı bir bölümdür.
 */
export function SkillDiscoverSection() {
  const { t, language } = useTranslation();
  const categoryRows = useSkillCategories();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(draft.trim()), 300);
    return () => clearTimeout(id);
  }, [draft]);
  const [sort, setSort] = useState<SkillSort>("recommended");
  const [category, setCategory] = useState<SkillCategory | null>(null);
  const [compat, setCompat] = useState<SkillCompat[]>([]);
  const [hasPackage, setHasPackage] = useState(false);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [matches, setMatches] = useState<Map<string, SkillMatchSource>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const cursorRef = useRef<SearchCursor | null>(null);
  const busyRef = useRef(false);

  const compatKey = compat.join(",");
  const params = useCallback(
    () => ({ query, sort, category, compat, hasPackage: hasPackage ? true : undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compat is keyed by its joined value
    [query, sort, category, compatKey, hasPackage],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new filter starts a new load
    setLoading(true);
    setFailed(false);
    fetchSkillFeedPage(params())
      .then((page) => {
        if (cancelled) return;
        setSkills(page.items);
        setMatches(page.matchSources);
        cursorRef.current = page.nextCursor;
        setHasMore(page.nextCursor !== null);
        setLoading(false);
      })
      .catch((err) => {
        console.error("SkillDiscoverSection", err);
        if (cancelled) return;
        setSkills([]);
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params, retry]);

  const loadMore = useCallback(async () => {
    if (busyRef.current || !cursorRef.current) return;
    busyRef.current = true;
    setLoadingMore(true);
    setFailed(false);
    try {
      const page = await fetchSkillFeedPage(params(), undefined, cursorRef.current);
      setSkills((prev) => {
        const seen = new Set(prev.map((skill) => skill.id));
        return [...prev, ...page.items.filter((skill) => !seen.has(skill.id))];
      });
      setMatches((prev) => new Map([...prev, ...page.matchSources]));
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } catch (err) {
      console.error("SkillDiscoverSection more", err);
      setFailed(true);
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [params]);

  const activeCount = (category ? 1 : 0) + compat.length + (hasPackage ? 1 : 0) + (sort !== "recommended" ? 1 : 0);
  const clearFilters = () => {
    setCategory(null);
    setCompat([]);
    setHasPackage(false);
    setSort("recommended");
  };
  const toggleCompat = (id: SkillCompat) => setCompat((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-4" data-skill-discover="">
      {/* Tek kontrol satırı (Keşfet'in öteki bölümleriyle aynı kalıp): arama + Filtre; süzgeçler ve sıralama Filtre penceresindedir. */}
      <div className="flex items-center gap-2" data-skill-controls="">
        <div className="min-w-0 flex-1">
          <Input type="search" dense value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("skill.searchPlaceholder")} aria-label={t("skill.searchPlaceholder")} data-skill-search="" />
        </div>
        <button type="button" onClick={() => setFilterOpen(true)} aria-label={t("toolbar.filterTitle")} title={t("toolbar.filterTitle")} data-skill-filter="" className={cn(CONTROL_ICON_BUTTON, "relative")}>
          <FilterIcon size={24} aria-hidden />
          {activeCount > 0 && <CountBadge tone="primary" className="absolute -right-0.5 -top-0.5">{activeCount}</CountBadge>}
        </button>
      </div>
      {filterOpen && (
        <ListFilterSheet
          onClose={() => setFilterOpen(false)}
          activeCount={activeCount}
          onClear={clearFilters}
          sheetSections={
            <>
              <SheetSection title={t("skill.discover.filtersAria")}>
                <SheetChips>
                  <Chip selected={category === null} onClick={() => setCategory(null)} data-skill-category="all">
                    {t("common.all")}
                  </Chip>
                  {skillCategoryIds(categoryRows).map((id) => (
                    <Chip key={id} selected={category === id} onClick={() => setCategory(category === id ? null : id)} data-skill-category={id}>
                      {skillCategoryName(id, language, t, categoryRows)}
                    </Chip>
                  ))}
                </SheetChips>
              </SheetSection>
              <SheetSection title={t("skill.discover.toolsAria")}>
                <SheetChips>
                  {SKILL_COMPAT_IDS.map((id) => (
                    <Chip key={id} selected={compat.includes(id)} onClick={() => toggleCompat(id)} data-skill-compat={id}>
                      {skillLabelText(SKILL_COMPAT_LABEL[id], t)}
                    </Chip>
                  ))}
                  <Chip selected={hasPackage} onClick={() => setHasPackage((value) => !value)} data-skill-has-package="">
                    {t("skill.discover.hasPackage")}
                  </Chip>
                </SheetChips>
              </SheetSection>
              <SheetSection title={t("skill.discover.sortAria")}>
                <SheetChips>
                  {SORTS.map((item) => (
                    <Chip key={item.key} selected={sort === item.key} onClick={() => setSort(item.key)} data-skill-sort={item.key}>
                      {t(item.labelKey)}
                    </Chip>
                  ))}
                </SheetChips>
              </SheetSection>
            </>
          }
        />
      )}

      {loading ? (
        <PromptCardSkeletonGrid count={6} />
      ) : failed && skills.length === 0 ? (
        <EmptyState icon={AlertCircle} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: () => setRetry((n) => n + 1) }} />
      ) : skills.length === 0 ? (
        <EmptyState icon={GraduationCap} scene="search" title={t("skill.discover.noMatchTitle")} description={t("skill.discover.noMatchBody")} />
      ) : (
        <>
          <ContentGrid>
            {skills.map((skill) => {
              const source = matches.get(skill.id);
              return (
                <div key={skill.id} className={CONTENT_GRID_ITEM_CLASS}>
                  <SkillCard skill={skill} />
                  {source && (
                    <p className="mt-1.5 px-1 text-caption text-text-muted" data-skill-match={source}>
                      {t(MATCH_LABEL[source])}
                    </p>
                  )}
                </div>
              );
            })}
          </ContentGrid>
          <LoadMore failed={failed} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />
        </>
      )}
    </div>
  );
}
