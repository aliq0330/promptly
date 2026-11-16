"use client";

import type { ReactNode } from "react";
import { List } from "@/components/icons/list";
import { X } from "@/components/icons/x";
import { IconButton } from "@/components/ui/icon-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Dosya gezgini çerçevesi (editör ve detay sayfası ortak, docs/history/407-*): `md`+'ta solda ağaç, ortada dosya, `lg`+'ta sağda isteğe bağlı önizleme.
 * Telefonda ağaç ayrı bir kart DEĞİL, aynı kartın ikinci hâlidir: ☰ ağacı açar (dosya görünümünün yerini alır), dosya seçilince ya da ✕ ile
 * dosya görünümü geri gelir. Hangi hâlde olduğunu üst bileşen tutar (`treeOpen`); masaüstünde ağaç hep görünür.
 */
export function SkillFileFrame({
  tree,
  treeTitle,
  treeActions,
  treeFooter,
  path,
  viewerActions,
  viewer,
  preview,
  treeOpen,
  onTreeOpenChange,
  className,
}: {
  tree: ReactNode;
  treeTitle: string;
  treeActions?: ReactNode;
  treeFooter?: ReactNode;
  path: string;
  viewerActions?: ReactNode;
  viewer: ReactNode;
  preview?: ReactNode;
  treeOpen: boolean;
  onTreeOpenChange: (open: boolean) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex h-[34rem] overflow-hidden rounded-lg card-flat md:h-[36rem]", className)} data-skill-file-frame="" data-tree-open={treeOpen ? "true" : "false"}>
      <div className={cn("flex min-h-0 flex-col md:w-60 md:shrink-0 md:border-r md:border-border-soft", treeOpen ? "max-md:flex-1" : "max-md:hidden")}>
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border-soft pl-3 pr-1.5">
          <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{treeTitle}</span>
          {treeActions}
          <IconButton label={t("skill.pkg.closeTree")} className="h-9 w-9 md:hidden" onClick={() => onTreeOpenChange(false)} data-skill-tree-close="">
            <X size={20} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{tree}</div>
        {treeFooter && <div className="shrink-0 border-t border-border-soft px-3 py-2">{treeFooter}</div>}
      </div>

      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", treeOpen && "max-md:hidden")}>
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border-soft pl-1.5 pr-1.5 md:pl-4">
          <IconButton label={t("skill.pkg.openTree")} className="h-9 w-9 md:hidden" onClick={() => onTreeOpenChange(true)} data-skill-tree-open="">
            <List size={20} />
          </IconButton>
          <span className="min-w-0 flex-1 truncate font-mono text-caption font-medium text-text" data-skill-frame-path="">
            {path}
          </span>
          {viewerActions}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{viewer}</div>
      </div>

      {preview && <div className="hidden min-h-0 min-w-0 flex-1 flex-col border-l border-border-soft bg-background lg:flex">{preview}</div>}
    </div>
  );
}
