"use client";

import { GraduationCap } from "@/components/icons/graduation-cap";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { postMeta } from "@/features/prompts/post-header";
import { TextArt, TextArtTitle } from "@/features/content/text-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_CATEGORY_LABEL, SKILL_COMPAT_LABEL, skillLabelText } from "@/lib/skills/categories";
import { skillHref } from "@/lib/utils";
import type { Skill } from "@/types";

/**
 * Skill kartı: görsel kart kabuğu (`ContentCardPost`, docs/history/266-*) — ikinci bir kart kabuğu yazılmaz. Görselin yeri yazı yüzeyidir
 * (ad, kısa açıklama, sürüm · araçlar), tıpkı görselsiz prompt kartı gibi. Beğeni/yorum/kaydet altbilgisi sonraki dilimdir (yapılacaklar listesi).
 */
export function SkillCard({ skill }: { skill: Skill }) {
  const { t, language } = useTranslation();
  const href = skillHref(skill);
  const category = skill.category ? t(SKILL_CATEGORY_LABEL[skill.category]) : null;
  const tools = skill.compat.map((id) => skillLabelText(SKILL_COMPAT_LABEL[id], t)).join(", ");

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={skill.creator}
        meta={postMeta(skill.creator.username, skill.createdAt, language)}
        typeIcon={GraduationCap}
        status={
          skill.status === "draft" ? <Badge variant="warning">{t("skill.draftBadge")}</Badge> : skill.visibility === "private" ? <Badge variant="neutral">{t("skill.privateBadge")}</Badge> : undefined
        }
        badges={<ContentTypePill icon={GraduationCap} label={t("skill.singular")} detail={category} />}
        titleInArt
        art={
          <TextArt seed={skill.id}>
            <TextArtTitle>{skill.title || t("skill.untitled")}</TextArtTitle>
            {skill.summary && <p className="line-clamp-3 break-words font-sans text-small leading-relaxed opacity-90">{skill.summary}</p>}
            <p className="truncate text-caption opacity-70">
              {t("skill.cardVersion", { version: skill.version })}
              {tools ? ` · ${tools}` : ""}
            </p>
          </TextArt>
        }
        title={<ContentCardTitle href={href} title={skill.title || t("skill.untitled")} />}
      />
    </ContentCard>
  );
}
