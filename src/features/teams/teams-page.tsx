"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase } from "@/components/icons/briefcase";
import { Check } from "@/components/icons/check";
import { Eye } from "@/components/icons/eye";
import { MessageCircle } from "@/components/icons/message-circle";
import { Plus } from "@/components/icons/plus";
import { Search } from "@/components/icons/search";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { SadeTitle } from "@/features/content/list-control-row";
import { CONTROL_ICON_BUTTON, SectionMenu } from "@/features/content/section-menu";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useToast } from "@/features/groups/use-toast";
import { PHONE_HOME_BOTTOM_PAD, PHONE_HOME_PILL, PHONE_HOME_PILL_OUTLINE, PhoneHomeCard, PhoneHomeRow, PhoneHomeSection } from "@/features/content/phone-home";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useMediaQuery } from "@/lib/use-media-query";
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
import { fetchProjectTodos, listProjects, projectTodoAsTeamTodo, type ProjectSummary, type ProjectTodo } from "@/lib/supabase/team-projects";
import { teamLink } from "@/lib/teams";
import { cn, formatRelativeTime } from "@/lib/utils";
import { TEAM_TONES, TeamMark, roleLabelKey } from "./team-ui";
import { ProjectMini, todoLine } from "./team-phone-home";

/**
 * `/teams`: Ekipler (docs/history/353-*). Ekip artık topluluktan bağımsız bir sistemdir: bu sayfa üyesi olduğum ekiplerin günlük kapısı —
 * bekleyen davetler, "senden bekleyenler" (onaylar, okunmamış kanallar), ekip kartları ve "Ekip oluştur".
 */
