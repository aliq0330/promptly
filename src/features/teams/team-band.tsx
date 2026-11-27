"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UserPlus } from "@/components/icons/user-plus";
import { LogOut } from "@/components/icons/log-out";
import { MoreVertical } from "@/components/icons/more-vertical";
import { Avatar } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/tabs";
import { HUB_BAND_MENU_BUTTON_CLASS, HUB_PHONE_TABS_CLASS, HubDetailBand } from "@/features/hub/hub-kit";
import { buttonClassName } from "@/components/ui/button";
import { MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS, MENU_PANEL_CLASS } from "@/components/ui/menu";
import { Lock } from "@/components/icons/lock";
import { VisibilityTag } from "@/components/ui/visibility-tag";
import { focusMenuItem, menuKeyDown } from "@/components/ui/menu-keys";
import { useOnlineIds } from "@/features/presence/use-presence";
import { useTranslation } from "@/lib/i18n/language-provider";
import { listTeamMembers, type TeamMember, type TeamSummary } from "@/lib/supabase/teams";
import { teamLink, type TeamTab } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { TeamMark, roleLabelKey } from "./team-ui";

/**
 * Ekip bandı + sekmeler (docs/history/366-*, Yön B · Merkez; bant düzeni mockup'a göre docs/history/476-*): kare ekip imi, ad, tek satır alt bilgi (üye · açıklama · rol | proje),
 * tek birincil düğme «Ekip sohbetini aç» ve ⋮ menüsü (Davet et, bilgi, bildirimler, ayrıl). `md+`'da başlığın üstünde etiketler (Ekip · yalnızca davetle · rol)
 * ve altında üye yüzleri durur. Telefonda bant kenardan kenara akar: im + ad üstte, tam genişlik düğme + ⋮ altta; sekmeler hemen altında kaydırılır.
 */
export const BAND_TONE: Record<string, string> = {
  primary: "bg-primary-soft",
  sky: "bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface-soft))]",
  plum: "bg-surface-soft",
  // Eski kayıtlar (DB'de duran `secondary` / `success` / `warning`): sakin görünüme eşlenir (`resolveTeamTone`, team-ui.tsx).
  secondary: "bg-primary-soft",
  success: "bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface-soft))]",
  warning: "bg-surface-soft",
};

export interface TeamTabItem {
  key: TeamTab;
  label: string;
  /** Sekmenin yanındaki sayaç (onay bekleyen, okunmamış). */
  count?: number;
}

