"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen } from "@/components/icons/folder-open";
import { Plus } from "@/components/icons/plus";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DescriptionField, FormError, SubmitButton, TitleField } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchRecentActivity, type TeamActivity } from "@/lib/supabase/team-center";
import { createProject, listProjects, updateProject, type ProjectAccessEntry, type ProjectAccessMode, type ProjectSummary } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { boardItemHref, groupBoard } from "@/lib/team-center";
import { projectLink } from "@/lib/team-projects";
import { teamLink } from "@/lib/teams";
import { cn, formatRelativeTime } from "@/lib/utils";
import { ProjectAccessEditor } from "./project-access-editor";
import { ProjectRoleChip } from "./project-ui";
import { useTeamChannelList } from "./team-chat-data";
import type { TeamCtx } from "./team-page";
import { HUB_CARD_CHIP_CLASS, HubCard } from "@/features/hub/hub-kit";
import { listTeamMembers, type TeamMember } from "@/lib/supabase/teams";
import { SectionError, Switch, roleLabelKey, toneClass } from "./team-ui";
import { ChoiceGroup } from "@/components/ui/choice-group";

const KIND_KEY: Record<string, TranslationKey> = {
  image: "tp.kind.image",
  prompt: "tp.kind.prompt",
  note: "tp.kind.note",
  palette: "tp.kind.palette",
  content: "tp.kind.content",
};

/**
 * Genel bakış (`tab=projects`; docs/history/366-*, mockup B1): "Senden bekleyenler" şeridi, proje kartları (en çok 50), sağda Son etkinlik ve Kanallar.
 * Proje = ekibin çalışma alanı (Space DEĞİL): dosyalar, panolar, değişkenler ve proje sohbeti taşır. Yalnız erişimi olan projeler listelenir;
 * "Yeni proje" `create_spaces` yeteneği ister.
 */
