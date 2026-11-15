"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "@/components/icons/download";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { PenLine } from "@/components/icons/pen-line";
import { Share2 } from "@/components/icons/share-2";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { ContentListPage } from "@/features/content/content-list-page";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchRecentSkills } from "@/lib/supabase/skills";
import { searchSkillsPage } from "@/lib/supabase/skill-discovery";
import type { KeysetCursor } from "@/lib/supabase/pagination";
import type { Skill } from "@/types";
import { SkillCard } from "./skill-card";

const PAGE_SIZE = 24;

/**
 * `/skills` — herkese açık Skill'ler (en yeni önce, keyset). Liste yalnız bu ekran açılınca yüklenir (sağlayıcı yok, docs/history/325-*).
 * Süzgeç/sıralama/Keşfet bölümü sonraki dilimdir (`docs/yapilacaklar.md`).
 */
export function SkillsListView() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<KeysetCursor | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchRecentSkills(PAGE_SIZE).then((page) => {
      if (cancelled) return;
      setSkills(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (busyRef.current || !cursorRef.current) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchRecentSkills(PAGE_SIZE, cursorRef.current);
      setSkills((prev) => {
        const seen = new Set(prev.map((skill) => skill.id));
        return [...prev, ...page.items.filter((skill) => !seen.has(skill.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  return (
    <ContentListPage
      icon={GraduationCap}
      title={t("skill.pageTitle")}
      description={t("skill.pageDescription")}
      emptyScene="studio"
      createHref="/skills/create"
      createLabel={t("skill.create")}
      steps={[
        { icon: PenLine, titleKey: "skill.step1Title", bodyKey: "skill.step1Body" },
        { icon: Share2, titleKey: "skill.step2Title", bodyKey: "skill.step2Body" },
        { icon: Download, titleKey: "skill.step3Title", bodyKey: "skill.step3Body" },
      ]}
      baseItems={skills}
      loading={loading}
      search={searchSkillsPage}
      showCategories={false}
      renderItems={(items) => (
        <ContentGrid>
          {items.map((skill) => (
            <div key={skill.id} className={CONTENT_GRID_ITEM_CLASS}>
              <SkillCard skill={skill} />
            </div>
          ))}
        </ContentGrid>
      )}
      searchPlaceholder={t("skill.searchPlaceholder")}
      emptyTitle={t("skill.noneYetTitle")}
      emptyBody={t("skill.noneYetBody")}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