export function TeamBand({
  team,
  canInvite,
  onInvite,
  onLeave,
  menuItems,
}: {
  team: TeamSummary;
  canInvite: boolean;
  onInvite: () => void;
  onLeave?: () => void;
  menuItems: { key: string; label: string; href: string }[];
}) {
  const { t } = useTranslation();
  const [faces, setFaces] = useState<TeamMember[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    void listTeamMembers(team.id, "", null, 0).then(
      (page) => alive && setFaces(page.items),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [team.id]);
  const online = useOnlineIds(faces.map((member) => member.userId));
  const onlineCount = faces.filter((member) => online.has(member.userId)).length;

  useEffect(() => {
    if (!menuOpen) return;
    focusMenuItem(listRef.current);
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          setMenuOpen(false);
          triggerRef.current?.focus({ preventScroll: true });
        }
        return;
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const role = t(roleLabelKey(team.myRole));
  const description = team.description?.trim() ?? "";
  const extraFaces = Math.max(0, team.memberCount - Math.min(5, faces.length));

  return (
    <HubDetailBand
      data-testid="team-band"
      data-team-band=""
      className={BAND_TONE[team.tone] ?? BAND_TONE.primary}
      art={<TeamMark name={team.name} tone={team.tone} solid fill className="text-h3 md:text-h2 xl:text-h1" />}
      kicker={
        <>
          <span className="rounded-xs bg-surface/80 px-2 py-0.5 font-semibold text-text-secondary">{t("tc.band.kicker")}</span>
          <VisibilityTag icon={Lock} label={t("tm.header.inviteOnly")} data-team-visibility="" />
          <span className="rounded-xs bg-surface/80 px-2 py-0.5 font-semibold text-primary-text" data-team-role="">{role}</span>
        </>
      }
      title={<h1 data-team-name="">{team.name}</h1>}
      byline={
        <p className="min-w-0 truncate" data-team-meta data-team-header-block>
          {[t("tm.card.members", { count: team.memberCount }), description].filter(Boolean).join(" · ")}
          <span className="lg:hidden"> · {role}</span>
          <span className="hidden lg:inline"> · {t("tp.header.projects", { count: team.spaceCount })}</span>
          {onlineCount > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-success" data-team-online-count>
                {t("tm.chat.onlineCount", { count: onlineCount })}
              </span>
            </>
          )}
        </p>
      }
      faces={
        faces.length > 0 ? (
          <div className="flex items-center" data-team-avatars>
            {faces.slice(0, 5).map((member, index) => (
              <span key={member.userId} className={cn("rounded-full ring-2 ring-primary-soft", index > 0 && "-ml-2", index === 4 && "max-xl:hidden")}>
                <Avatar src={member.avatarUrl} alt={member.displayName || member.username} size={32} />
              </span>
            ))}
            {extraFaces > 0 && <span className="ml-1.5 whitespace-nowrap text-caption text-text-secondary">+{extraFaces}</span>}
          </div>
        ) : undefined
      }
      actions={
        <Link href={teamLink(team.id, "chat")} data-team-open-chat className={buttonClassName({ className: "max-md:flex-1 max-md:justify-center xl:h-12 xl:px-6" })}>
          {t("tm.header.openChat")}
        </Link>
      }
      menu={
        <div className="relative shrink-0" ref={menuRef}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={t("tc.band.menu")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-team-menu
            className={HUB_BAND_MENU_BUTTON_CLASS}
          >
            <MoreVertical size={20} aria-hidden />
          </button>
          {menuOpen && (
            <ul ref={listRef} role="menu" onKeyDown={(event) => menuKeyDown(event, listRef.current)} className={cn(MENU_PANEL_CLASS, "absolute right-0 top-full z-30 mt-1.5 w-56")} data-team-menu-list>
              {canInvite && (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onInvite();
                    }}
                    data-team-invite-header
                    className={MENU_ITEM_CLASS}
                  >
                    <UserPlus size={16} aria-hidden />
                    {t("tm.invite.title")}
                  </button>
                </li>
              )}
              {menuItems.map((item) => (
                <li key={item.key} role="none">
                  <Link href={item.href} role="menuitem" onClick={() => setMenuOpen(false)} className={MENU_ITEM_CLASS}>
                    {item.label}
                  </Link>
                </li>
              ))}
              {onLeave && (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onLeave();
                    }}
                    data-team-menu-leave
                    className={cn(MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS)}
                  >
                    <LogOut size={16} aria-hidden />
                    {t("tm.members.leave")}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      }
    />
  );
}

/** Alt çizgili sekmeler (ortak `Tabs`, link sekmeleri): Genel bakış · Onaylar · Sohbet · Üyeler · Panel · Yönetim; dar ekranda kaydırılır. */
export function TeamTabs({ teamId, items, active, ariaLabel }: { teamId: string; items: TeamTabItem[]; active: TeamTab; ariaLabel: string }) {
  return (
    <div data-testid="team-tabs">
      <Tabs
        className={HUB_PHONE_TABS_CLASS}
        ariaLabel={ariaLabel}
        active={active}
        onChange={() => undefined}
        items={items.map((item) => ({ key: item.key, label: item.label, count: item.count && item.count > 0 ? item.count : undefined, href: teamLink(teamId, item.key), attrs: { "data-team-tab-link": item.key } }))}
      />
    </div>
  );
}
