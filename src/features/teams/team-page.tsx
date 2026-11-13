"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Briefcase } from "@/components/icons/briefcase";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { HUB_PAGE_CLASS } from "@/features/hub/hub-kit";
import { InviteDialog } from "./team-invites";
import { useAuth } from "@/features/auth/auth-provider";
import { LanguageTermScope, useTranslation } from "@/lib/i18n/language-provider";
import { rewriteAreaTerms } from "@/lib/team-area-terms";
import { fetchMyTeam, fetchTeamPolicy, type TeamPolicy, type TeamSummary } from "@/lib/supabase/teams";
import { fetchReviewBoard, type ReviewBoard } from "@/lib/supabase/team-center";
import { approvalBadge } from "@/lib/team-center";
import { DEFAULT_TEAM_ROLE_POLICY, isTeamTab, teamLink, teamRoleCan, type TeamCapability, type TeamRolePolicy, type TeamTab } from "@/lib/teams";
import { TeamAdminSection } from "./team-admin-section";
import { TeamApprovalsSection } from "./team-approvals-section";
import { TeamBand, TeamTabs, type TeamTabItem } from "./team-band";
import { TeamChatSection } from "./team-chat-section";
import { LeaveDialog, TeamMembersSection } from "./team-members-section";
import { TeamPanelSection } from "./team-panel-section";
import { TeamProjectPage } from "./team-project-page";
import { TeamProjectsSection } from "./team-projects-section";

export interface TeamCtx {
  team: TeamSummary;
  /** `can` yalnız GÖSTERİM içindir (butonları gizler); gerçek karar her RPC'de sunucudadır. */
  can: (cap: TeamCapability) => boolean;
  policy: TeamPolicy | null;
  reload: () => void;
  /** Onay panosu verisi (Genel bakış şeridi, Onaylar sekmesi ve sekme sayacı ortak kullanır; docs/history/366-*). Konukta hiç yüklenmez (null). */
  board: ReviewBoard | null;
  boardFailed: boolean;
  reloadBoard: () => void;
  /** Eski telefon "Bölüm ▾" menüsü yuvası: artık hep null; bölüm kodları geriye uyumluluk için okur. */
  sectionMenu: React.ReactNode;
}

/**
 * Ekip sayfası (`/teams/local?id=&tab=`; docs/history/366-*, Yön B · Merkez). Renkli bant + alt çizgili sekmeler: Genel bakış (`tab=projects`, eski adres) ·
 * Onaylar (`approvals`) · Sohbet · Üyeler · Panel · Yönetim. Konuklar yalnız Genel bakış ve Sohbet'i görür. Eski `tab=spaces|library` adresleri Genel bakış'a yönlenir.
 * Telefonda üst düzey ekranlar bant + kaydırılan sekme şeridi taşır; bir proje/dosya/öğe açılınca bant yerine o sayfanın kendi başlığı gelir.
 * Ekibe üye olmayan kimlik (ya da var olmayan ekip) "bulunamadı" görür: varlığı sızmaz.
 */
