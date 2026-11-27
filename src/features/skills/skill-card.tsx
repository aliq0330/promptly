"use client";

import { useState } from "react";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CARD_SAVE_CLASS } from "@/features/content/action-styles";
import { FolderMinus } from "@/components/icons/folder-minus";
import { Link2 } from "@/components/icons/link-2";
import { Shapes } from "@/components/icons/shapes";
import { useAuth } from "@/features/auth/auth-provider";
import { AddToSpaceModal } from "@/features/spaces/add-to-space-modal";
import { shareLinkForHref } from "@/lib/share-link";
import { DropdownMenu, MenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/features/groups/use-toast";
import { postMeta } from "@/features/prompts/post-header";
import { TextArt } from "@/features/content/text-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILL_COMPAT_LABEL, skillCategoryName, skillLabelText } from "@/lib/skills/categories";
import { absoluteUrl, formatRelativeTime, skillHref } from "@/lib/utils";
import { usePostMenuExtras } from "@/features/prompts/post-menu-extras";
import { useSkillCategories } from "./use-skill-categories";
import { SkillCoverCard } from "./skill-cover-card";
import type { Skill } from "@/types";

/**
 * Skill kartı: görsel kart kabuğu (`ContentCardPost`, docs/history/266-*) — ikinci bir kart kabuğu yazılmaz. Görselin yeri yazı yüzeyidir
 * (ad, kısa açıklama, sürüm · araçlar), tıpkı görselsiz prompt kartı gibi. Altbilgide Beğeni + Yorum vardır (docs/history/390-*; yalnız yayında + herkese açık Skill); Kaydet de vardır (docs/history/391-*); koleksiyon sayfasında ⋮ menüsünde "Koleksiyondan kaldır".
 */
export function SkillCard({ skill, collectionRemoval }: { skill: Skill; collectionRemoval?: { onRemove: () => Promise<void> } }) {
  const { t, language } = useTranslation();
  const href = skillHref(skill);
  const categoryRows = useSkillCategories();
  const category = skill.category ? skillCategoryName(skill.category, language, t, categoryRows) : null;
  const tools = skill.compat.map((id) => skillLabelText(SKILL_COMPAT_LABEL[id], t)).join(", ");

  const { node, show } = useToast();
  const { user } = useAuth();
  // Sana özel / Keşfet: "İlgimi çekiyor / çekmiyor" satırları alt ağaçtan gelir (docs/history/408-*; normal kartlarla aynı tek menü).
  const extras = usePostMenuExtras();
  const [spaceOpen, setSpaceOpen] = useState(false);
  const shareable = skill.status === "published" && skill.visibility === "public";
  // Kartın ⋮ menüsü normal prompt kartıyla aynı satırları taşır (docs/history/404-*): bağlantıyı kopyala, Space'e ekle (oturumlu), koleksiyon sayfasında "Koleksiyondan kaldır".
  const menu =
    shareable || user || collectionRemoval || extras.length > 0 ? (
      <DropdownMenu label={t("skill.menu")}>
        {(close) => (
          <>
            {shareable && (
              <MenuItem
                icon={<Link2 size={16} />}
                label={t("common.copyLink")}
                onClick={() => {
                  close();
                  void navigator.clipboard?.writeText(absoluteUrl(shareLinkForHref(href))).catch(() => undefined);
                }}
              />
            )}
            {user && (
              <MenuItem
                icon={<Shapes size={16} />}
                label={t("spaces.add.menu")}
                onClick={() => {
                  close();
                  setSpaceOpen(true);
                }}
              />
            )}
            {extras.map((extra) => (
              <MenuItem
                key={extra.key}
                icon={extra.icon}
                label={extra.selected ? `✓ ${extra.label}` : extra.label}
                danger={extra.danger}
                onClick={() => {
                  close();
                  extra.onSelect();
                }}
              />
            ))}
            {collectionRemoval && (
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
          </>
        )}
      </DropdownMenu>
    ) : undefined;
  return (
    <>
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={skill.creator}
        meta={postMeta(skill.creator.username, skill.createdAt, language)}
        time={formatRelativeTime(skill.createdAt, language)}
        editHref={`/skills/create?edit=${skill.id}`}
        typeIcon={GraduationCap}
        status={
          skill.status === "draft" ? <Badge variant="warning">{t("skill.draftBadge")}</Badge> : skill.visibility === "private" ? <Badge variant="neutral">{t("skill.privateBadge")}</Badge> : undefined
        }
        badges={<ContentTypePill icon={GraduationCap} label={t("skill.singular")} detail={category} />}
        art={
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
        title={<ContentCardTitle href={href} title={skill.title || t("skill.untitled")} description={skill.summary} />}
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
    {spaceOpen && <AddToSpaceModal target={{ type: "skill", id: skill.id }} onClose={() => setSpaceOpen(false)} />}
    </>
  );
}
