"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Briefcase } from "@/components/icons/briefcase";
import { SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
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
import { RoleChip, TeamMark } from "./team-ui";

export interface TeamCtx {
  team: TeamSummary;
  /** `can` yalnız GÖSTERİM içindir (butonları gizler); gerçek karar her RPC'de sunucudadır. */
  can: (cap: TeamCapability) => boolean;
  policy: TeamPolicy | null;
  reload: () => void;
}

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
  const items: SectionMenuItem<TeamTab>[] = useMemo(() => {
    const list: SectionMenuItem<TeamTab>[] = [{ key: "spaces", label: t("tm.tab.spaces") }];
    if (!isGuest) list.push({ key: "library", label: t("tm.tab.library") });
    list.push({ key: "chat", label: t("tm.tab.chat"), count: team?.unreadCount || undefined });
    if (!isGuest) list.push({ key: "members", label: t("tm.tab.members") });
    if (!isGuest && can("view_audit")) list.push({ key: "panel", label: t("tm.tab.panel") });
    if (adminVisible) list.push({ key: "admin", label: t("tm.tab.admin") });
    return list;
  }, [t, isGuest, can, adminVisible, team?.unreadCount]);

  const tab: TeamTab = isTeamTab(rawTab) && items.some((item) => item.key === rawTab) ? rawTab : "spaces";
  const go = (next: TeamTab) => router.replace(teamLink(id, next));

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

  const ctx: TeamCtx = { team, can, policy, reload };
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8" data-testid="team-page" data-team-id={team.id}>
      <header className="flex flex-wrap items-center gap-3">
        <TeamMark name={team.name} tone={team.tone} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-h1">{team.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-secondary">
            <RoleChip role={team.myRole} />
            <span>{t("tm.card.members", { count: team.memberCount })}</span>
            <span aria-hidden>·</span>
            <span>@{team.slug}</span>
          </p>
        </div>
        <SectionMenu items={items} active={tab} onChange={go} ariaLabel={t("tm.tab.aria")} title={t("tm.tab.aria")} align="end" />
      </header>
      {team.description && <p className="max-w-2xl break-words text-small text-text-secondary">{team.description}</p>}
      {isGuest && team.guestUntil && <p className="rounded-lg bg-warning/10 px-3 py-2 text-small text-warning">{t("tm.guest.banner", { date: new Date(team.guestUntil).toLocaleDateString() })}</p>}
      <div data-team-tab={tab}>{body}</div>
    </div>
  );
}
