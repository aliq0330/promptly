"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2 } from "@/components/icons/link-2";
import { MoreVertical } from "@/components/icons/more-vertical";
import { Network } from "@/components/icons/network";
import { Pencil } from "@/components/icons/pencil";
import { Shapes } from "@/components/icons/shapes";
import { Trash2 } from "@/components/icons/trash-2";
import { MENU_ITEM_CLASS } from "@/components/ui/menu";
import { ReportButton } from "@/features/moderation/report-button";
import { AddToSpaceModal } from "@/features/spaces/add-to-space-modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { shareLinkForHref } from "@/lib/share-link";
import { absoluteUrl, cn, relationMapHref, skillHref } from "@/lib/utils";
import type { Skill } from "@/types";

/**
 * Skill sayfasının bant köşesindeki ⋮ menüsü (docs/history/401-*): normal prompt sayfasındaki `PostMenu` ile AYNI satırlar ve görünüm —
 * bağlantıyı kopyala, İlişki haritasını aç, sahibe Düzenle / Sil, başkasına Şikâyet et. İndirme seçenekleri burada DEĞİL, ayrı "İndir ▾" düğmesindedir.
 * "Space'e ekle" oturumlu kullanıcıya (docs/history/404-*): Skill kopyalanmaz, Space'e başvurulur.
 */
export function SkillMenu({ skill, isOwn, signedIn, onDelete }: { skill: Skill; isOwn: boolean; signedIn: boolean; onDelete: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mapped = skill.status === "published" && skill.visibility === "public";

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copyLink(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(absoluteUrl(shareLinkForHref(skillHref(skill))));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Pano kullanılamıyor — yapılacak başka bir şey yok.
    }
  }

  return (
    <span data-skill-menu="" ref={ref} className="relative z-20 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("skill.menu")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors duration-200 hover:bg-surface-soft hover:text-text"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div role="menu" className={cn("absolute right-0 top-8 z-30 w-52 overflow-hidden rounded-lg border border-border-soft bg-surface-elevated py-1 shadow-pop animate-pop-in")}>
          {mapped && (
            <button type="button" role="menuitem" data-skill-copy-link="" onClick={copyLink} className={MENU_ITEM_CLASS}>
              <Link2 size={14} />
              {copied ? t("common.copied") : t("common.copyLink")}
            </button>
          )}
          {mapped && (
            <button
              type="button"
              role="menuitem"
              data-skill-relation-map=""
              onClick={() => {
                setOpen(false);
                router.push(relationMapHref({ kind: "skill", id: skill.id }));
              }}
              className={MENU_ITEM_CLASS}
            >
              <Network size={14} />
              {t("relations.open")}
            </button>
          )}
          {signedIn && (
            <button
              type="button"
              role="menuitem"
              data-add-to-space=""
              onClick={() => {
                setOpen(false);
                setSpaceOpen(true);
              }}
              className={MENU_ITEM_CLASS}
            >
              <Shapes size={14} />
              {t("spaces.add.menu")}
            </button>
          )}
          {isOwn && (
            <>
              <Link href={`/skills/create?edit=${skill.id}`} role="menuitem" data-skill-edit="" className={MENU_ITEM_CLASS}>
                <Pencil size={14} />
                {t("common.edit")}
              </Link>
              <button
                type="button"
                role="menuitem"
                data-skill-delete=""
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-small text-danger hover:bg-danger-soft"
              >
                <Trash2 size={14} />
                {t("common.delete")}
              </button>
            </>
          )}
          {!isOwn && signedIn && (
            <div className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
              <ReportButton targetType="skill" targetId={skill.id} title={skill.title} subtitle={`@${skill.creator.username}`} />
            </div>
          )}
        </div>
      )}
      {spaceOpen && <AddToSpaceModal target={{ type: "skill", id: skill.id }} onClose={() => setSpaceOpen(false)} />}
    </span>
  );
}
