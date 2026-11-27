"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase } from "@/components/icons/briefcase";
import { Check } from "@/components/icons/check";
import { Eye } from "@/components/icons/eye";
import { Mail } from "@/components/icons/mail";
import { MessageCircle } from "@/components/icons/message-circle";
import { Plus } from "@/components/icons/plus";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldLabelClassName, Input } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { HUB_CARD_ACTION_CLASS, HUB_CARD_BADGE_CLASS, HUB_CARD_CHIP_CLASS, HUB_CARD_BODY_CLASS, HUB_CARD_COVER_CLASS, HUB_GRID_CLASS, HUB_PAGE_CLASS, HubAttentionStrip, HubBand, HubCard, HubCardSkeleton, HubControls, HubCreateButton, HubFilterChip, HubGrid } from "@/features/hub/hub-kit";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useToast } from "@/features/groups/use-toast";
import { PHONE_HOME_BOTTOM_PAD, PhoneHomeSection } from "@/features/content/phone-home";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useCreateEntry, useOpenCreateFromQuery } from "@/features/content/create-page-shell";
import { useMediaQuery } from "@/lib/use-media-query";
import { LanguageTermScope, useTranslation } from "@/lib/i18n/language-provider";
import { rewriteAreaTerms } from "@/lib/team-area-terms";
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
import { TeamMark, TeamToneSwatches, roleLabelKey } from "./team-ui";
import { ProjectMini } from "./team-phone-home";
import { BAND_TONE } from "./team-band";

/**
 * `/teams`: Ekipler (docs/history/353-*). Ekip artık topluluktan bağımsız bir sistemdir: bu sayfa üyesi olduğum ekiplerin günlük kapısı —
 * bekleyen davetler, "senden bekleyenler" (onaylar, okunmamış kanallar), ekip kartları ve "Ekip oluştur".
 */
function TeamsPageInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { node: toastNode, show } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = useCreateEntry("/teams/new", () => setCreateOpen(true));
  useOpenCreateFromQuery(() => setCreateOpen(true));
  const [managedOnly, setManagedOnly] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
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
  // Arama yüklenmiş listeyi ada göre süzer: aranırken kalan sayfalar da yüklenir ki sonraki sayfadaki ekip kaçmasın.
  const { hasMore: moreTeams, loadingMore: loadingMoreTeams, loadMore: loadMoreTeams } = list;
  useEffect(() => {
    if (needle && moreTeams && !loadingMoreTeams) void loadMoreTeams();
  }, [needle, moreTeams, loadingMoreTeams, loadMoreTeams]);
  // "Yalnız yeni": okunmamış sohbeti ya da onayını bekleyen işi olan ekipler.
  const visibleTeams = list.items.filter(
    (team) =>
      (!managedOnly || team.myRole === "owner" || team.myRole === "admin") &&
      (!onlyNew || team.unreadCount > 0 || (approvalsByTeam.get(team.id) ?? 0) > 0) &&
      (!needle || team.name.toLocaleLowerCase().includes(needle)),
  );

  // Hub düzeni (Stil 2, docs/history/474-*): sekmeler Ekiplerim · Davetler · Senden bekleyenler (son ikisi yalnız bekleyen varken, sayaçlı); dikkat şeridi sekmeye götürür.
  // Bekleyen iş sayısı: her kalemin kendi sayısı (ör. "2 öğe onayını bekliyor") toplanır.
  const todoTotal = todos.reduce((sum, todo) => sum + Math.max(1, todo.n), 0);
  const [tab, setTab] = useState<"teams" | "invites" | "todos">("teams");
  const activeTab = tab === "todos" && todos.length === 0 ? "teams" : tab === "invites" && invites.length === 0 ? "teams" : tab;
  const tabItems: TabItem<"teams" | "invites" | "todos">[] = [
    { key: "teams", label: t("tm.home.myTeams") },
    ...(invites.length > 0 ? [{ key: "invites" as const, label: t("tm.home.invitesTab"), count: invites.length }] : []),
    ...(todos.length > 0 ? [{ key: "todos" as const, label: t("tm.todos.title"), count: todoTotal }] : []),
  ];

  return (
    <div className={cn(HUB_PAGE_CLASS, PHONE_HOME_BOTTOM_PAD, "md:pb-16")} data-testid="teams-page">
      <HubBand
        title={t("tm.title")}
        description={t("hub.teams.intro")}
        action={<HubCreateButton label={t("tm.create")} onClick={openCreate} attr={{ "data-team-create": true, "data-team-create-phone": true }} />}
      />

      {tabItems.length > 1 && <Tabs variant="hub" items={tabItems} active={activeTab} onChange={setTab} ariaLabel={t("tm.filter.aria")} />}

      {activeTab === "teams" && (
        <>
          <HubControls
            count={t("hub.count.teams", { count: `${visibleTeams.length}${list.hasMore ? "+" : ""}` })}
            query={query}
            onQuery={setQuery}
            label={t("tm.filter.search")}
          >
            <HubFilterChip selected={onlyNew} onClick={() => setOnlyNew((value) => !value)} data-hub-only-new="">
              {t("hub.filter.onlyNew")}
            </HubFilterChip>
            <HubFilterChip selected={managedOnly} onClick={() => setManagedOnly((value) => !value)} data-team-filter-managed="">
              {t("tm.filter.managed")}
            </HubFilterChip>
          </HubControls>
          {invites.length > 0 && (
            <div className="mb-4">
              <HubAttentionStrip icon={Mail} actionLabel={t("tm.home.open")} onAction={() => setTab("invites")} testId="team-invites-strip">
                {t("hub.teams.invitesAttn", { count: invites.length })}
              </HubAttentionStrip>
            </div>
          )}
          {todos.length > 0 && (
            <div className="mb-4">
              <HubAttentionStrip icon={Check} actionLabel={t("tm.home.open")} onAction={() => setTab("todos")} testId="team-todos-strip">
                {t("hub.teams.attn", { count: todoTotal })}
              </HubAttentionStrip>
            </div>
          )}
        </>
      )}

      {/* Bekleyen davetler kart kart (kabul/reddet doğrudan kartta). */}
      {activeTab === "invites" && invites.length > 0 && (
        <HubGrid data-testid="team-invites">
          {invites.map((invite) => (
            <InviteCard key={invite.id} invite={invite} onAnswer={(accept) => void answer(invite, accept)} />
          ))}
        </HubGrid>
      )}

      {activeTab === "todos" && todos.length > 0 && <TodoList todos={todos} />}

      {activeTab === "teams" && (
        <PagedListState
          list={list}
          skeleton={
            <ul className={HUB_GRID_CLASS}>
              {Array.from({ length: 3 }, (_, index) => (
                <HubCardSkeleton key={index} />
              ))}
            </ul>
          }
        >
          {list.items.length === 0 && !list.failed ? (
            <EmptyState icon={Briefcase} scene="team" title={t("tm.empty.title")} description={t("tm.empty.body")} action={{ label: t("tm.create"), onClick: openCreate }} />
          ) : (
            <HubGrid data-testid="teams-list">
              {visibleTeams.map((team) => (
                <TeamCard key={team.id} team={team} approvals={approvalsByTeam.get(team.id) ?? 0} />
              ))}
              <li className="max-md:hidden">
                <button
                  type="button"
                  onClick={openCreate}
                  data-team-new-card
                  className="flex h-full w-full flex-col rounded-lg border-2 border-dashed border-border text-center transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className={cn("grid w-full place-items-center", HUB_CARD_COVER_CLASS)}>
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary-text">
                      <Plus size={20} aria-hidden />
                    </span>
                  </span>
                  <span className={cn(HUB_CARD_BODY_CLASS, "flex flex-col items-center justify-start gap-0.5 px-5 pt-3")}>
                    <span className="text-body font-semibold text-text">{t("tm.card.new")}</span>
                    <span className="text-small text-text-secondary">{t("tm.card.newHint")}</span>
                  </span>
                </button>
              </li>
            </HubGrid>
          )}
        </PagedListState>
      )}

      {phone && activeTab === "teams" && recentProjects.length > 0 && (
        <PhoneHomeSection title={t("tp.home.recent")} testId="teams-phone-projects">
          <ul className="grid grid-cols-2 gap-2">
            {recentProjects.map(({ project, teamId, teamName }) => (
              <ProjectMini key={project.id} teamId={teamId} project={project} sub={teamName} />
            ))}
          </ul>
        </PhoneHomeSection>
      )}

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
    part === "\u0001" ? <strong key={index} className="font-semibold text-text">{inviter}</strong> : part === "\u0002" ? <strong key={index} className="font-semibold text-text">{team}</strong> : <span key={index}>{part}</span>,
  );
}

