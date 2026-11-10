"use client";

import Link from "next/link";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { Info } from "@/components/icons/info";
import { MessageCircle } from "@/components/icons/message-circle";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { BAND_TONE } from "./team-band";
import { TeamMark } from "./team-ui";

/**
 * Proje / dosya / pano sayfalarının başlık parçaları (docs/history/366-*, mockup B2/B3): masaüstü ve tablette bantın altında "Genel bakış › Projeler › Ad" yolu,
 * telefonda bant yerine renkli üst başlık (geri · yol · sohbet · bilgi; proje sayfasında projenin imi + adı + rolüm).
 */
export interface DrillCrumb {
  label: string;
  href?: string;
}

/** Masaüstü/tablet yol satırı. Son parça şu anki sayfadır (kalın). */
export function Breadcrumbs({ crumbs }: { crumbs: DrillCrumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("tp.page.crumbs")} className="flex flex-wrap items-center gap-x-1.5 text-small text-text-muted max-md:hidden" data-project-crumbs data-breadcrumbs>
      {crumbs.map((crumb, index) => (
        <span key={`${index}-${crumb.label}`} className="inline-flex items-center gap-1.5">
          {index > 0 && <span aria-hidden>›</span>}
          {crumb.href && index < crumbs.length - 1 ? (
            <Link href={crumb.href} className="hover:text-text hover:underline">
              {crumb.label}
            </Link>
          ) : (
            <b aria-current={index === crumbs.length - 1 ? "page" : undefined} className="font-semibold text-text">
              {crumb.label}
            </b>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Telefon üst başlığı: renkli zemin, geri · üst konum · (sohbet) · bilgi; `mark` doluysa altında proje imi + ad + alt satır. */
export function DrillHeader({
  backHref,
  parent,
  title,
  sub,
  tone,
  markName,
  chatHref,
  onInfo,
}: {
  backHref: string;
  parent: string;
  title: string;
  sub?: React.ReactNode;
  tone?: string | null;
  markName?: string;
  chatHref?: string | null;
  onInfo?: () => void;
}) {
  const { t } = useTranslation();
  const iconButton = "grid h-11 w-11 shrink-0 place-items-center rounded-full text-text hover:bg-surface/60";
  return (
    <header className={cn("-mx-3 px-2 pb-3 pt-1.5 sm:-mx-5 md:hidden", BAND_TONE[tone ?? "primary"] ?? BAND_TONE.primary)} data-drill-header>
      <div className="flex items-center">
        <Link href={backHref} aria-label={t("tp.page.up")} className={iconButton} data-drill-back>
          <ArrowLeft size={22} aria-hidden />
        </Link>
        <span className="min-w-0 flex-1 truncate px-1 text-caption text-text-secondary">{markName ? parent : null}</span>
        {chatHref && (
          <Link href={chatHref} aria-label={t("tp.page.openChat")} className={iconButton} data-drill-chat>
            <MessageCircle size={22} aria-hidden />
          </Link>
        )}
        {onInfo && (
          <button type="button" onClick={onInfo} aria-label={t("tp.info.open")} className={iconButton} data-drill-info>
            <Info size={22} aria-hidden />
          </button>
        )}
      </div>
      {markName ? (
        <div className="flex items-center gap-3 px-2">
          <TeamMark name={markName} tone={tone} solid size={52} className="rounded-[15px]" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.375rem] font-extrabold leading-tight text-text" data-drill-title>
              {title}
            </h1>
            {sub && <div className="text-caption font-bold text-primary">{sub}</div>}
          </div>
        </div>
      ) : (
        <div className="px-3">
          <p className="truncate text-caption text-text-secondary">{parent}</p>
          <h1 className="truncate font-display text-h3 font-extrabold leading-tight text-text" data-drill-title>
            {title}
          </h1>
        </div>
      )}
    </header>
  );
}
