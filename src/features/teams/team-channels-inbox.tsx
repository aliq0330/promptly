"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Briefcase } from "@/components/icons/briefcase";
import { Hash } from "@/components/icons/hash";
import { Lock } from "@/components/icons/lock";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { listMyTeams, listTeamChannels, type TeamChannel, type TeamSummary } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { formatRelativeTime } from "@/lib/utils";
import { TeamMark } from "./team-ui";

interface Group {
  team: TeamSummary;
  channels: TeamChannel[];
}

/**
 * Mesajlar → "Ekip sohbetleri" (docs/history/353-*): üyesi olduğum ekiplerin kanalları ekip ekip. Her kanal AYNI konuşmadır — satıra basınca ekip sayfasının
 * Sohbet sekmesi o kanalla açılır; okundu imleci ve okunmamış sayısı iki girişte ortaktır.
 */
export function TeamChannelsInbox() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const teams = (await listMyTeams(0)).items;
        const loaded = await Promise.all(teams.map(async (team) => ({ team, channels: (await listTeamChannels(team.id)).filter((c) => !c.archivedAt) })));
        if (!cancelled) setGroups(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (failed) return <EmptyState icon={Briefcase} title={t("tm.chat.failed")} compact />;
  if (!groups) return <p className="py-10 text-center text-small text-text-muted">{t("common.loading")}</p>;
  if (groups.length === 0) return <EmptyState icon={Briefcase} title={t("tm.empty.title")} description={t("tm.empty.body")} action={{ label: t("tm.title"), href: "/teams" }} />;

  return (
    <div className="space-y-5" data-testid="messages-team-channels">
      {groups.map(({ team, channels }) => (
        <section key={team.id} aria-label={team.name}>
          <h2 className="mb-1 flex items-center gap-2 text-label font-semibold">
            <TeamMark name={team.name} tone={team.tone} size={22} />
            <Link href={teamLink(team.id)} className="truncate hover:text-primary">
              {team.name}
            </Link>
          </h2>
          <ul className="divide-y divide-border-soft">
            {channels.map((channel) => (
              <li key={channel.id}>
                <Link href={teamLink(team.id, "chat", { channel: channel.name })} data-team-channel-row={channel.id} className="flex min-h-12 items-center gap-3 px-1 py-2 hover:bg-surface-soft">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-soft text-text-secondary">
                    {channel.mode === "private" ? <Lock size={16} aria-hidden /> : <Hash size={16} aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium">{channel.name}</span>
                    <span className="block truncate text-caption text-text-muted">
                      {channel.lastMessageAt ? formatRelativeTime(channel.lastMessageAt, language) : t("tm.chat.noMessages")}
                    </span>
                  </span>
                  {channel.unreadCount > 0 && !channel.muted && <span className="rounded-full bg-primary px-1.5 text-caption text-primary-foreground">{channel.unreadCount}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