function TodoList({ todos }: { todos: TeamTodo[] }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("tm.todos.title")} data-testid="team-todos">
      <HubGrid>
        {todos.map((todo, index) => {
          const Icon = todo.kind === "unread" ? MessageCircle : todo.kind === "project_review" ? Eye : Check;
          const tone = todo.kind === "unread" ? "bg-success-soft text-success" : todo.kind === "project_review" ? "bg-primary-soft text-primary-text" : "bg-warning-soft text-warning";
          const action = t(todo.kind === "unread" ? "tm.todos.openChat" : "tm.todos.review.action");
          return (
            <HubCard
              key={`${todo.teamId}-${todo.kind}-${index}`}
              href={todo.href}
              title={todo.teamName}
              description={todoTitle(t, todo)}
              cover={
                <span aria-hidden className={cn("absolute inset-0 grid place-items-center", tone)}>
                  <Icon size={40} />
                </span>
              }
              chip={<span className={HUB_CARD_CHIP_CLASS}>{t(todo.kind === "unread" ? "tm.todos.kind.chat" : "tm.todos.kind.approval")}</span>}
              footerStart={todo.n > 0 ? t("hub.badge.newCount", { count: todo.n }) : undefined}
              footerEnd={
                <Link href={todo.href} className={buttonClassName({ size: "sm", className: HUB_CARD_ACTION_CLASS })}>
                  {action}
                </Link>
              }
            />
          );
        })}
      </HubGrid>
    </section>
  );
}