function TeamPageInner() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const { user } = useAuth();
  const id = params.get("id") ?? "";
  const rawTab = params.get("tab");
  const [team, setTeam] = useState<TeamSummary | null>(null);
  const [policy, setPolicy] = useState<TeamPolicy | null>(null);
  const [board, setBoard] = useState<ReviewBoard | null>(null);
  const [boardFailed, setBoardFailed] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [tick, setTick] = useState(0);
  const [boardTick, setBoardTick] = useState(0);
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

  const teamId = team?.id ?? null;
  const isGuest = team?.myRole === "guest";
  // Onay panosu: konuk yüklemez; okunamazsa (eski veritabanı) sayaç/şerit yok sayılır, sayfa çalışır.
  useEffect(() => {
    if (!teamId || isGuest) return;
    let cancelled = false;
    void fetchReviewBoard(teamId).then(
      (next) => {
        if (cancelled) return;
        setBoard(next);
        setBoardFailed(false);
      },
      () => !cancelled && setBoardFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [teamId, isGuest, boardTick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  const reloadBoard = useCallback(() => setBoardTick((value) => value + 1), []);

  const rolePolicy: TeamRolePolicy = useMemo(
    () =>
      policy
        ? { publish_external_role: policy.publishExternalRole, guest_invite_role: policy.guestInviteRole, export_role: policy.exportRole }
        : DEFAULT_TEAM_ROLE_POLICY,
    [policy],
  );
  const can = useCallback((cap: TeamCapability) => teamRoleCan(team?.myRole, cap, rolePolicy), [team?.myRole, rolePolicy]);

  const adminVisible = Boolean(team) && !isGuest && (can("manage_team") || can("manage_members") || can("manage_groups") || can("view_audit"));
  const approvals = board ? approvalBadge(board.items) : 0;
  const items: TeamTabItem[] = useMemo(() => {
    const list: TeamTabItem[] = [{ key: "projects", label: t("tc.tab.overview") }];
    if (!isGuest) list.push({ key: "approvals", label: t("tc.tab.approvals"), count: approvals || undefined });
    list.push({ key: "chat", label: t("tm.tab.chat"), count: team?.unreadCount || undefined });
    if (!isGuest) list.push({ key: "members", label: t("tm.tab.members") });
    if (!isGuest && can("view_audit")) list.push({ key: "panel", label: t("tm.tab.panel") });
    if (adminVisible) list.push({ key: "admin", label: t("tm.tab.admin") });
    return list;
  }, [t, isGuest, can, adminVisible, team?.unreadCount, approvals]);

  // Eski adresler (`spaces`, `library`) Genel bakış'a yönlenir; bilinmeyen/yetkisiz sekme de Genel bakış'tır.
  const wantedTab = rawTab === "spaces" || rawTab === "library" ? "projects" : rawTab;
  const tab: TeamTab = isTeamTab(wantedTab) && items.some((item) => item.key === wantedTab) ? wantedTab : "projects";
  // Telefonda açık bir kanal tam ekran sohbettir: bant, sekmeler gizlenir, geri düğmesi sohbet başlığındadır.
  const chatFocus = tab === "chat" && Boolean(params.get("channel"));
  // Telefonda proje/dosya/pano/öğe/onay kuyruğu ve Yönetim alt sayfaları kendi başlığını çizer (geri · yol · bilgi); bant ve sekmeler üst düzey ekranlarda kalır.
  const drilled = tab === "projects" && Boolean(params.get("project"));
  const adminSub = tab === "admin" && Boolean(params.get("section"));
  // Pano kipi (docs/history/367-*): `sub=board` tuvalı tam genişlikte açar; bant/sekmeler gizlenir (sol menü ve telefon alt menüsü uygulamanındır, dokunulmaz).
  const boardMode = drilled && params.get("sub") === "board" && !params.get("item") && !params.get("review");
  const hideChrome = boardMode || (phone && (chatFocus || drilled || adminSub));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // Açık kanal tam ekran sohbettir: telefonda genel üst menü yalnız o durumda gizlenir (globals.css `data-team-focus`); alt menüye dokunulmaz.
  useEffect(() => {
    if (!chatFocus) return;
    const root = document.documentElement;
    root.setAttribute("data-team-focus", "");
    return () => root.removeAttribute("data-team-focus");
  }, [chatFocus]);

  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-5 sm:px-5 lg:px-8" data-testid="team-loading">
        <Skeleton className="h-24 w-full rounded-lg" />
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

  const ctx: TeamCtx = { team, can, policy, reload, board, boardFailed, reloadBoard, sectionMenu: null };
  const body = (() => {
    switch (tab) {
      case "approvals":
        return <TeamApprovalsSection ctx={ctx} />;
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

  const menuItems = [
    { key: "info", label: t("tc.band.menu.info"), href: adminVisible ? teamLink(id, "admin", { section: "overview" }) : teamLink(id, "members") },
    { key: "chat", label: t("tc.band.menu.notifications"), href: teamLink(id, "chat") },
  ];

  return (
    <div className={boardMode ? "mx-auto w-full max-w-none" : cn(HUB_PAGE_CLASS, "space-y-4")} data-testid="team-page" data-team-id={team.id} data-board-mode={boardMode ? "" : undefined}>
      {!hideChrome && (
        <div className="space-y-4" data-team-chrome>
          <TeamBand team={team} canInvite={can("manage_members") && !isGuest} onInvite={() => setInviteOpen(true)} onLeave={team.myRole !== "owner" ? () => setLeaveOpen(true) : undefined} menuItems={menuItems} />
          <TeamTabs teamId={team.id} items={items} active={tab} ariaLabel={t("tm.tab.aria")} />
        </div>
      )}
      {isGuest && team.guestUntil && !hideChrome && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-small text-warning">{t("tm.guest.banner", { date: new Date(team.guestUntil).toLocaleDateString() })}</p>
      )}
      <div data-team-tab={tab}>
        {body}
      </div>
      {inviteOpen && <InviteDialog ctx={ctx} onClose={() => setInviteOpen(false)} onDone={() => undefined} />}
      {leaveOpen && <LeaveDialog ctx={ctx} onClose={() => setLeaveOpen(false)} />}
    </div>
  );
}

/** Ekipte "Space" kavramı yoktur: Space motorundan gelen ortak metinler (formlar, hatalar) "alan" der (docs/history/370-*). */
export function TeamPage() {
  return (
    <LanguageTermScope rewrite={rewriteAreaTerms}>
      <TeamPageInner />
    </LanguageTermScope>
  );
}
