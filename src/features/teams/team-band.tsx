"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UserPlus } from "@/components/icons/user-plus";
import { LogOut } from "@/components/icons/log-out";
import { MoreVertical } from "@/components/icons/more-vertical";
import { Avatar } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/tabs";
import { HUB_BAND_MENU_BUTTON_CLASS, HubDetailBand } from "@/features/hub/hub-kit";
import { Button } from "@/components/ui/button";
import { MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS, MENU_PANEL_CLASS } from "@/components/ui/menu";
import { Lock } from "@/components/icons/lock";
import { VisibilityTag } from "@/components/ui/visibility-tag";
import { focusMenuItem, menuKeyDown } from "@/components/ui/menu-keys";
import { useOnlineIds } from "@/features/presence/use-presence";
import { useTranslation } from "@/lib/i18n/language-provider";
import { listTeamMembers, type TeamMember, type TeamSummary } from "@/lib/supabase/teams";
import { teamLink, type TeamTab } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { TeamMark } from "./team-ui";

/**
 * Ekip bandı + sekmeler (docs/history/366-*, Yön B · Merkez): uygulama menüsü yerinde kalır; ekip renkli bant ve alt çizgili sekmelerle bir ana sayfa gibi açılır.
 * Bant: ekip imi, "EKİP" etiketi, ad, tek satır özet (üye · proje · yalnızca davetle · çevrimiçi), ilk üyelerin yüzleri, "Davet et" ve ⋯ menüsü.
 * Telefonda aynı bant tek satırdır (geri · im · ad · Davet et · ⋯) ve sekmeler kaydırılır.
 */
export const BAND_TONE: Record<string, string> = {
  primary: "bg-surface",
  sky: "bg-surface",
  plum: "bg-surface",
  // Eski kayıtlar (DB'de duran `secondary` / `success` / `warning`): hepsi düz yüzey (docs/history/458-*).
  secondary: "bg-surface",
  success: "bg-surface",
  warning: "bg-surface",
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
  tabs,
}: {
  team: TeamSummary;
  canInvite: boolean;
  onInvite: () => void;
  onLeave?: () => void;
  menuItems: { key: string; label: string; href: string }[];
  /** Sekmeler (Yön D): bandın içinde, altta. */
  tabs?: React.ReactNode;
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

  const meta = [t("tm.card.members", { count: team.memberCount }), t("tp.header.projects", { count: team.spaceCount })];

  return (
    <HubDetailBand
      data-testid="team-band"
      data-team-band=""
      className={BAND_TONE[team.tone] ?? BAND_TONE.primary}
      backHref="/teams"
      backLabel={t("tm.page.backToTeams")}
      crumbs={[{ label: t("tm.title"), href: "/teams" }, { label: team.name }]}
      tabs={tabs}
      backAttrs={{ "data-team-back-phone": "" }}
      art={
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-surface-soft">
          <TeamMark name={team.name} tone={team.tone} solid size={52} className="rounded-md" />
        </span>
      }
      kicker={
        <>
          <span className="rounded-full bg-surface/80 px-2.5 py-0.5 font-semibold text-text">{t("tc.band.kicker")}</span>
          <VisibilityTag icon={Lock} label={t("tm.header.inviteOnly")} data-team-visibility="" />
        </>
      }
      title={<h1 data-team-name="">{team.name}</h1>}
      byline={
        <p className="min-w-0 truncate text-small text-text-secondary" data-team-meta data-team-header-block>
          {meta.join(" · ")}
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
      actions={
        faces.length > 0 || canInvite ? (
        <>
          {faces.length > 0 && (
            <div className="hidden items-center lg:flex" data-team-avatars>
              {faces.slice(0, 3).map((member, index) => (
                <span key={member.userId} className={cn("rounded-full ring-2 ring-surface", index > 0 && "-ml-1.5")}>
                  <Avatar src={member.avatarUrl} alt={member.displayName || member.username} size={32} />
                </span>
              ))}
              {Math.max(0, team.memberCount - Math.min(3, faces.length)) > 0 && (
                <span className="-ml-1.5 grid h-8 min-w-8 place-items-center rounded-full bg-surface px-1.5 text-caption font-semibold text-text ring-2 ring-surface">+{Math.max(0, team.memberCount - Math.min(3, faces.length))}</span>
              )}
            </div>
          )}
          {canInvite && (
            <Button type="button" onClick={onInvite} data-team-invite-header aria-label={t("tm.invite.title")} className="shrink-0">
              <UserPlus size={20} aria-hidden />
              <span>{t("tm.invite.title")}</span>
            </Button>
          )}
        </>
        ) : undefined
      }
    />
  );
}

/** Alt çizgili sekmeler (ortak `Tabs`, link sekmeleri): Genel bakış · Onaylar · Sohbet · Üyeler · Panel · Yönetim; dar ekranda kaydırılır. */
export function TeamTabs({ teamId, items, active, ariaLabel }: { teamId: string; items: TeamTabItem[]; active: TeamTab; ariaLabel: string }) {
  return (
    <div data-testid="team-tabs">
      <Tabs
        ariaLabel={ariaLabel}
        active={active}
        onChange={() => undefined}
        items={items.map((item) => ({ key: item.key, label: item.label, count: item.count && item.count > 0 ? item.count : undefined, href: teamLink(teamId, item.key), attrs: { "data-team-tab-link": item.key } }))}
      />
    </div>
  );
}
