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
import { PhoneSubBar } from "@/features/content/phone-sections";
import { useMediaQuery } from "@/lib/use-media-query";
import { InviteDialog } from "./team-invites";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchMyTeam, fetchTeamPolicy, type TeamPolicy, type TeamSummary } from "@/lib/supabase/teams";
import { DEFAULT_TEAM_ROLE_POLICY, isTeamTab, teamLink, teamRoleCan, type TeamCapability, type TeamRolePolicy, type TeamTab } from "@/lib/teams";
import { TeamAdminSection } from "./team-admin-section";
import { TeamChatSection } from "./team-chat-section";
import { TeamMembersSection } from "./team-members-section";
import { TeamPanelSection } from "./team-panel-section";
import { TeamProjectPage } from "./team-project-page";
import { TeamProjectsSection } from "./team-projects-section";
import { TeamPhoneHome } from "./team-phone-home";
import { TeamMark } from "./team-ui";

export interface TeamCtx {
  team: TeamSummary;
  /** `can` yalnız GÖSTERİM içindir (butonları gizler); gerçek karar her RPC'de sunucudadır. */
  can: (cap: TeamCapability) => boolean;
  policy: TeamPolicy | null;
  reload: () => void;
  /** Eski telefon "Bölüm ▾" menüsü yuvası: artık hep null (telefonda bölümler liste → alt sayfadır, docs/history/357-*); bölüm kodları geriye uyumluluk için okur. */
  sectionMenu: React.ReactNode;
}

/**
 * Ekip sayfası (`/teams/local?id=&tab=`). Bölümler: Projeler · Sohbet · Üyeler · Panel · Yönetim; konuklar yalnız Projeler ve Sohbet'i görür
 * (docs/history/362-*). Eski `tab=spaces|library` adresleri Projeler'e yönlenir.
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
  const phone = useMediaQuery("(max-width: 767.98px)");

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
    const list: { key: TeamTab; label: string; count?: number }[] = [{ key: "projects", label: t("tp.tab.projects") }];
    list.push({ key: "chat", label: t("tm.tab.chat"), count: team?.unreadCount || undefined });
    if (!isGuest) list.push({ key: "members", label: t("tm.tab.members") });
    if (!isGuest && can("view_audit")) list.push({ key: "panel", label: t("tm.tab.panel") });
    if (adminVisible) list.push({ key: "admin", label: t("tm.tab.admin") });
    return list;
  }, [t, isGuest, can, adminVisible, team?.unreadCount]);

  // Eski adresler (`spaces`, `library`) Projeler'e yönlenir; bilinmeyen/yetkisiz sekme de Projeler'dir.
  const wantedTab = rawTab === "spaces" || rawTab === "library" ? "projects" : rawTab;
  const tab: TeamTab = isTeamTab(wantedTab) && items.some((item) => item.key === wantedTab) ? wantedTab : "projects";
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

  const ctx: TeamCtx = { team, can, policy, reload, sectionMenu: null };
  const body = (() => {
    switch (tab) {
      case "chat":
        return <TeamChatSection ctx={ctx} />;
      case "members":
        return <TeamMembersSection ctx={ctx} />;
      case "panel":
        return <TeamPanelSection ctx={ctx} />;
      case "admin":
        return <TeamAdminSection ctx={ctx} />;
      default:
        return params.get("project") ? <TeamProjectPage ctx={ctx} /> : <TeamProjectsSection ctx={ctx} />;
    }
  })();

  const chatTarget = teamLink(id, "chat");
  // Telefon: `tab` adreste yoksa kök ana ekran; varsa alt sayfa. Masaüstü hep sekmeli eski düzen (varsayılan Space'ler).
  const phoneRoot = phone && !rawTab && !params.get("channel");
  const phoneSub = phone && !phoneRoot;
  // Lider onay incelemesi tam sayfadır: ekip başlığı/sekmeleri gizlenir.
  const reviewing = tab === "projects" && Boolean(params.get("project")) && Boolean(params.get("review"));
  const itemOpen = false;
  if (reviewing) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 md:py-6 lg:px-8 lg:py-8" data-testid="team-page" data-team-id={team.id}>
        <div data-team-tab={tab}>{body}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-5 sm:px-5 md:space-y-4 md:py-6 lg:px-8 lg:py-8" data-testid="team-page" data-team-id={team.id}>
      {/* Telefon (docs/history/357-*, Yön C): kök = kimlik + sohbet düğmesi + bölüm LİSTESİ; bir bölüm açılınca alt sayfa çubuğu. Yönetim kendi çubuklarını çizer. */}
      {!chatFocus && !itemOpen && phoneRoot && (
        <TeamPhoneHome team={team} tabs={items} canInvite={can("manage_members") && !isGuest} onInvite={() => setInviteOpen(true)} />
      )}
      {!chatFocus && !itemOpen && phoneSub && tab !== "admin" && (
        <div data-team-phone-bar>
          <PhoneSubBar parent={team.name} title={items.find((item) => item.key === tab)?.label ?? ""} backHref={teamLink(id)} />
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
            {t("tm.card.members", { count: team.memberCount })} · {t("tp.header.projects", { count: team.spaceCount })} · {t("tm.header.inviteOnly")}
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
      {isGuest && team.guestUntil && <p className="rounded-lg bg-warning/10 px-3 py-2 text-small text-warning">{t("tm.guest.banner", { date: new Date(team.guestUntil).toLocaleDateString() })}</p>}
      {!phoneRoot && <div data-team-tab={tab}>{body}</div>}
      {inviteOpen && <InviteDialog ctx={ctx} onClose={() => setInviteOpen(false)} onDone={() => undefined} />}
    </div>
  );
}
