"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { Info } from "@/components/icons/info";
import { MoreVertical } from "@/components/icons/more-vertical";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

export interface PathCrumb {
  label: string;
  /** Son (şu anki) çipte yok. */
  href?: string;
}

/**
 * Ekip sayfalarının TEK üst çubuğu (docs/history/363-*, 365-*): düz (köşesiz, tam genişlik) çubuk — solda geri oku, ortada iki satır
 * (üstte küçük üst konum, altında kalın şu anki sayfa), sağda sayfanın eylemi. Ekibin tüm sayfaları (Projeler, Sohbet, Üyeler, Panel,
 * Yönetim ve proje/dosya/pano/öğe/onay sayfaları) AYNI çubuğu kullanır; telefondaki `PhoneSubBar` ile aynı görünümdür.
 * Yol bilgisi kaybolmaz: üst satır son iki üst konumu "Proje › Dosya" diye yazar ve ilki dokununca o konuma gider.
 * Öğe detayında bilgi (ⓘ) yerine işlemler (⋯) çıkar: `onMore` verilirse o gösterilir.
 */
export function ProjectPathBar({ crumbs, backHref, onInfo, onMore, right }: { crumbs: PathCrumb[]; backHref: string; onInfo?: () => void; onMore?: () => void; right?: ReactNode }) {
  const { t } = useTranslation();
  const current = crumbs[crumbs.length - 1];
  const parents = crumbs.slice(0, -1).slice(-2);
  return (
    <div className="-mx-3 sm:-mx-5 md:mx-0" data-project-crumbs>
      <div className="flex h-14 items-center gap-1 border-b border-border-soft bg-surface px-2">
        <Link href={backHref} aria-label={t("tp.page.up")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-path-back>
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <nav aria-label={t("tp.page.crumbs")} className="min-w-0 flex-1 leading-tight">
          {parents.length > 0 && (
            <span className="flex min-w-0 items-center gap-1 truncate text-caption text-text-muted">
              {parents.map((crumb, index) => (
                <span key={`${index}-${crumb.label}`} className="inline-flex min-w-0 items-center gap-1">
                  {index > 0 && <span aria-hidden>›</span>}
                  {crumb.href ? (
                    <Link href={crumb.href} className="truncate hover:text-text hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate">{crumb.label}</span>
                  )}
                </span>
              ))}
            </span>
          )}
          <div aria-current="page" className="truncate font-display text-h3 font-bold text-text" data-path-title>
            {current?.label}
          </div>
        </nav>
        {right}
        {onMore ? (
          <button type="button" onClick={onMore} aria-label={t("tp.item.moreAria")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-surface-soft" data-path-more>
            <MoreVertical size={22} aria-hidden />
          </button>
        ) : (
          onInfo && (
            <button type="button" onClick={onInfo} aria-label={t("tp.info.open")} className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-primary hover:bg-primary-soft")} data-path-info>
              <Info size={21} aria-hidden />
            </button>
          )
        )}
      </div>
    </div>
  );
}
