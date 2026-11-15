"use client";

import { GraduationCap } from "@/components/icons/graduation-cap";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { ProfileEmptyState } from "@/features/profile/profile-empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchSkillsByAuthorPage } from "@/lib/supabase/skills";
import { SkillCard } from "./skill-card";

/**
 * Profil → Skill'ler (docs/history/390-*): kişinin Skill'leri 24'erli sayfa, kendiliğinden devam. Ziyaretçi yalnız yayında + herkese açık olanları görür;
 * sahibi taslak ve özel Skill'lerini de (kartta rozetle) görür.
 */
export function ProfileSkillsPanel({ ownerId, isOwn }: { ownerId: string; isOwn: boolean }) {
  const { t } = useTranslation();
  const list = usePagedList(`skills|${ownerId}|${isOwn ? "own" : "visitor"}`, true, (offset) => fetchSkillsByAuthorPage(ownerId, isOwn, offset));
  return (
    <PagedListState list={list}>
      {list.items.length === 0 ? (
        <ProfileEmptyState
          icon={GraduationCap}
          title={t("skill.noneYetTitle")}
          description={isOwn ? t("skill.profile.noneOwn") : t("skill.profile.noneOther")}
          action={isOwn ? { label: t("skill.create"), href: "/skills/create" } : undefined}
        />
      ) : (
        <ContentGrid>
          {list.items.map((skill) => (
            <div key={skill.id} className={CONTENT_GRID_ITEM_CLASS}>
              <SkillCard skill={skill} />
            </div>
          ))}
        </ContentGrid>
      )}
    </PagedListState>
  );
}
