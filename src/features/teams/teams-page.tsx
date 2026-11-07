"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Briefcase } from "@/components/icons/briefcase";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Plus } from "@/components/icons/plus";
import { Shapes } from "@/components/icons/shapes";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { SadeTitle } from "@/features/content/list-control-row";
import { PagedListState } from "@/features/feed/paged-list-state";
import { CreateCommunityModal } from "@/features/communities/create-community-modal";
import { InvitesView } from "@/features/communities/home-invites-tab";
import { useToast } from "@/features/groups/use-toast";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { communityChatHref, teamHref } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { TeamLanguageScope, useTranslation } from "@/lib/i18n/language-provider";
import { listMyTeams, type TeamSummary } from "@/lib/supabase/communities";
import { formatRelativeTime } from "@/lib/utils";

/**
 * `/teams`: Ekipler (docs/history/350-*). Ekip = üyesi olduğum "tamamen kapalı" topluluk; bu sayfa onların günlük kapısıdır: her kartta ekibin
 * Space'lerine ve sohbetine kısayol. Veri tek RPC'dir (`list_my_teams`, sayfalı); ekip sayfası mevcut topluluk sayfasıdır (ekipte "Space'ler" ilk sekme).
 */
const ignoreCount = () => undefined;

export function TeamsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useRealMessages();
  const { node: toastNode, show } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const list = usePagedList<TeamSummary>(`teams|${user?.id ?? ""}`, Boolean(user), (offset) => listMyTeams(offset));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8" data-testid="teams-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <SadeTitle>{t("teams.title")}</SadeTitle>
          <p className="max-w-xl text-small text-text-secondary">{t("teams.intro")}</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} data-team-create>
          <Plus size={16} aria-hidden />
          {t("teams.create")}
        </Button>
      </div>

      {/* Ekip davetleri (docs/history/351-*): tamamen kapalı = ekip, davetleri Topluluklar'da değil burada görünür; kabul edince ekibin sayfasına gidilir. */}
      {user && (
        <TeamLanguageScope enabled>
          <div data-testid="team-invites">
            <InvitesView
              kind="team"
              hideWhenEmpty
              userId={user.id}
              onCount={ignoreCount}
              onToast={show}
              onJoined={(groupId) => {
                void refresh();
                router.push(teamHref(groupId, "spaces"));
              }}
            />
          </div>
        </TeamLanguageScope>
      )}

      <PagedListState
        list={list}
        skeleton={
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="hidden h-44 w-full rounded-xl sm:block" />
          </div>
        }
      >
        {list.items.length === 0 && !list.failed ? (
          <div className="space-y-3">
            <EmptyState
              icon={Briefcase}
              title={t("teams.empty.title")}
              description={t("teams.empty.body")}
              action={{ label: t("teams.create"), onClick: () => setCreateOpen(true) }}
            />
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="teams-list">
            {list.items.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </ul>
        )}
      </PagedListState>

      {toastNode}
      {createOpen && (
        <CreateCommunityModal
          mode="team"
          onClose={() => setCreateOpen(false)}
          onCreated={(groupId) => {
            setCreateOpen(false);
            void refresh();
            router.push(teamHref(groupId, "spaces"));
          }}
        />
      )}
    </div>
  );
}

function TeamCard({ team }: { team: TeamSummary }) {
  const { t, language } = useTranslation();
  return (
    <li data-team-card={team.id} className="flex flex-col gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card transition-colors duration-200 ease-soft hover:border-border-strong">
      <Link href={teamHref(team.id, "spaces")} className="flex items-start gap-3">
        <GroupAvatar name={team.name} avatarUrl={team.avatarUrl} size={52} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-text">{team.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-text-muted">
            <span>{memberCountText(t, team.memberCount)}</span>
            <span aria-hidden>·</span>
            <span>{t(team.spaceCount === 1 ? "teams.card.spaces.one" : "teams.card.spaces.other", { count: team.spaceCount })}</span>
            <RoleBadge role={team.myRole} />
          </span>
          {team.description && <span className="mt-1 line-clamp-2 block break-words text-small text-text-secondary">{team.description}</span>}
        </span>
      </Link>
      {team.lastActivityAt && <p className="text-caption text-text-muted">{t("teams.card.active", { time: formatRelativeTime(team.lastActivityAt, language) })}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        <Link href={teamHref(team.id, "spaces")} data-team-open-spaces className={buttonClassName({ size: "sm" })}>
          <Shapes size={14} aria-hidden />
          {t("teams.card.openSpaces")}
        </Link>
        <Link href={communityChatHref(team.id)} data-team-open-chat className={buttonClassName({ size: "sm", variant: "outline" })}>
          <MessagesSquare size={14} aria-hidden />
          {t("teams.card.openChat")}
          {team.unreadCount > 0 && (
            <span aria-label={t("teams.card.unread", { count: team.unreadCount })} className="ml-1 rounded-full bg-primary px-1.5 text-caption text-primary-foreground">
              {team.unreadCount}
            </span>
          )}
        </Link>
      </div>
    </li>
  );
}
