"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Briefcase } from "@/components/icons/briefcase";
import Link from "next/link";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Button, buttonClassName } from "@/components/ui/button";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { MessageCircle } from "@/components/icons/message-circle";
import { SectionMenu } from "@/features/content/section-menu";
import { InviteDialog } from "./team-invites";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchMyTeam, fetchTeamPolicy, type TeamPolicy, type TeamSummary } from "@/lib/supabase/teams";
import { DEFAULT_TEAM_ROLE_POLICY, isTeamTab, teamLink, teamRoleCan, type TeamCapability, type TeamRolePolicy, type TeamTab } from "@/lib/teams";
import { TeamAdminSection } from "./team-admin-section";
import { TeamChatSection } from "./team-chat-section";
import { TeamLibrarySection } from "./team-library-section";
import { TeamMembersSection } from "./team-members-section";
import { TeamPanelSection } from "./team-panel-section";
import { TeamSpacesSection } from "./team-spaces-section";
import { TeamMark } from "./team-ui";

export interface TeamCtx {
  team: TeamSummary;
  /** `can` yalnız GÖSTERİM içindir (butonları gizler); gerçek karar her RPC'de sunucudadır. */
  can: (cap: TeamCapability) => boolean;
  policy: TeamPolicy | null;
  reload: () => void;
  /** Telefonda sekme satırının yerini alan "Bölüm ▾" menüsü (mockup P2–P16); bölümler kendi kontrol satırının başına koyar. */
  sectionMenu: React.ReactNode;
}

/** Kontrol satırında "Bölüm ▾" menüsünü kendisi çizen bölümler; diğerlerinde menü sayfanın üstünde tek başına durur. */
const OWN_MENU_TABS: readonly TeamTab[] = ["spaces", "library", "members"];

/**
 * Ekip sayfası (`/teams/local?id=&tab=`). Bölümler tek "Space'ler ▾" menüsüdür (4+ bölüm = menü kuralı); konuklar yalnız Space'ler ve Sohbet'i görür.
 * Ekibe üye olmayan kimlik (ya da var olmayan ekip) "bulunamadı" görür: varlığı sızmaz.
 */
