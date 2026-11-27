"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { LayoutDashboard } from "@/components/icons/layout-dashboard";
import { Eye } from "@/components/icons/eye";
import { Lock } from "@/components/icons/lock";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PopoverMenu, type PopoverMenuItem } from "@/components/ui/popover-menu";
import { StorageImg } from "@/components/ui/storage-media";
import { HUB_BAND_MENU_BUTTON_CLASS, HUB_BLEED_CLASS, HUB_BLEED_TOP_CLASS } from "@/features/hub/hub-kit";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KIND_LABEL, type SpaceTab } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import type { SpaceMember } from "@/lib/supabase/spaces";
import { SaveIndicator } from "./save-indicator";
import { useSpaceContext } from "./space-provider";

/**
 * Space başlığı (docs/history/475-*): Genel bakış sekmesinde TAM BANT (etiketler, büyük başlık, serif açıklama, avatar yığını, tek büyük
 * birincil «Panoyu aç», «Davet et», ⋮ ve bandın alt kenarına yayılan ilk palet şeridi); diğer sekmelerde TEK SATIR (geri · başlık · etiketler ·
 * avatarlar · Davet et · ⋮) — Pano'da tuval kalan alanın tamamını alır. Telefonda: tam bant kart olarak, tek satır ise geri + başlık + «tür · N üye» olarak.
 */