/** Bekleyen davet kartı (Stil 2): ekip renginde kapak, davet eden + rol + zaman tek satırda, kartta Kabul et / Reddet. */
function InviteCard({ invite, onAnswer }: { invite: TeamInvitation; onAnswer: (accept: boolean) => void }) {
  const { t, language } = useTranslation();
  return (
    <HubCard
      data-team-invite={invite.id}
      title={invite.teamName}
      description={
        <>
          {richParts(t("tm.invite.line", { inviter: "\u0001", team: "\u0002" }), invite.inviterName, invite.teamName)}
          <span> · {t("tm.invite.asRole", { role: t(roleLabelKey(invite.role)) })}</span>
          {invite.role === "guest" && invite.guestDays ? <span> · {t("tm.invite.guestDays", { count: invite.guestDays })}</span> : null}
        </>
      }
      cover={
        <span aria-hidden className={cn("absolute inset-0 grid place-items-center", CARD_BAND[invite.teamTone] ?? CARD_BAND.primary)}>
          <TeamMark name={invite.teamName} tone={invite.teamTone} size={64} solid className="rounded-lg ring-2 ring-surface" />
        </span>
      }
      chip={<span className={HUB_CARD_CHIP_CLASS}>{t("tm.home.invitesTab")}</span>}
      footerStart={formatRelativeTime(invite.createdAt, language)}
      footerEnd={
        <>
          <Button type="button" size="sm" variant="outline" className={HUB_CARD_ACTION_CLASS} onClick={() => onAnswer(false)}>
            {t("tm.invite.decline")}
          </Button>
          <Button type="button" size="sm" className={HUB_CARD_ACTION_CLASS} onClick={() => onAnswer(true)} data-invite-accept>
            {t("tm.invite.accept")}
          </Button>
        </>
      }
    />
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

const CARD_BAND: Record<string, string> = BAND_TONE;

/** Kartın son etkinlik cümlesi (yalnız herkese açık olay türleri, bkz. `my_teams_preview`). */
function recentLine(t: ReturnType<typeof useTranslation>["t"], language: string, recent: NonNullable<TeamSummary["recent"]>): string {
  const who = (recent.actorName ?? "").split(" ")[0];
  const when = formatRelativeTime(recent.at, language as "tr" | "en");
  if (recent.action === "item_approved") return t("tm.card.recent.approved", { name: who, title: recent.label ?? "", time: when });
  if (recent.action === "variable_updated") return t("tm.card.recent.variables", { name: who, time: when });
  return t("tm.card.recent.joined", { name: who, time: when });
}

/**
 * Ekip kartı (Stil 2, docs/history/474-*): ekip renginde kapak + büyük im, sol üstte rol etiketi, sağ üstte bekleyen onay / okunmamış sohbet rozeti;
 * gövdede ad, açıklama (yoksa son etkinlik), "N üye · N proje" ve sohbet kısayolu + tek "Aç" düğmesi.
 */
function TeamCard({ team, approvals }: { team: TeamSummary; approvals: number }) {
  const { t, language } = useTranslation();
  return (
    <HubCard
      data-team-card={team.id}
      href={teamLink(team.id)}
      title={<span data-team-open-spaces>{team.name}</span>}
      description={team.description || (team.recent ? recentLine(t, language, team.recent) : undefined)}
      cover={
        <span aria-hidden className={cn("absolute inset-0 grid place-items-center", CARD_BAND[team.tone] ?? CARD_BAND.primary)}>
          <TeamMark name={team.name} tone={team.tone} size={64} solid className="rounded-lg ring-2 ring-surface" />
        </span>
      }
      chip={<span className={HUB_CARD_CHIP_CLASS}>{t(roleLabelKey(team.myRole))}</span>}
      badge={
        <>
          {approvals > 0 && (
            <Link href={teamLink(team.id, "projects")} className={cn(HUB_CARD_BADGE_CLASS, "tap-area")} data-team-chip="approvals">
              {t("tm.home.pendingApprovals", { count: approvals })}
            </Link>
          )}
          {team.unreadCount > 0 && (
            <Link href={teamLink(team.id, "chat")} className={cn(HUB_CARD_BADGE_CLASS, "tap-area")} data-team-chip="unread">
              {t("hub.badge.newCount", { count: team.unreadCount })}
            </Link>
          )}
        </>
      }
      footerStart={`${t("tm.card.members", { count: team.memberCount })} · ${t("tp.header.projects", { count: team.spaceCount })}`}
      footerEnd={
        <>
          <Link
            href={teamLink(team.id, "chat")}
            data-team-open-chat
            aria-label={t("tm.card.openChat")}
            className="tap-area inline-flex items-center gap-1.5 rounded-sm p-1.5 text-text-secondary hover:bg-surface-soft"
          >
            <MessageCircle size={16} aria-hidden />
          </Link>
          <Link href={teamLink(team.id)} className={buttonClassName({ size: "sm", className: HUB_CARD_ACTION_CLASS })} data-team-open="">
            {t("hub.open")}
          </Link>
        </>
      }
    />
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
    <SpaceDialog page
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
          <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="team-desc" className={fieldLabelClassName}>
            {t("tm.create.description")}
          </label>
          <textarea id="team-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className="w-full rounded-sm card-inset px-4 py-2.5 text-small" />
        </div>
        <div>
          <span className={fieldLabelClassName}>{t("tm.create.tone")}</span>
          <TeamToneSwatches value={tone} onChange={setTone} name={name} />
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

/** Ekipte "Space" kavramı yoktur: Space motorundan gelen ortak metinler (formlar, hatalar) "alan" der (docs/history/370-*). */
export function TeamsPage() {
  return (
    <LanguageTermScope rewrite={rewriteAreaTerms}>
      <TeamsPageInner />
    </LanguageTermScope>
  );
}