export function TeamPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const id = params.get("id") ?? "";
  const rawTab = params.get("tab");
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [policy, setPolicy] = useState<TeamPolicy | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = await fetchMyTeam(id);
        if (cancelled) return;
        if (!found) {
          setState("missing");
          return;
        }
        setTeam(found);
        setState("ready");
        // Politika yalnız yönetim ekranlarında gerekir; okunamazsa (üye) varsayılan eşiklerle gösterilir.
        setPolicy(await fetchTeamPolicy(found.id).catch(() => null));
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  const rolePolicy: TeamRolePolicy = useMemo(
    () =>
      policy
        ? { publish_external_role: policy.publishExternalRole, guest_invite_role: policy.guestInviteRole, export_role: policy.exportRole }
        : DEFAULT_TEAM_ROLE_POLICY,
    [policy],
  );
  const can = useCallback((cap: TeamCapability) => teamRoleCan(team?.myRole, cap, rolePolicy), [team?.myRole, rolePolicy]);

  const isGuest = team?.myRole === "guest";
  const adminVisible = Boolean(team) && !isGuest && (can("manage_team") || can("manage_members") || can("manage_groups") || can("view_audit"));
  const items: { key: TeamTab; label: string; count?: number }[] = useMemo(() => {
    const list: { key: TeamTab; label: string; count?: number }[] = [{ key: "spaces", label: t("tm.tab.spaces") }];
    if (!isGuest) list.push({ key: "library", label: t("tm.tab.library") });
    list.push({ key: "chat", label: t("tm.tab.chat"), count: team?.unreadCount || undefined });
    if (!isGuest) list.push({ key: "members", label: t("tm.tab.members") });
    if (!isGuest && can("view_audit")) list.push({ key: "panel", label: t("tm.tab.panel") });
    if (adminVisible) list.push({ key: "admin", label: t("tm.tab.admin") });
    return list;
  }, [t, isGuest, can, adminVisible, team?.unreadCount]);

  const tab: TeamTab = isTeamTab(rawTab) && items.some((item) => item.key === rawTab) ? rawTab : "spaces";
  // Telefonda açık bir kanal tam ekran sohbettir (mockup): ekip başlığı, sekmeler ve notlar gizlenir, geri düğmesi sohbet başlığındadır.
  const chatFocus = tab === "chat" && Boolean(params.get("channel"));
  const go = (next: TeamTab) => router.replace(teamLink(id, next));
  const [inviteOpen, setInviteOpen] = useState(false);
  // Açık kanal tam ekran sohbettir: telefonda genel üst menü yalnız o durumda gizlenir (globals.css `data-team-focus`); alt menüye dokunulmaz.
  useEffect(() => {
    if (!chatFocus) return;
    const root = document.documentElement;
    root.setAttribute("data-team-focus", "");
    return () => root.removeAttribute("data-team-focus");
  }, [chatFocus]);

  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-5 sm:px-5 lg:px-8" data-testid="team-loading">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (state !== "ready" || !team) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-10 sm:px-5">
        <EmptyState
          icon={Briefcase}
          title={t(state === "failed" ? "tm.page.failed" : "tm.page.notFound")}
          description={t(state === "failed" ? "tm.page.failedBody" : "tm.page.notFoundBody")}
          action={{ label: t("tm.page.backToTeams"), href: "/teams" }}
        />
      </div>
    );
  }

  const sectionMenu = (
    <SectionMenu
      items={items.map((item) => ({ key: item.key, label: item.label }))}
      active={tab}
      onChange={go}
      ariaLabel={t("tm.tab.aria")}
      title={t("tm.tab.aria")}
    />
  );
  const ctx: TeamCtx = { team, can, policy, reload, sectionMenu };
  const body = (() => {
    switch (tab) {
      case "library":
        return <TeamLibrarySection ctx={ctx} />;
      case "chat":
        return <TeamChatSection ctx={ctx} />;
      case "members":
        return <TeamMembersSection ctx={ctx} />;
      case "panel":
        return <TeamPanelSection ctx={ctx} />;
      case "admin":
        return <TeamAdminSection ctx={ctx} />;
      default:
        return <TeamSpacesSection ctx={ctx} />;
    }
  })();

  const onSpaces = tab === "spaces";
  const chatTarget = teamLink(id, "chat");
  // Onay incelemesi tam sayfadır (mockup 11); telefonda prompt ayrıntısı da kendi üst çubuğunu çizer (P4).
  const reviewing = tab === "library" && Boolean(params.get("review"));
  const itemOpen = tab === "library" && Boolean(params.get("item"));
  if (reviewing) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 md:py-6 lg:px-8 lg:py-8" data-testid="team-page" data-team-id={team.id}>
        <div data-team-tab={tab}>{body}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-5 sm:px-5 md:space-y-4 md:py-6 lg:px-8 lg:py-8" data-testid="team-page" data-team-id={team.id}>
      {/* Telefon (mockup P1–P16): üst menü yerine ekibin kendi çubuğu; Space'ler'de büyük başlık, diğer bölümlerde kompakt başlık. */}
      {!chatFocus && !itemOpen && (
        <div className="-mx-3 mb-3 md:hidden" data-team-phone-bar>
          <div className="flex h-14 items-center gap-2 border-b border-border-soft bg-surface px-2">
            <Link href={onSpaces ? "/teams" : teamLink(id, "spaces")} aria-label={t("tm.title")} className="grid h-10 w-10 place-items-center rounded-full text-text hover:bg-surface-soft" data-team-back>
              <ArrowLeft size={20} aria-hidden />
            </Link>
            {onSpaces ? (
              <span className="min-w-0 flex-1 truncate text-body font-semibold">{t("tm.title")}</span>
            ) : (
              <>
                <TeamMark name={team.name} tone={team.tone} size={30} solid className="rounded-lg" />
                <span className="min-w-0 flex-1 truncate text-body font-semibold">{team.name}</span>
              </>
            )}
            {onSpaces ? null : (
              <Link href={chatTarget} aria-label={t("tm.tab.chat")} className="grid h-10 w-10 place-items-center rounded-full text-text hover:bg-surface-soft">
                <MessageCircle size={20} aria-hidden />
              </Link>
            )}
          </div>
          {onSpaces && (
            <div className="space-y-3 px-3 pt-4" data-team-phone-identity>
              <div className="flex items-center gap-3">
                <TeamMark name={team.name} tone={team.tone} size={56} solid className="rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-h2">{team.name}</h1>
                    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-primary-soft px-2.5 text-caption font-bold text-primary">{t("tm.badge")}</span>
                  </div>
                  <p className="text-small text-text-secondary">
                    {t("tm.card.members", { count: team.memberCount })} · {t("tm.card.spaces", { count: team.spaceCount })}
                  </p>
                </div>
              </div>
              <Link href={chatTarget} className={buttonClassName({ variant: "primary", className: "h-12 w-full gap-2" })} data-team-open-chat>
                <MessageCircle size={18} aria-hidden />
                {t("tm.header.openChat")}
                {team.unreadCount > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-caption font-bold text-primary">{team.unreadCount}</span>}
              </Link>
            </div>
          )}
        </div>
      )}
      <Link href="/teams" className={`items-center gap-1.5 text-small font-medium text-text-secondary underline-offset-2 hover:text-text hover:underline max-md:hidden ${chatFocus ? "hidden md:inline-flex" : "inline-flex"}`} data-team-back-desktop>
        <ArrowLeft size={15} aria-hidden />
        {t("tm.title")}
      </Link>
      <header className={`items-center gap-4 max-md:hidden ${chatFocus ? "hidden md:flex" : "flex"}`} data-team-header-block>
        <TeamMark name={team.name} tone={team.tone} size={56} solid className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-h1">{team.name}</h1>
            <span className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-caption font-bold text-primary">{t("tm.badge")}</span>
          </div>
          <p className="mt-0.5 text-small text-text-secondary">
            {t("tm.card.members", { count: team.memberCount })} · {t("tm.card.spaces", { count: team.spaceCount })} · {t("tm.header.inviteOnly")}
          </p>
        </div>
        {can("manage_members") && !isGuest && (
          <Button type="button" variant="outline" onClick={() => setInviteOpen(true)} data-team-invite-header>
            {t("tm.invite.title")}
          </Button>
        )}
        {tab !== "chat" && (
          <Link href={chatTarget} className={buttonClassName({ variant: "primary", className: "gap-2" })} data-team-open-chat-desktop>
            <MessageCircle size={17} aria-hidden />
            {t("tm.header.openChat")}
          </Link>
        )}
      </header>
      {/* Telefonda "Davet et" kompakt başlıkta yer almaz: Üyeler'in kontrol satırında durur. */}
      <nav aria-label={t("tm.tab.aria")} className={`border-b border-border-soft max-md:hidden ${chatFocus ? "hidden" : ""}`} data-testid="team-tabs">
        <ScrollRow className="gap-7 -mb-px">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item.key)}
              aria-current={tab === item.key ? "page" : undefined}
              data-team-tab-link={item.key}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-0.5 py-2.5 text-body transition-colors ${
                tab === item.key ? "border-primary font-bold text-primary" : "border-transparent font-medium text-text-secondary hover:text-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </ScrollRow>
      </nav>
      {!chatFocus && !OWN_MENU_TABS.includes(tab) && <div className="md:hidden" data-team-phone-menu>{sectionMenu}</div>}
      {isGuest && team.guestUntil && <p className="rounded-lg bg-warning/10 px-3 py-2 text-small text-warning">{t("tm.guest.banner", { date: new Date(team.guestUntil).toLocaleDateString() })}</p>}
      <div data-team-tab={tab}>{body}</div>
      {inviteOpen && <InviteDialog ctx={ctx} onClose={() => setInviteOpen(false)} onDone={() => undefined} />}
    </div>
  );
}
