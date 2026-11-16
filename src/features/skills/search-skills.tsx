"use client";

import { useEffect, useRef, useState } from "react";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { Eyebrow } from "@/features/content/detail-parts";
import { LoadMoreButton } from "@/features/feed/load-more";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILLS_MENU_ENABLED } from "@/lib/skills/flag";
import { searchContentIds, type SearchCursor } from "@/lib/supabase/search";
import { fetchSkillsByIds } from "@/lib/supabase/skills";
import type { Skill } from "@/types";
import { SkillCard } from "./skill-card";

const PAGE_SIZE = 12;

/** One search page: ids from `search_content` in result order, then the cards (a row that vanished in between, e.g. a blocked author, is skipped). */
async function fetchPage(query: string, cursor: SearchCursor | null): Promise<{ items: Skill[]; nextCursor: SearchCursor | null }> {
  const { ids, nextCursor } = await searchContentIds("skill", query, {}, PAGE_SIZE, cursor);
  const byId = new Map((await fetchSkillsByIds(ids)).map((skill) => [skill.id, skill]));
  return { items: ids.flatMap((id) => byId.get(id) ?? []), nextCursor };
}

/**
 * Genel aramadaki "Skill'ler" grubu (docs/history/398-*, 402-*): metin aramasında başlık/özet/talimat/etiket eşleşen yayında + herkese açık Skill'ler, gönderi gruplarının yanında.
 * Diğer türlerle AYNI arama motoru: `search_content` `p_kind='skill'` (keyset üçlüsü, alaka sırası); kartlar kimlik sırasıyla okunur. Menü bayrağı kapalıyken grup yoktur.
 * `onCount` "sonuç yok" metnini doğru tutar.
 */
export function SearchSkills({ query, onCount }: { query: string; onCount: (count: number) => void }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [cursor, setCursor] = useState<SearchCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    if (!SKILLS_MENU_ENABLED) return;
    const mine = ++generation.current;
    fetchPage(query, null)
      .then((page) => {
        if (mine !== generation.current) return;
        setSkills(page.items);
        setCursor(page.nextCursor);
        onCount(page.items.length);
      })
      .catch((err) => {
        console.error("search skills", err);
        if (mine === generation.current) {
          setSkills([]);
          setCursor(null);
          onCount(0);
        }
      });
    return () => {
      generation.current += 1;
    };
  }, [query, onCount]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(query, cursor);
      if (mine !== generation.current) return;
      setSkills((previous) => [...previous, ...page.items.filter((skill) => !previous.some((old) => old.id === skill.id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      console.error("search skills more", err);
    }
    setLoadingMore(false);
  }

  if (!SKILLS_MENU_ENABLED || skills.length === 0) return null;
  return (
    <section className="space-y-3" data-search-skills="">
      <Eyebrow as="h2" className="px-1">
        {t("skill.pageTitle")}
        <span className="rounded-xs bg-surface-soft px-1.5 py-0.5 tabular-nums text-text-muted">{skills.length}</span>
      </Eyebrow>
      <ContentGrid>
        {skills.map((skill) => (
          <div key={skill.id} className={CONTENT_GRID_ITEM_CLASS}>
            <SkillCard skill={skill} />
          </div>
        ))}
      </ContentGrid>
      {cursor && <LoadMoreButton wrapperClassName="flex justify-center pt-1" onLoadMore={() => void loadMore()} loading={loadingMore} />}
    </section>
  );
}
