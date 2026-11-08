"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Briefcase } from "@/components/icons/briefcase";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Plus } from "@/components/icons/plus";
import { Shapes } from "@/components/icons/shapes";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { SadeTitle } from "@/features/content/list-control-row";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  createTeam,
  listMyInvitations,
  listMyTeams,
  listMyTodos,
  respondInvitation,
  type TeamActionError,
  type TeamInvitation,
  type TeamSummary,
  type TeamTodo,
} from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { formatRelativeTime } from "@/lib/utils";
import { RoleChip, TEAM_TONES, TeamMark, roleLabelKey } from "./team-ui";

/**
 * `/teams`: Ekipler (docs/history/353-*). Ekip artık topluluktan bağımsız bir sistemdir: bu sayfa üyesi olduğum ekiplerin günlük kapısı —
 * bekleyen davetler, "senden bekleyenler" (onaylar, okunmamış kanallar), ekip kartları ve "Ekip oluştur".
 */
export function TeamsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { node: toastNode, show } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const list = usePagedList<TeamSummary>(`teams2|${user?.id ?? ""}`, Boolean(user), (offset) => listMyTeams(offset));
  const [invites, setInvites] = useState<TeamInvitation[]>([]);
  const [todos, setTodos] = useState<TeamTodo[]>([]);

  const loadSide = useCallback(() => {
    if (!user) return;
    void listMyInvitations().then(setInvites, () => setInvites([]));
    void listMyTodos().then(setTodos, () => setTodos([]));
  }, [user]);
  useEffect(loadSide, [loadSide]);

  const answer = async (invitation: TeamInvitation, accept: boolean) => {
    try {
      const result = await respondInvitation(invitation.id, accept);
      setInvites((prev) => prev.filter((item) => item.id !== invitation.id));
      if (accept && result.status === "accepted") router.push(teamLink(result.slug ?? invitation.teamId));
      else show(t("tm.invite.declined"));
    } catch (error) {
      show((error as TeamActionError).message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8" data-testid="teams-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <SadeTitle>{t("tm.title")}</SadeTitle>
          <p className="max-w-xl text-small text-text-secondary">{t("tm.intro")}</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} data-team-create>
          <Plus size={16} aria-hidden />
          {t("tm.create")}
        </Button>
      </div>

      {invites.length > 0 && (
        <ul className="space-y-2" data-testid="team-invites">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary-soft/40 p-3">
              <TeamMark name={invite.teamName} tone={invite.teamTone} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium">{invite.teamName}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-caption text-text-secondary">
                  <Avatar src={invite.inviterAvatarUrl} alt={invite.inviterName} size={16} />
                  {t("tm.invite.from", { name: invite.inviterName })} · {t(roleLabelKey(invite.role))}
                  {invite.role === "guest" && invite.guestDays ? ` · ${t("tm.invite.guestDays", { count: invite.guestDays })}` : ""}
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => void answer(invite, true)} data-invite-accept>
                {t("tm.invite.accept")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void answer(invite, false)}>
                {t("tm.invite.decline")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {todos.length > 0 && <TodoList todos={todos} />}

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
          <EmptyState icon={Briefcase} title={t("tm.empty.title")} description={t("tm.empty.body")} action={{ label: t("tm.create"), onClick: () => setCreateOpen(true) }} />
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
        <CreateTeamModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            router.push(teamLink(id));
          }}
        />
      )}
    </div>
  );
}

function TodoList({ todos }: { todos: TeamTodo[] }) {
  const { t, language } = useTranslation();
  return (
    <section aria-label={t("tm.todos.title")} className="rounded-lg border border-border-soft bg-surface p-4" data-testid="team-todos">
      <h2 className="mb-2 text-h3">{t("tm.todos.title")}</h2>
      <ul className="divide-y divide-border-soft">
        {todos.map((todo, index) => (
          <li key={`${todo.teamId}-${todo.kind}-${index}`}>
            <Link href={todo.href} className="flex items-center gap-3 py-2.5 text-small hover:text-primary">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{todoTitle(t, todo)}</span>
                <span className="text-text-muted"> · {todo.teamName}</span>
              </span>
              <span className="shrink-0 text-caption text-text-muted">{formatRelativeTime(todo.at, language)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function todoTitle(t: ReturnType<typeof useTranslation>["t"], todo: TeamTodo): string {
  switch (todo.kind) {
    case "approvals":
      return t("tm.todos.approvals", { count: todo.n });
    case "review":
      return t("tm.todos.review", { title: todo.label ?? "" });
    case "unread":
      return t("tm.todos.unread", { count: todo.n });
    case "guest_expiring":
      return t("tm.todos.guests", { count: todo.n });
    default:
      return todo.label ?? todo.kind;
  }
}

function TeamCard({ team }: { team: TeamSummary }) {
  const { t, language } = useTranslation();
  return (
    <li data-team-card={team.id} className="flex flex-col gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card transition-colors duration-200 ease-soft hover:border-border-strong">
      <Link href={teamLink(team.id)} className="flex items-start gap-3">
        <TeamMark name={team.name} tone={team.tone} size={52} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-text">{team.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-text-muted">
            <span>{t("tm.card.members", { count: team.memberCount })}</span>
            <span aria-hidden>·</span>
            <span>{t("tm.card.spaces", { count: team.spaceCount })}</span>
            <RoleChip role={team.myRole} />
          </span>
          {team.description && <span className="mt-1 line-clamp-2 block break-words text-small text-text-secondary">{team.description}</span>}
        </span>
      </Link>
      {team.lastActivityAt && <p className="text-caption text-text-muted">{t("tm.card.active", { time: formatRelativeTime(team.lastActivityAt, language) })}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        <Link href={teamLink(team.id, "spaces")} data-team-open-spaces className={buttonClassName({ size: "sm" })}>
          <Shapes size={14} aria-hidden />
          {t("tm.card.openSpaces")}
        </Link>
        <Link href={teamLink(team.id, "chat")} data-team-open-chat className={buttonClassName({ size: "sm", variant: "outline" })}>
          <MessagesSquare size={14} aria-hidden />
          {t("tm.card.openChat")}
          {team.unreadCount > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-caption text-primary-foreground">{team.unreadCount}</span>}
        </Link>
      </div>
    </li>
  );
}

export function CreateTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<string>("primary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) {
      setError(t("tm.error.team_name_invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await createTeam(name.trim(), description.trim(), tone));
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tm.create")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="team-create-form"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            {t("tm.create.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="team-name" className={fieldLabelClassName}>
            {t("tm.create.name")}
          </label>
          <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={fieldInputClassName} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="team-desc" className={fieldLabelClassName}>
            {t("tm.create.description")}
          </label>
          <textarea id="team-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-small" />
        </div>
        <div>
          <span className={fieldLabelClassName}>{t("tm.create.tone")}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("tm.create.tone")}>
            {TEAM_TONES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={tone === option}
                onClick={() => setTone(option)}
                className={`rounded-xl p-0.5 ${tone === option ? "ring-2 ring-primary" : ""}`}
              >
                <TeamMark name={name || "?"} tone={option} size={36} />
              </button>
            ))}
          </div>
        </div>
        <p className="text-caption text-text-muted">{t("tm.create.hint")}</p>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}
