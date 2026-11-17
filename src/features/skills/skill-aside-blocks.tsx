"use client";

import { GraduationCap } from "@/components/icons/graduation-cap";
import { AsideSection } from "@/features/content/detail-parts";
import { RelatedCards, RelatedCardsSkeleton } from "@/features/content/related-cards";
import { useRelated } from "@/features/content/use-related";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILLS_LIST_HREF, SKILLS_MENU_ENABLED } from "@/lib/skills/flag";
import { fetchRelatedSkills, fetchSkillsForContent } from "@/lib/supabase/skill-discovery";
import { skillHref } from "@/lib/utils";
import type { Skill } from "@/types";

function SkillCards({ items, limit }: { items: Skill[] | null; limit: number }) {
  if (!items) return <RelatedCardsSkeleton count={limit} />;
  return (
    <RelatedCards
      items={items.map((skill) => ({
        id: skill.id,
        href: skillHref(skill),
        title: skill.title,
        meta: `v${skill.version} · ${skill.creator.displayName}`,
        icon: GraduationCap,
        image: null,
      }))}
    />
  );
}

/** Skill detayında "Benzer Skill'ler" (docs/history/392-*): sunucu seçer (`related_skills`: aynı uzmanlık alanı, ortak etiket/araç, aynı yazar); sinyal yoksa ya da hata varsa bölüm çizilmez. */
export function SimilarSkills({ skillId, limit = 4 }: { skillId: string; limit?: number }) {
  const { t } = useTranslation();
  const { loading, failed, items } = useRelated(skillId, () => fetchRelatedSkills(skillId, limit));
  if (failed || (!loading && items.length === 0)) return null;
  return (
    <AsideSection id="skill-similar-title" title={t("skill.discover.related")} href={SKILLS_LIST_HREF}>
      <SkillCards items={loading ? null : items} limit={limit} />
    </AsideSection>
  );
}

/**
 * Ters yön: "Bu içerik şu Skill'lerde" — bir prompt / workflow / ayar paketine BAĞLI herkese açık Skill'ler (`skill_relations`). Skill özelliği
 * bayrak arkasındayken hiç çizilmez; Skill yoksa ya da hata varsa da çizilmez.
 */
export function SkillsUsingContent({ type, id, limit = 4 }: { type: "prompt" | "workflow" | "preset"; id: string; limit?: number }) {
  const { t } = useTranslation();
  const { loading, failed, items } = useRelated(`${type}:${id}`, () => (SKILLS_MENU_ENABLED ? fetchSkillsForContent(type, id, limit) : Promise.resolve([])));
  if (!SKILLS_MENU_ENABLED || failed || (!loading && items.length === 0)) return null;
  return (
    <AsideSection id="content-skills-title" title={t("skill.discover.inSkills")}>
      <SkillCards items={loading ? null : items} limit={limit} />
    </AsideSection>
  );
}