export function SpaceHeader({
  variant,
  members,
  backdropUrl,
  menuItems,
  goTo,
  backHref = "/spaces",
}: {
  variant: "full" | "compact";
  members: SpaceMember[] | null;
  /** Tam bandın bulanık zemini: kapak/ilk görsel (bant rengini gönderinin görselinden alır). */
  backdropUrl: string | null;
  menuItems: PopoverMenuItem[];
  goTo: (tab: SpaceTab) => void;
  backHref?: string;
}) {
  const { t } = useTranslation();
  const phone = useMediaQuery("(max-width: 767.98px)");
  const { space, caps, items, palettes, layoutStatus, flushLayout } = useSpaceContext();
  const kindLabel = t(SPACE_KIND_LABEL[space.kind]);
  const leadPalette = palettes.find((palette) => palette.colors.length > 0) ?? null;
  const memberCount = members?.length ?? null;
  const menu = (
    <span data-detail-menu="">
      <PopoverMenu items={menuItems} triggerClassName={HUB_BAND_MENU_BUTTON_CLASS} />
    </span>
  );
  const invite = caps.manageMembers ? (
    <Button variant="outline" className="max-md:flex-1 xl:h-12 xl:px-6" onClick={() => goTo("members")} data-space-invite="">
      {t("spaces.members.invite")}
    </Button>
  ) : null;

  if (variant === "compact") {
    if (phone) {
      return (
        <div className="-mx-3 md:hidden" data-space-phone-bar="" data-testid="space-phone-bar">
          <div className="flex h-14 items-center gap-1 border-b border-border-soft bg-surface px-2">
            <Link href={backHref} aria-label={t("common.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-sm text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" data-phone-back="">
              <ArrowLeft size={20} aria-hidden />
            </Link>
            <div className="min-w-0 flex-1 leading-tight">
              <h1 className="truncate text-small font-bold text-text">{space.title}</h1>
              <span className="block truncate text-caption text-text-secondary">
                {memberCount !== null ? t("spaces.header.kindMembers", { kind: kindLabel, count: memberCount }) : kindLabel}
              </span>
            </div>
            {menu}
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 border-b border-border-soft pb-3" data-space-band="" data-space-compact="">
        <Link href={backHref} aria-label={t("hub.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-sm text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" data-hub-back="">
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="min-w-0 truncate text-h3 font-semibold text-text">{space.title}</h1>
          <SpaceTags kindLabel={kindLabel} archived={Boolean(space.archivedAt)} />
        </div>
        <MemberStack members={members} />
        {invite}
        {menu}
      </div>
    );
  }

  // ---- tam bant (Genel bakış) ----
  const tags = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {phone && (
        <Link href={backHref} aria-label={t("hub.back")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-surface/70 text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" data-hub-back="">
          <ArrowLeft size={16} aria-hidden />
        </Link>
      )}
      <SpaceTags kindLabel={kindLabel} archived={Boolean(space.archivedAt)} />
      <span className={cn(TAG_CLASS, "max-md:hidden")}>{t("spaces.header.itemsTag", { count: items.length })}</span>
    </div>
  );
  return (
    <header className={cn("relative isolate overflow-hidden border-border-soft bg-primary-soft max-md:rounded-none md:rounded-xl md:border", HUB_BLEED_CLASS, HUB_BLEED_TOP_CLASS)} data-space-band="" data-hub-detail-band="">
      {backdropUrl && (
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 scale-150 opacity-70 blur-3xl saturate-150">
            <StorageImg src={backdropUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-background/55" />
        </div>
      )}
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-6 md:p-6 xl:px-9 xl:py-7">
        <div className="min-w-0 flex-1 space-y-2">
          {tags}
          <h1 className="break-words font-display text-h2 font-extrabold text-text md:text-h1">{space.title}</h1>
          {space.description && <p className="line-clamp-3 max-w-2xl whitespace-pre-line break-words font-serif text-small text-text-secondary md:text-body">{space.description}</p>}
        </div>
        {!phone && <MemberStack members={members} size={40} />}
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-nowrap" data-space-actions="">
          <Button className="max-md:flex-1 xl:h-12 xl:px-6" onClick={() => goTo("board")}>
            {caps.edit ? <LayoutDashboard size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
            {caps.edit ? t("spaces.page.openBoard") : t("spaces.page.viewBoard")}
          </Button>
          {invite}
          <SaveIndicator status={layoutStatus} onRetry={() => void flushLayout()} className="md:ml-0" />
          {!phone && menu}
        </div>
        {phone && <div className="absolute right-3 top-3">{menu}</div>}
      </div>
      {leadPalette && <BandPalette colors={leadPalette.colors} name={leadPalette.name} />}
    </header>
  );
}

const TAG_CLASS = "inline-flex items-center gap-1 whitespace-nowrap rounded-xs bg-surface/80 px-2 py-0.5 text-caption font-semibold text-text-secondary";

function SpaceTags({ kindLabel, archived }: { kindLabel: string; archived: boolean }): ReactNode {
  const { t } = useTranslation();
  return (
    <>
      <span className={TAG_CLASS}>{kindLabel}</span>
      <span className={TAG_CLASS}>
        <Lock size={12} aria-hidden />
        {t("spaces.visibility.private")}
      </span>
      {archived && <span className="inline-flex items-center rounded-xs bg-warning-soft px-2 py-0.5 text-caption font-semibold text-warning">{t("spaces.page.archivedBadge")}</span>}
    </>
  );
}

/** Üyelerin avatar yığını (en çok 4); üye yüklenmediyse hiç çizilmez. */
function MemberStack({ members, size = 32 }: { members: SpaceMember[] | null; size?: number }) {
  if (!members || members.length === 0) return null;
  const shown = members.slice(0, 4);
  return (
    <span className="flex shrink-0 items-center" data-space-members-stack="">
      {shown.map((member, index) => (
        <span key={member.userId} className={cn("rounded-full ring-2 ring-background", index > 0 && "-ml-2")}>
          <Avatar src={member.profile?.avatarUrl} alt={member.profile?.displayName ?? ""} size={size} className="rounded-full" />
        </span>
      ))}
    </span>
  );
}

/**
 * Bandın alt kenarına yayılan ilk palet şeridi (mockup: 10 px, eşit dilimler). Her dilim bir HEX kopyalama düğmesidir; görsel yükseklik ince,
 * dokunma alanı `tap-area` ile büyür. Renkler kullanıcı içeriğidir (#rrggbb): satır içi stil.
 */
function BandPalette({ colors, name }: { colors: string[]; name: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-2.5 w-full" data-space-band-palette="" role="group" aria-label={name || t("spaces.tab.palette")}>
      {colors.slice(0, 8).map((color, index) => (
        <button
          key={`${color}-${index}`}
          type="button"
          data-small-target=""
          title={color}
          aria-label={t("spaces.palette.copyColor", { hex: color })}
          onClick={() => void navigator.clipboard?.writeText(color).catch(() => undefined)}
          className="tap-area h-full min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
