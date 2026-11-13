"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { TeamMark } from "@/features/teams/team-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { listMyTeams, type TeamSummary } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/ui/badge";

/** Kısa ömürlü modül önbelleği: kenar çubuğu her sayfada yeniden kurulur, liste her gezinmede sorulmaz (docs/history/353-*). */
let cache: { userId: string; at: number; teams: TeamSummary[] } | null = null;
const TTL_MS = 60_000;

function MyTeams() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const pathname = usePathname();
  const params = useSearchParams();
  const [teams, setTeams] = useState<TeamSummary[]>(() => (cache && user && cache.userId === user.id ? cache.teams : []));

  useEffect(() => {
    if (!user) return;
    // Önbellek tazeyse (useState başlangıcı onu zaten kullandı) ağa gidilmez.
    if (cache && cache.userId === user.id && Date.now() - cache.at < TTL_MS) return;
    let cancelled = false;
    void listMyTeams(0).then(
      (page) => {
        cache = { userId: user.id, at: Date.now(), teams: page.items };
        if (!cancelled) setTeams(page.items);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (teams.length === 0) return null;
  const current = pathname.startsWith("/teams/local") ? params.get("id") : null;
  return (
    <div data-testid="sidebar-teams" className="hidden lg:block">
      <p className="mb-1.5 px-3 text-micro font-semibold uppercase tracking-[0.1em] text-text-muted">{t("tm.sidebar.title")}</p>
      <ul className="space-y-0.5">
        {teams.slice(0, 6).map((team) => {
          const active = current === team.id || current === team.slug;
          return (
            <li key={team.id}>
              <Link
                href={teamLink(team.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-xl px-3 text-small transition-colors",
                  active ? "bg-primary-soft font-semibold text-primary" : "font-medium text-text-secondary hover:bg-surface-soft hover:text-text",
                )}
              >
                <TeamMark name={team.name} tone={team.tone} size={24} />
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                {team.unreadCount > 0 && <CountBadge>{team.unreadCount}</CountBadge>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SidebarTeams() {
  return (
    <Suspense fallback={null}>
      <MyTeams />
    </Suspense>
  );
}
