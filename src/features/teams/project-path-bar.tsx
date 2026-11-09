"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import { Info } from "@/components/icons/info";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslation } from "@/lib/i18n/language-provider";

export interface PathCrumb {
  label: string;
  /** Son (şu anki) çipte yok. */
  href?: string;
}

/**
 * Proje sayfalarının TEK üst çubuğu (docs/history/363-*, mockup 1 "Gezgin"): geri oku + yol çipleri (Ekip › Proje › Dosya) + bilgi.
 * Eskiden iki ayrı bileşen (telefonda alt sayfa çubuğu + yol kırıntısı) aynı bilgiyi iki kez veriyordu ve dar ekranda tuvalin yerini çalıyordu.
 * Çipler hem "neredeyim" hem "oraya dön"dür; şu anki çip dokunulamaz ve kaydırmada hep görünür kalır.
 */
export function ProjectPathBar({ crumbs, backHref, onInfo }: { crumbs: PathCrumb[]; backHref: string; onInfo?: () => void }) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLElement>(null);
  const signature = crumbs.map((crumb) => crumb.label).join("/");
  useEffect(() => {
    const row = rowRef.current;
    if (row) row.scrollLeft = row.scrollWidth;
  }, [signature]);
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border-soft bg-surface px-1.5 py-1" data-project-crumbs>
      <Link href={backHref} aria-label={t("tp.page.up")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text hover:bg-surface-soft" data-path-back>
        <ArrowLeft size={20} aria-hidden />
      </Link>
      <nav aria-label={t("tp.page.crumbs")} className="min-w-0 flex-1">
        <ScrollRow ref={rowRef} className="items-center gap-0.5 whitespace-nowrap">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <span key={`${index}-${crumb.label}`} className="inline-flex shrink-0 items-center gap-0.5">
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="inline-flex h-9 items-center rounded-full px-2.5 text-small font-medium text-text-secondary hover:bg-surface-soft hover:text-text">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className="inline-flex h-9 items-center rounded-full bg-surface-soft px-2.5 text-small font-bold text-text">
                    {crumb.label}
                  </span>
                )}
                {!last && <ChevronRight size={14} aria-hidden className="text-text-muted" />}
              </span>
            );
          })}
        </ScrollRow>
      </nav>
      {onInfo && (
        <button type="button" onClick={onInfo} aria-label={t("tp.info.open")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary hover:bg-primary-soft" data-path-info>
          <Info size={21} aria-hidden />
        </button>
      )}
    </div>
  );
}
