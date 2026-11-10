"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { LogOut } from "@/components/icons/log-out";
import { MoreVertical } from "@/components/icons/more-vertical";
import { Avatar } from "@/components/ui/avatar";
import { ScrollRow } from "@/components/ui/scroll-row";
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
  primary: "bg-primary-soft",
  secondary: "bg-secondary/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  plum: "bg-surface-soft",
  sky: "bg-primary-soft",
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
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setMenuOpen(false);
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

  const shown = faces.slice(0, 3);
  const more = Math.max(0, team.memberCount - shown.length);
  const meta = [t("tm.card.members", { count: team.memberCount }), t("tp.header.projects", { count: team.spaceCount }), t("tm.header.inviteOnly")];

  return (
    <div className={cn("rounded-none px-3 py-3 sm:px-5 md:rounded-2xl md:px-8 md:py-5", BAND_TONE[team.tone] ?? BAND_TONE.primary)} data-team-band data-testid="team-band">
      <div className="flex items-center gap-2.5 md:gap-4">
        <Link href="/teams" aria-label={t("tm.page.backToTeams")} className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-text hover:bg-surface/60 md:hidden" data-team-back-phone>
          <ArrowLeft size={22} aria-hidden />
        </Link>
        <TeamMark name={team.name} tone={team.tone} solid size={52} className="rounded-[15px] md:hidden" />
        <TeamMark name={team.name} tone={team.tone} solid size={76} className="hidden rounded-[22px] md:inline-grid" />
        <div className="min-w-0 flex-1" data-team-header-block>
          <p className="hidden text-caption font-bold uppercase tracking-[0.08em] text-primary md:block">{t("tc.band.kicker")}</p>
          <h1 className="truncate font-display text-[1.3rem] font-extrabold leading-tight text-text md:text-[2rem]" data-team-name>
            {team.name}
          </h1>
          <p className="truncate text-caption text-text-secondary md:text-small" data-team-meta>
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
        </div>
        {shown.length > 0 && (
          <div className="hidden items-center lg:flex" data-team-avatars>
            {shown.map((member, index) => (
              <span key={member.userId} className={cn("rounded-full ring-2 ring-surface", index > 0 && "-ml-2.5")}>
                <Avatar src={member.avatarUrl} alt={member.displayName || member.username} size={32} />
              </span>
            ))}
            {more > 0 && <span className="-ml-2.5 grid h-8 min-w-8 place-items-center rounded-full bg-surface px-1.5 text-caption font-bold text-text ring-2 ring-surface">+{more}</span>}
          </div>
        )}
        {canInvite && (
          <button
            type="button"
            onClick={onInvite}
            data-team-invite-header
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary px-4 text-small font-semibold text-primary-foreground hover:bg-primary-hover md:h-10 md:px-5"
          >
            {t("tm.invite.title")}
          </button>
        )}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={t("tc.band.menu")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-team-menu
            className="grid h-11 w-11 place-items-center rounded-full text-text hover:bg-surface/60 md:h-10 md:w-10 md:border md:border-border md:bg-surface"
          >
            <MoreVertical size={20} aria-hidden />
          </button>
          {menuOpen && (
            <ul role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-border-soft bg-surface p-1.5 shadow-pop" data-team-menu-list>
              {menuItems.map((item) => (
                <li key={item.key} role="none">
                  <Link href={item.href} role="menuitem" onClick={() => setMenuOpen(false)} className="flex min-h-11 items-center rounded-lg px-3 text-small font-medium text-text hover:bg-surface-soft">
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
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-small font-medium text-danger hover:bg-danger/10"
                  >
                    <LogOut size={16} aria-hidden />
                    {t("tm.members.leave")}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Alt çizgili sekmeler: masaüstünde bantla aynı kolon, telefonda kaydırılır. Sayaçlar turuncudur ("senin olan"). */
export function TeamTabs({ teamId, items, active, ariaLabel }: { teamId: string; items: TeamTabItem[]; active: TeamTab; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="border-b border-border-soft bg-surface md:rounded-b-none md:bg-transparent" data-testid="team-tabs">
      <ScrollRow className="gap-1 px-1 md:px-3">
        {items.map((item) => (
          <Link
            key={item.key}
            href={teamLink(teamId, item.key)}
            replace
            aria-current={active === item.key ? "page" : undefined}
            data-team-tab-link={item.key}
            className={cn(
              "-mb-px inline-flex h-12 shrink-0 items-center gap-1.5 border-b-2 px-3 text-body transition-colors md:px-4",
              active === item.key ? "border-primary font-bold text-primary" : "border-transparent font-medium text-text-secondary hover:text-text",
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && <span className="text-small font-bold tabular-nums text-secondary">{item.count}</span>}
          </Link>
        ))}
      </ScrollRow>
    </nav>
  );
}