export function TeamProjectsSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, can, board } = ctx;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    void listProjects(team.id).then(
      (list) => {
        setFailed(false);
        setProjects(list);
      },
      () => setFailed(true),
    );
  }, [team.id]);
  useEffect(() => {
    load();
  }, [load]);

  const active = (projects ?? []).filter((project) => !project.archivedAt);
  const archived = (projects ?? []).filter((project) => project.archivedAt);
  const canCreate = can("create_spaces") && team.myRole !== "guest";
  const changesByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of board?.items ?? []) if (item.state === "changes" && item.mine) map.set(item.projectId, (map.get(item.projectId) ?? 0) + 1);
    return map;
  }, [board]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_var(--aside-w)]" data-testid="team-projects">
      <section className="min-w-0 space-y-4 md:space-y-5">
        <WaitingStrip ctx={ctx} />

        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-h3 font-semibold text-text md:text-h2 md:font-bold">
            {t("tp.list.title")} <span className="text-body font-normal text-text-muted">· {active.length}</span>
          </h2>
          {archived.length > 0 && (
            <button type="button" onClick={() => setShowArchived((open) => !open)} aria-pressed={showArchived} className="text-small text-text-muted hover:text-text max-md:hidden" data-projects-archived-toggle>
              {t("tp.list.archived")}
            </button>
          )}
          {canCreate && (
            <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-team-new-project>
              <Plus size={16} aria-hidden />
              {t("tp.list.new")}
            </Button>
          )}
        </div>

        {failed && <SectionError message={t("tp.error.load")} onRetry={load} />}
        {!failed && projects === null && (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        )}
        {projects !== null && active.length === 0 && archived.length === 0 && (
          <EmptyState scene="team"
            icon={FolderOpen}
            title={t("tp.list.empty")}
            description={t(canCreate ? "tp.list.emptyBody" : "tp.list.emptyMember")}
            action={canCreate ? { label: t("tp.list.new"), onClick: () => setCreateOpen(true) } : undefined}
          />
        )}
        {active.length > 0 && (
          <ul className={PROJECT_GRID_CLASS} data-testid="team-project-list">
            {active.map((project) => (
              <ProjectCard key={project.id} team={team.id} project={project} changes={changesByProject.get(project.id) ?? 0} />
            ))}
          </ul>
        )}
        {archived.length > 0 && (showArchived || active.length === 0) && (
          <div className="space-y-2" data-testid="team-projects-archived">
            <h3 className="text-small font-semibold text-text-muted">{t("tp.list.archived")}</h3>
            <ul className={PROJECT_GRID_CLASS}>
              {archived.map((project) => (
                <ProjectCard key={project.id} team={team.id} project={project} changes={0} />
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="min-w-0 space-y-4 max-lg:hidden" data-testid="team-overview-aside">
        <MembersCard ctx={ctx} />
        <ActivityCard ctx={ctx} />
      </aside>

      {createOpen && (
        <CreateProjectDialog
          teamId={team.id}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Proje kartlarının ızgarası (mockup): telefonda 1, tablette 2, masaüstünde (yan sütunla birlikte) 3 sütun. */
const PROJECT_GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3";

/** Şeritteki tek kart (mockup): nokta + başlık/alt satır + küçük «Aç» düğmesi. */
function StripCard({ href, title, sub, primary, testId, itemId }: { href: string; title: string; sub: string; primary: boolean; testId?: string; itemId?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg card-flat px-4 py-3" data-strip-card={testId} data-waiting-item={itemId}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-heart" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-semibold text-text">{title}</span>
        <span className="block truncate text-caption text-text-secondary">{sub}</span>
      </span>
      <Link href={href} className={buttonClassName({ size: "sm", variant: primary ? "primary" : "outline", className: "shrink-0 px-3" })} data-waiting-open={testId === "waiting" ? "" : undefined}>
        {t("tc.over.open")}
      </Link>
    </div>
  );
}

/**
 * "Senden bekleyenler" şeridi (mockup, Ekip · Genel bakış): bekleyen ilk karar ya da değişiklik istenen öğe tek kartta (başlık · proje/dosya · «Aç»),
 * `md+`'da yanında okunmamış kanal kartı («# duyurular · 4 okunmamış» · Ekip sohbeti · «Aç»). Telefonda yalnız ilk kart ve üstünde küçük başlık.
 * Yalnız dolu olduğunda çizilir.
 */
function WaitingStrip({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, board } = ctx;
  const columns = useMemo(() => groupBoard(board?.items ?? []), [board]);
  const { channels } = useTeamChannelList(team.id);
  const pending = columns[0].rows.filter((item) => item.canDecide);
  const changes = columns[1].rows.filter((item) => item.mine);
  const rows = pending.length > 0 ? pending : changes;
  const proposals = board?.proposals.length ?? 0;
  const count = rows.length + (pending.length > 0 ? proposals : 0);
  const unread = channels.find((channel) => channel.mode !== "project" && channel.unreadCount > 0 && !channel.muted);
  if (count === 0 && !unread) return null;
  const first = rows[0];
  const heading = pending.length > 0 || proposals > 0 ? t("tc.over.waiting") : t("tc.over.changesWaiting");
  const itemTitle = first ? first.title || t(KIND_KEY[first.kind] ?? "tp.kind.content") : "";
  return (
    <section data-testid="team-waiting" className="space-y-2">
      <h3 className="text-caption font-semibold text-text-secondary max-md:block md:sr-only">{heading}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {count > 0 && (
          <StripCard
            testId="waiting"
            itemId={first?.id}
            primary
            href={first ? boardItemHref(team.id, first) : teamLink(team.id, "approvals")}
            title={first ? t(pending.length > 0 ? "tc.over.itemAwaiting" : "tc.over.itemChanges", { title: itemTitle }) : t("tc.over.waitingPhone", { count })}
            sub={[first?.fileTitle, count > 1 ? t("tc.over.moreWaiting", { count: count - 1 }) : null].filter(Boolean).join(" · ") || t("tc.tab.approvals")}
          />
        )}
        {unread && (
          <div className="max-md:hidden">
            <StripCard testId="chat" primary={false} href={teamLink(team.id, "chat", { channel: unread.name })} title={t("tc.over.unreadLine", { name: unread.name, count: unread.unreadCount })} sub={t("tc.over.chatSub")} />
          </div>
        )}
      </div>
    </section>
  );
}

const ACTIVITY_KEY: Record<TeamActivity["kind"], TranslationKey> = {
  added: "tc.activity.added",
  approved: "tc.activity.approved",
  changes: "tc.activity.changes",
  file: "tc.activity.file",
  joined: "tc.activity.joined",
};

/** Son etkinlik (mockup B1): ekibin son hareketleri; kişi yalnız rolü olduğu projelerin etkinliğini görür (sunucu). */
function ActivityCard({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { team } = ctx;
  const [rows, setRows] = useState<TeamActivity[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchRecentActivity(team.id, 6).then(
      (list) => alive && setRows(list),
      () => alive && setRows([]),
    );
    return () => {
      alive = false;
    };
  }, [team.id]);
  return (
    <section className="rounded-lg card-flat p-4" data-testid="team-activity">
      <h3 className="mb-1 font-display text-body font-bold text-text">{t("tc.over.activity")}</h3>
      {rows === null && <Skeleton className="h-24 rounded-lg" />}
      {rows !== null && rows.length === 0 && <p className="py-3 text-small text-text-muted">{t("tc.over.activityEmpty")}</p>}
      <ul>
        {(rows ?? []).map((row, index) => (
          <li key={`${row.kind}-${row.at}-${index}`} className="border-t border-border-soft py-2 text-small first:border-t-0" data-activity={row.kind}>
            <span className="font-semibold text-text">{row.actorName ?? t("tc.activity.someone")}</span> <span className="text-text">{t(ACTIVITY_KEY[row.kind], { title: row.title ?? "" })}</span>
            <span className="block text-caption text-text-muted">
              {formatRelativeTime(row.at, language)}
              {row.projectTitle ? ` · ${row.fileTitle ?? row.projectTitle}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Üyeler (mockup, `lg+` yan sütun): ilk üç üye (avatar · ad · rol) ve «+ N üye»; dokununca Üyeler sekmesi. */
function MembersCard({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team } = ctx;
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  useEffect(() => {
    let alive = true;
    void listTeamMembers(team.id, "", null, 0).then(
      (page) => alive && setMembers(page.items),
      () => alive && setMembers([]),
    );
    return () => {
      alive = false;
    };
  }, [team.id]);
  if (team.myRole === "guest" || (members !== null && members.length === 0)) return null;
  const shown = (members ?? []).slice(0, 3);
  const more = Math.max(0, team.memberCount - shown.length);
  return (
    <section className="rounded-lg card-flat p-4" data-testid="team-overview-members">
      <h3 className="mb-2 font-display text-body font-bold text-text">{t("tc.over.members", { count: team.memberCount })}</h3>
      {members === null && <Skeleton className="h-20 rounded-lg" />}
      <ul className="space-y-2">
        {shown.map((member) => (
          <li key={member.userId} className="flex items-center gap-2">
            <Avatar src={member.avatarUrl} alt="" size={24} />
            <span className="min-w-0 flex-1 truncate text-small text-text">{member.displayName || member.username}</span>
            <span className={cn("shrink-0 rounded-xs px-2 py-0.5 text-caption font-semibold", member.role === "owner" ? "bg-primary-soft text-primary-text" : "bg-surface-soft text-text-secondary")}>{t(roleLabelKey(member.role))}</span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link href={teamLink(team.id, "members")} className="mt-3 block text-caption text-text-secondary hover:text-text">
          {t("tc.over.moreMembers", { count: more })}
        </Link>
      )}
    </section>
  );
}

/** Proje kartı (mockup, Hub kartı): 16:9 kapak (projenin tonunda) + «Proje» etiketi, başlık, tek satır açıklama; alt satırda sayılar ve durum/rol etiketi. */
function ProjectCard({ team, project, changes }: { team: string; project: ProjectSummary; changes: number }) {
  const { t } = useTranslation();
  const lead = project.myRole === "lead";
  const pending = lead ? (project.pendingCount ?? 0) : 0;
  return (
    <HubCard
      href={projectLink(team, project.id)}
      data-project-card={project.id}
      className={project.archivedAt ? "opacity-70" : undefined}
      title={project.title}
      description={project.description?.trim() || undefined}
      cover={
        <span aria-hidden className={cn("absolute inset-0 grid grid-cols-4 items-center gap-2 p-3", toneClass(project.tone))}>
          <span className="h-3/4 rounded-lg bg-current" />
          <span className="h-3/4 rounded-lg bg-surface" />
          <span className="h-3/4 rounded-lg bg-surface/60" />
          <span className="h-3/4 rounded-lg bg-current opacity-45" />
        </span>
      }
      chip={<span className={HUB_CARD_CHIP_CLASS}>{t("tc.over.projectChip")}</span>}
      badge={project.myRole ? <ProjectRoleChip role={project.myRole} /> : undefined}
      footerStart={<span className="truncate">{t("tp.card.counts", { files: project.files.length, boards: project.boardCount, people: project.memberCount })}</span>}
      footerEnd={
        <>
          {project.archivedAt && <span className="inline-flex h-6 items-center rounded-xs bg-surface-soft px-2.5 text-caption font-semibold text-text-muted">{t("tp.card.archived")}</span>}
          {pending > 0 && (
            <span className="inline-flex h-6 items-center rounded-xs bg-primary-soft px-2.5 text-caption font-semibold text-primary-text" data-project-pending={pending}>
              {t("tp.card.pending", { count: pending })}
            </span>
          )}
          {changes > 0 && <span className="inline-flex h-6 items-center rounded-xs bg-danger-soft px-2.5 text-caption font-semibold text-danger">{t("tc.over.changesChip", { count: changes })}</span>}
        </>
      }
    />
  );
}

function CreateProjectDialog({ teamId, onClose, onCreated }: { teamId: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<ProjectAccessMode>("selected");
  const [baseRole, setBaseRole] = useState<"view" | "edit">("view");
  const [entries, setEntries] = useState<ProjectAccessEntry[]>([]);
  const [review, setReview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("tp.error.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createProject(teamId, { title: title.trim(), description: description.trim(), mode, baseRole, entries });
      // Onay varsayılanı projeyi açan kişi lider olduğu için ayrı çağrıyla yazılır (yalnız kapatılıyorsa).
      if (!review) await updateProject(id, { reviewDefault: false }).catch(() => undefined);
      onCreated();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return (
    <SpaceDialog
      title={t("tp.create.title")}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={(event) => void submit(event)}
      formTestId="team-create-project-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("tp.create.submit")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} autoFocus label={t("tp.name.project")} placeholder={t("tp.name.projectPlaceholder")} />
        <DescriptionField value={description} onChange={setDescription} />
        <div>
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.create.whoSees")}</span>
          <ChoiceGroup
            ariaLabel={t("tp.create.whoSees")}
            variant="segmented"
            showHint
            value={mode}
            onChange={setMode}
            options={[
              { key: "selected", label: t("tp.access.mode.selected"), hint: t("tp.access.mode.selectedHint") },
              { key: "all", label: t("tp.access.mode.all"), hint: t("tp.access.mode.allHint") },
            ]}
          />
          {mode === "all" && (
            <div className="mt-3">
              <span className="mb-1.5 block text-caption font-semibold text-text-secondary">{t("tp.access.baseRole")}</span>
              <ChoiceGroup
                ariaLabel={t("tp.access.baseRole")}
                variant="segmented"
                value={baseRole}
                onChange={setBaseRole}
                options={[
                  { key: "view", label: t("tp.role.view") },
                  { key: "edit", label: t("tp.role.edit") },
                ]}
              />
            </div>
          )}
        </div>
        <ProjectAccessEditor teamId={teamId} entries={entries} onChange={setEntries} lockedUserId={user?.id ?? null} />
        <div className="flex items-start gap-3 rounded-xl border border-border-soft px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-small font-semibold text-text">{t("tp.create.reviewDefault")}</span>
            <span className="block text-caption text-text-secondary">{t("tp.create.reviewDefaultHint")}</span>
          </span>
          <Switch checked={review} onChange={setReview} label={t("tp.create.reviewDefault")} />
        </div>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