export function TeamsPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { node: toastNode, show } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "managed">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = usePagedList<TeamSummary>(`teams2|${user?.id ?? ""}`, Boolean(user), (offset) => listMyTeams(offset));
  const [invites, setInvites] = useState<TeamInvitation[]>([]);
  const [todos, setTodos] = useState<TeamTodo[]>([]);
  const phone = useMediaQuery("(max-width: 767.98px)");
  const [recentProjects, setRecentProjects] = useState<{ project: ProjectSummary; teamId: string; teamName: string }[]>([]);

  const loadSide = useCallback(() => {
    if (!user) return;
    void listMyInvitations().then(setInvites, () => setInvites([]));
    // Bekleyenler: proje onayları (yeni) + okunmamış sohbet / süresi dolan konuk (eski `my_team_todos`'tan yalnız bu iki tür).
    void Promise.all([listMyTodos().catch(() => [] as TeamTodo[]), fetchProjectTodos().catch(() => [] as ProjectTodo[])]).then(([legacy, project]) =>
      setTodos([...project.map(projectTodoAsTeamTodo), ...legacy.filter((todo) => todo.kind === "unread" || todo.kind === "guest_expiring")]),
    );
  }, [user]);
  useEffect(loadSide, [loadSide]);

  // Telefon "Son projeler" şeridi (docs/history/359-*, 362-*): ilk üç ekibin projeleri, en son açılan iki tanesi.
  const teamKey = list.items.slice(0, 3).map((team) => team.id).join(",");
  useEffect(() => {
    if (!phone || !teamKey) return;
    let cancelled = false;
    const teams = list.items.slice(0, 3).filter((team) => team.spaceCount > 0);
    void Promise.all(teams.map((team) => listProjects(team.id).then((all) => all.map((project) => ({ project, teamId: team.id, teamName: team.name })), () => [] as { project: ProjectSummary; teamId: string; teamName: string }[]))).then((all) => {
      if (cancelled) return;
      setRecentProjects(all.flat().filter(({ project }) => !project.archivedAt).slice(-2).reverse());
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `list.items` her çizimde değişebilir; ekip kimlikleri `teamKey`'de.
  }, [phone, teamKey]);

  const phoneTodos = useMemo(() => todos.slice(0, 5), [todos]);
  const approvalsByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const todo of todos) if (todo.kind === "project_review") map.set(todo.teamId, (map.get(todo.teamId) ?? 0) + todo.n);
    return map;
  }, [todos]);

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

  const needle = query.trim().toLocaleLowerCase();
  const visibleTeams = list.items.filter((team) => (filter === "all" || team.myRole === "owner" || team.myRole === "admin") && (!needle || team.name.toLocaleLowerCase().includes(needle)));

  return (
    <div className={cn("mx-auto w-full max-w-5xl px-3 pb-6 sm:px-5 md:space-y-5 md:py-6 lg:px-8 lg:py-8", PHONE_HOME_BOTTOM_PAD, "md:pb-6")} data-testid="teams-page">
      {/* Telefon (docs/history/357-*): Topluluklar ile AYNI iskelet — büyük başlık + tek denetim satırı (süzgeç hapı · ara · "+"). */}
      <div className="mb-3 space-y-3 pt-2 md:hidden" data-teams-phone-bar>
        <SadeTitle>{t("tm.title")}</SadeTitle>
        <div className="flex items-center gap-1.5">
          <SectionMenu
            items={[
              { key: "all", label: t("tm.filter.all") },
              { key: "managed", label: t("tm.filter.managed") },
            ]}
            active={filter}
            onChange={setFilter}
            ariaLabel={t("tm.filter.aria")}
            title={t("tm.title")}
          />
          <span className="flex-1" />
          <button type="button" onClick={() => setSearchOpen((open) => !open)} aria-label={t("header.searchAriaLabel")} aria-pressed={searchOpen} data-teams-search className={cn(CONTROL_ICON_BUTTON, "bg-surface-soft")}>
            <Search size={18} aria-hidden />
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} aria-label={t("tm.create")} data-team-create-phone className={cn(CONTROL_ICON_BUTTON, "bg-surface-soft")}>
            <Plus size={20} aria-hidden />
          </button>
        </div>
        {searchOpen && (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("tm.filter.search")}
            aria-label={t("tm.filter.search")}
            className={fieldInputClassName}
          />
        )}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 max-md:hidden">
        <div className="min-w-0 space-y-1.5">
          <SadeTitle>{t("tm.title")}</SadeTitle>
          <p className="max-w-xl text-small text-text-secondary">{t("tm.intro")}</p>
        </div>
        <Button type="button" size="lg" onClick={() => setCreateOpen(true)} data-team-create>
          <Plus size={16} aria-hidden />
          {t("tm.create")}
        </Button>
      </div>

      {invites.length > 0 && (
        <ul className="space-y-2 max-md:mb-3" data-testid="team-invites">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-soft bg-surface p-3.5 max-md:p-3">
              <TeamMark name={invite.teamName} tone={invite.teamTone} size={40} className="rounded-xl" />
              <div className="min-w-0 flex-1 max-md:basis-[calc(100%-3.5rem)]">
                <p className="text-small text-text-secondary">
                  {richParts(t("tm.invite.line", { inviter: "\u0001", team: "\u0002" }), invite.inviterName, invite.teamName)}
                  <span> · {t("tm.invite.asRole", { role: t(roleLabelKey(invite.role)) })}</span>
                  {invite.role === "guest" && invite.guestDays ? <span> · {t("tm.invite.guestDays", { count: invite.guestDays })}</span> : null}
                  <span> · {formatRelativeTime(invite.createdAt, language)}</span>
                </p>
              </div>
              <div className="flex gap-2 max-md:w-full">
                <Button type="button" size="sm" className="max-md:flex-1" onClick={() => void answer(invite, true)} data-invite-accept>
                  {t("tm.invite.accept")}
                </Button>
                <Button type="button" size="sm" variant="outline" className="max-md:flex-1" onClick={() => void answer(invite, false)}>
                  {t("tm.invite.decline")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {phone && phoneTodos.length > 0 && (
        <PhoneHomeSection title={t("tm.home.waiting", { count: phoneTodos.length })} testId="team-phone-todos">
          <PhoneHomeCard>
            {phoneTodos.map((todo, index) => {
              const line = todoLine(t, todo);
              return (
                <PhoneHomeRow
                  key={`${todo.teamId}-${todo.kind}-${index}`}
                  thumb={line.action === "chat" ? <MessageCircle size={20} aria-hidden /> : <Check size={20} aria-hidden />}
                  title={line.title}
                  sub={`${line.sub} · ${todo.teamName}`}
                  href={todo.href}
                  action={
                    <Link href={todo.href} className={line.action === "chat" ? PHONE_HOME_PILL_OUTLINE : PHONE_HOME_PILL}>
                      {t(line.action === "chat" ? "tm.home.open" : "tm.todos.review.action")}
                    </Link>
                  }
                />
              );
            })}
          </PhoneHomeCard>
        </PhoneHomeSection>
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
          <EmptyState icon={Briefcase} title={t("tm.empty.title")} description={t("tm.empty.body")} action={{ label: t("tm.create"), onClick: () => setCreateOpen(true) }} />
        ) : (
          phone ? (
            <PhoneHomeSection title={t("tm.home.myTeams")}>
              <ul className="space-y-3" data-testid="teams-list">
                {visibleTeams.map((team) => (
                  <PhoneTeamCard key={team.id} team={team} approvals={approvalsByTeam.get(team.id) ?? 0} />
                ))}
              </ul>
            </PhoneHomeSection>
          ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4" data-testid="teams-list">
            {visibleTeams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
            <li className="max-md:hidden">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                data-team-new-card
                className="flex h-full min-h-[15rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-5 text-center transition-colors hover:bg-surface-soft"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary">
                  <Plus size={20} aria-hidden />
                </span>
                <span className="text-body font-bold text-text">{t("tm.card.new")}</span>
                <span className="text-small text-text-secondary">{t("tm.card.newHint")}</span>
              </button>
            </li>
          </ul>
          )
        )}
      </PagedListState>

      {phone && recentProjects.length > 0 && (
        <PhoneHomeSection title={t("tp.home.recent")} testId="teams-phone-projects">
          <ul className="grid grid-cols-2 gap-2">
            {recentProjects.map(({ project, teamId, teamName }) => (
              <ProjectMini key={project.id} teamId={teamId} project={project} sub={teamName} />
            ))}
          </ul>
        </PhoneHomeSection>
      )}

      {!phone && todos.length > 0 && <TodoList todos={todos} />}

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

/** "{{inviter}} seni {{team}} ekibine davet etti" kalıbında iki adı kalın yazar (iki dilde söz dizimi farklı olduğundan işaretçiyle bölünür). */
function richParts(template: string, inviter: string, team: string): React.ReactNode[] {
  return template.split(/(\u0001|\u0002)/).map((part, index) =>
    part === "\u0001" ? <strong key={index} className="font-bold text-text">{inviter}</strong> : part === "\u0002" ? <strong key={index} className="font-bold text-text">{team}</strong> : <span key={index}>{part}</span>,
  );
}

function TodoList({ todos }: { todos: TeamTodo[] }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("tm.todos.title")} className="max-md:mt-4" data-testid="team-todos">
      <h2 className="mb-3 text-h3 font-bold">{t("tm.todos.title")}</h2>
      <ul className="space-y-2.5">
        {todos.map((todo, index) => {
          const Icon = todo.kind === "unread" ? MessageCircle : todo.kind === "project_review" ? Eye : Check;
          const tone = todo.kind === "unread" ? "bg-success/10 text-success" : todo.kind === "project_review" ? "bg-primary-soft text-primary" : "bg-warning/10 text-warning";
          return (
            <li key={`${todo.teamId}-${todo.kind}-${index}`} className="flex items-center gap-3 rounded-2xl border border-border-soft bg-surface px-3.5 py-3">
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tone)} aria-hidden>
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1 text-small text-text-secondary">
                <strong className="font-bold text-text">{todo.teamName}</strong> · {todoTitle(t, todo)}
              </span>
              <Link href={todo.href} className={buttonClassName({ size: "sm", variant: "outline", className: "shrink-0" })}>
                {t(todo.kind === "unread" ? "tm.todos.openChat" : "tm.todos.review.action")}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function todoTitle(t: ReturnType<typeof useTranslation>["t"], todo: TeamTodo): string {
  switch (todo.kind) {
    case "project_review":
      return `${t("tp.todo.review", { count: todo.n })} · ${todo.label}`;
    case "project_changes":
      return `${t("tp.todo.changes", { count: todo.n })} · ${todo.label}`;
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

const CARD_BAND: Record<string, string> = {
  primary: "bg-primary-soft",
  secondary: "bg-secondary/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  plum: "bg-text-secondary/10",
  sky: "bg-primary/10",
};

/** Kartın son etkinlik cümlesi (yalnız herkese açık olay türleri, bkz. `my_teams_preview`). */
function recentLine(t: ReturnType<typeof useTranslation>["t"], language: string, recent: NonNullable<TeamSummary["recent"]>): string {
  const who = (recent.actorName ?? "").split(" ")[0];
  const when = formatRelativeTime(recent.at, language as "tr" | "en");
  if (recent.action === "item_approved") return t("tm.card.recent.approved", { name: who, title: recent.label ?? "", time: when });
  if (recent.action === "variable_updated") return t("tm.card.recent.variables", { name: who, time: when });
  return t("tm.card.recent.joined", { name: who, time: when });
}

const BAND_GRADIENT: Record<string, string> = {
  primary: "from-primary/60 to-primary",
  secondary: "from-secondary/60 to-secondary",
  success: "from-success/60 to-success",
  warning: "from-warning/60 to-warning",
  plum: "from-text-secondary/60 to-text-secondary",
  sky: "from-primary/50 to-primary",
};

/** Telefon ekip kartı (docs/history/359-*): renkli bant + taşan karo + üye yığını + rol/sayılar + bekleyen iş rozetleri + "Aç". */
function PhoneTeamCard({ team, approvals }: { team: TeamSummary; approvals: number }) {
  const { t } = useTranslation();
  const preview = team.membersPreview ?? [];
  const more = Math.max(0, team.memberCount - preview.length);
  return (
    <li data-team-card={team.id} data-team-phone-card className="relative overflow-hidden rounded-2xl border border-border-soft bg-surface">
      <div className={cn("relative h-12 bg-gradient-to-br", BAND_GRADIENT[team.tone] ?? BAND_GRADIENT.primary)} aria-hidden />
      <TeamMark name={team.name} tone={team.tone} size={44} className="absolute left-3 top-[1.625rem] rounded-xl bg-surface ring-2 ring-surface" />
      <div className="px-3.5 pb-3 pt-6">
        <Link href={teamLink(team.id)} className="block after:absolute after:inset-0" data-team-open-spaces>
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-display text-h3 font-bold leading-tight text-text">{team.name}</span>
            {preview.length > 0 && (
              <span className="flex shrink-0 items-center" data-team-avatars>
                {preview.map((person) => (
                  <span key={person.userId} className="-ml-1.5 rounded-full ring-2 ring-surface first:ml-0">
                    <Avatar src={person.avatarUrl} alt={person.displayName || person.username} size={24} />
                  </span>
                ))}
                {more > 0 && <span className="ml-1.5 text-caption font-bold text-text-muted">+{more}</span>}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-small text-text-secondary">
            {t(roleLabelKey(team.myRole))} · {t("tm.card.members", { count: team.memberCount })} · {t("tp.header.projects", { count: team.spaceCount })}
          </span>
        </Link>
        <div className="relative z-10 mt-2.5 flex items-center gap-2">
          {approvals > 0 && (
            <Link href={teamLink(team.id, "projects")} className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 text-caption font-bold text-white" data-team-chip="approvals">
              {t("tm.home.pendingApprovals", { count: approvals })}
            </Link>
          )}
          {team.unreadCount > 0 && (
            <Link href={teamLink(team.id, "chat")} className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 text-caption font-bold text-white" data-team-open-chat data-team-chip="unread">
              {t("tm.home.unreadMessages", { count: team.unreadCount })}
            </Link>
          )}
          <span className="flex-1" />
          <Link href={teamLink(team.id)} className={team.unreadCount > 0 || approvals > 0 ? PHONE_HOME_PILL : PHONE_HOME_PILL_OUTLINE}>
            {t("tm.home.open")}
          </Link>
        </div>
      </div>
    </li>
  );
}

function TeamCard({ team }: { team: TeamSummary }) {
  const { t, language } = useTranslation();
  const preview = team.membersPreview ?? [];
  const more = Math.max(0, team.memberCount - preview.length);
  return (
    <li data-team-card={team.id} className="relative overflow-hidden rounded-2xl border border-border-soft bg-surface transition-colors duration-200 ease-soft hover:border-border-strong">
      <div className={cn("h-16 max-md:hidden", CARD_BAND[team.tone] ?? CARD_BAND.primary)} aria-hidden />
      <div className="flex items-center gap-3 p-3 md:block md:p-4 md:pt-0">
        <Link href={teamLink(team.id)} className="flex min-w-0 flex-1 items-center gap-3 after:absolute after:inset-0 md:block md:flex-none" data-team-open-spaces>
          <TeamMark name={team.name} tone={team.tone} size={48} solid className="rounded-xl ring-2 ring-surface md:-mt-6 md:mb-2 max-md:!h-[52px] max-md:!w-[52px]" />
          <span className="min-w-0 flex-1 md:block">
            <span className="block truncate font-display text-[1.125rem] font-bold leading-tight text-text">{team.name}</span>
            <span className="mt-0.5 block text-small text-text-secondary">
              {t("tm.card.members", { count: team.memberCount })} · {t("tp.header.projects", { count: team.spaceCount })}
            </span>
            {team.recent && <span className="mt-1.5 line-clamp-3 block text-small text-text-muted">{recentLine(t, language, team.recent)}</span>}
          </span>
        </Link>
        <div className="relative z-10 flex items-center gap-2 md:mt-3">
          {preview.length > 0 && (
            <span className="flex items-center max-md:hidden" data-team-avatars>
              {preview.map((person) => (
                <span key={person.userId} className="-ml-1.5 rounded-full ring-2 ring-surface first:ml-0">
                  <Avatar src={person.avatarUrl} alt={person.displayName || person.username} size={26} />
                </span>
              ))}
              {more > 0 && <span className="ml-2 text-small text-text-muted">+{more}</span>}
            </span>
          )}
          <span className="flex-1" />
          <Link href={teamLink(team.id, "chat")} data-team-open-chat aria-label={t("tm.card.openChat")} className="inline-flex items-center gap-1.5 rounded-full p-1.5 text-text-secondary hover:bg-surface-soft">
            <MessageCircle size={17} aria-hidden className="max-md:hidden" />
            {team.unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-secondary px-1.5 text-caption font-bold text-white">{team.unreadCount}</span>}
          </Link>
        </div>
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
