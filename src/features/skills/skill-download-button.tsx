"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "@/components/icons/chevron-down";
import { Download } from "@/components/icons/download";
import { buttonClassName } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { MENU_PANEL_CLASS } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

/**
 * Skill sayfasının birincil indirme düğmesi (docs/history/401-*): bölünmüş düğme. Sol parça asıl eylemdir (paket varsa ZIP, yoksa SKILL.md);
 * ok parçası diğer biçimleri açar (kopyala, özet JSON, dışa aktarma). İndirme seçenekleri ⋮ menüsünde DEĞİL, burada durur.
 */
export function SkillDownloadButton({ label, onPrimary, children }: { label: string; onPrimary: () => void; children: (close: () => void) => ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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

  return (
    <span ref={ref} data-skill-download-split="" className="relative inline-flex shadow-pop [border-radius:9999px]">
      <button type="button" onClick={onPrimary} data-skill-download="" className={buttonClassName({ size: "lg", className: "h-14 rounded-l-full rounded-r-none pl-7 pr-5" })}>
        <Download size={20} aria-hidden /> {label}
      </button>
      <span data-skill-download-menu="" className="inline-flex">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={t("skill.detail.moreDownloads")}
          aria-haspopup="menu"
          aria-expanded={open}
          className={buttonClassName({ size: "lg", className: "h-14 rounded-l-none rounded-r-full border-l border-primary-foreground/25 px-4" })}
        >
          <ChevronDown size={20} aria-hidden />
        </button>
      </span>
      {open && (
        <div role="menu" className={cn(MENU_PANEL_CLASS, "absolute left-0 top-full z-30 mt-1 min-w-56")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}
