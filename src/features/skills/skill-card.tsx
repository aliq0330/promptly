"use client";

import { GraduationCap } from "@/components/icons/graduation-cap";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { Bookmark } from "@/components/icons/bookmark";
import { Heart } from "@/components/icons/heart";
import { ContentTypePill } from "@/features/content/content-type-label";
import { RowMetrics } from "@/features/content/row-metrics";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CARD_SAVE_CLASS } from "@/features/content/action-styles";
import { postMeta } from "@/features/prompts/post-header";
import { PostMenu } from "@/features/prompts/post-menu";
import { usePinnedHere } from "@/features/profile/profile-pins";
import { TextArt } from "@/features/content/text-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_COMPAT_LABEL, skillCategoryName, skillLabelText } from "@/lib/skills/categories";
import { formatRelativeTime, skillHref } from "@/lib/utils";
import { useSkillCategories } from "./use-skill-categories";
import { SkillCoverCard } from "./skill-cover-card";
import { SkillCoverImage } from "./skill-cover";
import { SkillPackageArt } from "@/features/content/card-art";
import type { Skill } from "@/types";

/**
 * Skill kartı (⋮ menüsü normal kartlarla AYNI `PostMenu`'dur, docs/history/480-*): görsel kart kabuğu (`ContentCardPost`, docs/history/266-*) — ikinci bir kart kabuğu yazılmaz. Görselin yeri yazı yüzeyidir
 * (ad, kısa açıklama, sürüm · araçlar), tıpkı görselsiz prompt kartı gibi. Altbilgide Beğeni + Yorum vardır (docs/history/390-*; yalnız yayında + herkese açık Skill); Kaydet de vardır (docs/history/391-*); koleksiyon sayfasında ⋮ menüsünde "Koleksiyondan kaldır".
 */
export function SkillCard({ skill, collectionRemoval }: { skill: Skill; collectionRemoval?: { onRemove: () => Promise<void> } }) {
  const { t, language } = useTranslation();
  const href = skillHref(skill);
  const categoryRows = useSkillCategories();
  const category = skill.category ? skillCategoryName(skill.category, language, t, categoryRows) : null;
  const tools = skill.compat.map((id) => skillLabelText(SKILL_COMPAT_LABEL[id], t)).join(", ");

  const pinned = usePinnedHere("skill", skill.id);

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={skill.creator}
        meta={postMeta(skill.creator.username, skill.createdAt, language)}
        time={formatRelativeTime(skill.createdAt, language)}
        pinned={pinned}
        editHref={`/skills/create?edit=${skill.id}`}
        ownMetrics={
          <RowMetrics
            items={[
              { icon: Heart, label: t("card.row.likes"), value: skill.likeCount },
              { icon: Bookmark, label: t("card.row.saves"), value: skill.saveCount },
            ]}
          />
        }
        typeIcon={GraduationCap}
        status={
          skill.status === "draft" ? <Badge variant="warning">{t("skill.draftBadge")}</Badge> : skill.visibility === "private" ? <Badge variant="neutral">{t("skill.privateBadge")}</Badge> : undefined
        }
        badges={<ContentTypePill icon={GraduationCap} label={t("skill.singular")} detail={category} />}
        art={
          <SkillPackageArt
            skillId={skill.id}
            cover={skill.coverPath ? <SkillCoverImage path={skill.coverPath} className="absolute inset-0 h-full w-full object-cover" /> : null}
            plain={
          skill.coverPath ? (
            <SkillCoverCard path={skill.coverPath} fallback={<TextArt seed={skill.id}><span aria-hidden className="grid h-12 w-12 place-items-center rounded-md bg-primary text-primary-foreground"><GraduationCap size={24} /></span></TextArt>} />
          ) : (
          <TextArt seed={skill.id}>
            {/* Akış 2.1 (docs/history/451-*): paket kimliği — simge karosu başlığın üstünde. */}
            <span aria-hidden className="grid h-12 w-12 place-items-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap size={24} />
            </span>
            <p className="truncate text-caption opacity-70">
              {t("skill.cardVersion", { version: skill.version })}
              {tools ? ` · ${tools}` : ""}
            </p>
          </TextArt>
          )
            }
          />
        }
        title={<ContentCardTitle href={href} title={skill.title || t("skill.untitled")} description={skill.summary} />}
        menu={<PostMenu target={{ kind: "skill", skill }} collectionRemoval={collectionRemoval} />}
        footer={
          skill.status === "published" && skill.visibility === "public" ? (
            <>
              <LikeButton id={skill.id} likeCount={skill.likeCount} contentType="skill" />
              <CommentCountLink skillId={skill.id} baseCount={skill.commentCount} />
              <SaveButton skillId={skill.id} saveCount={skill.saveCount} className={CARD_SAVE_CLASS} />
            </>
          ) : undefined
        }
      />
    </ContentCard>
  );
}
