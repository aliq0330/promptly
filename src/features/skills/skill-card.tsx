"use client";

import { GraduationCap } from "@/components/icons/graduation-cap";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CARD_SAVE_CLASS } from "@/features/content/action-styles";
import { FolderMinus } from "@/components/icons/folder-minus";
import { DropdownMenu, MenuItem } from "@/features/communities/dropdown-menu";
import { useToast } from "@/features/groups/use-toast";
import { postMeta } from "@/features/prompts/post-header";
import { TextArt, TextArtTitle } from "@/features/content/text-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_CATEGORY_LABEL, SKILL_COMPAT_LABEL, skillLabelText } from "@/lib/skills/categories";
import { skillHref } from "@/lib/utils";
import type { Skill } from "@/types";

/**
 * Skill kartı: görsel kart kabuğu (`ContentCardPost`, docs/history/266-*) — ikinci bir kart kabuğu yazılmaz. Görselin yeri yazı yüzeyidir
 * (ad, kısa açıklama, sürüm · araçlar), tıpkı görselsiz prompt kartı gibi. Altbilgide Beğeni + Yorum vardır (docs/history/390-*; yalnız yayında + herkese açık Skill); Kaydet de vardır (docs/history/391-*); koleksiyon sayfasında ⋮ menüsünde "Koleksiyondan kaldır".
 */
export function SkillCard({ skill, collectionRemoval }: { skill: Skill; collectionRemoval?: { onRemove: () => Promise<void> } }) {
  const { t, language } = useTranslation();
  const href = skillHref(skill);
  const category = skill.category ? t(SKILL_CATEGORY_LABEL[skill.category]) : null;
  const tools = skill.compat.map((id) => skillLabelText(SKILL_COMPAT_LABEL[id], t)).join(", ");

  const { node, show } = useToast();
  const menu = collectionRemoval ? (
    <DropdownMenu label={t("skill.menu")}>
      {(close) => (
        <MenuItem
          icon={<FolderMinus size={16} />}
          label={t("common.removeFromCollection")}
          danger
          onClick={() => {
            close();
            collectionRemoval.onRemove().catch((err) => {
              console.error("collectionRemoval", err);
              show(t("common.removeFailed"));
            });
          }}
        />
      )}
    </DropdownMenu>
  ) : undefined;
  return (
    <>
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
        menu={menu}
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
    {node}
    </>
  );
}
