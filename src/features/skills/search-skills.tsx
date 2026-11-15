"use client";

import { useEffect, useRef, useState } from "react";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { Eyebrow } from "@/features/content/detail-parts";
import { LoadMoreButton } from "@/features/feed/load-more";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILLS_MENU_ENABLED } from "@/lib/skills/flag";
import { fetchSkillFeedPage } from "@/lib/supabase/skill-discovery";
import type { SearchCursor } from "@/lib/supabase/search";
import type { Skill } from "@/types";
import { SkillCard } from "./skill-card";

/**
 * Genel aramadaki "Skill'ler" grubu (docs/history/398-*): metin aramasında başlık/özet/etiket/araç/talimat eşleşen yayında + herkese açık Skill'ler (`skill_feed_page`),
 * gönderi gruplarının yanında. `search_content` değişmedi (Skill ayrı bir RPC'dir). Menü bayrağı kapalıyken grup yoktur. `onCount` "sonuç yok" metnini doğru tutar.
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
    fetchSkillFeedPage({ query, sort: "recommended" }, 12)
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
      const page = await fetchSkillFeedPage({ query, sort: "recommended" }, 12, cursor);
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
        <span className="rounded-xs bg-surface-soft px-1.5 py-0.5 tabular-nums tracking-normal text-text-muted">{skills.length}</span>
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
