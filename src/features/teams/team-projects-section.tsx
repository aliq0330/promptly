"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen } from "@/components/icons/folder-open";
import { Plus } from "@/components/icons/plus";
import { Button } from "@/components/ui/button";
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
import { PillChoice, SectionError, Switch, toneClass } from "./team-ui";

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18.75rem]" data-testid="team-projects">
      <section className="min-w-0 space-y-4 md:space-y-5">
        <WaitingStrip ctx={ctx} />

        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 font-display text-h2 font-bold text-text">
            {t("tp.list.title")} <span className="font-sans text-body font-normal text-text-muted">· {active.length}</span>
          </h2>
          {archived.length > 0 && (
            <button type="button" onClick={() => setShowArchived((open) => !open)} aria-pressed={showArchived} className="text-small text-text-muted hover:text-text max-md:hidden" data-projects-archived-toggle>
              {t("tp.list.archived")}
            </button>
          )}
          {canCreate && (
            <Button type="button" onClick={() => setCreateOpen(true)} data-team-new-project>
              <Plus size={16} aria-hidden />
              {t("tp.list.new")}
            </Button>
          )}
        </div>

        {failed && <SectionError message={t("tp.error.load")} onRetry={load} />}
        {!failed && projects === null && (
          <div className="grid gap-3.5 md:grid-cols-2">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        )}
        {projects !== null && active.length === 0 && archived.length === 0 && (
          <EmptyState
            icon={FolderOpen}
            title={t("tp.list.empty")}
            description={t(canCreate ? "tp.list.emptyBody" : "tp.list.emptyMember")}
            action={canCreate ? { label: t("tp.list.new"), onClick: () => setCreateOpen(true) } : undefined}
          />
        )}
        {active.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2 md:gap-3.5" data-testid="team-project-list">
            {active.map((project) => (
              <li key={project.id}>
                <ProjectCard team={team.id} project={project} changes={changesByProject.get(project.id) ?? 0} />
              </li>
            ))}
          </ul>
        )}
        {archived.length > 0 && (showArchived || active.length === 0) && (
          <div className="space-y-2" data-testid="team-projects-archived">
            <h3 className="text-small font-semibold text-text-muted">{t("tp.list.archived")}</h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {archived.map((project) => (
                <li key={project.id}>
                  <ProjectCard team={team.id} project={project} changes={0} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="min-w-0 space-y-4 max-md:hidden" data-testid="team-overview-aside">
        <ActivityCard ctx={ctx} />
        <ChannelsCard ctx={ctx} />
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

/**
 * "Senden bekleyenler" şeridi (mockup B1): liderde bekleyen kararlar, diğerlerinde değişiklik istenen kendi öğeleri. Yalnız dolu olduğunda çizilir.
 * Masaüstünde sol kutu + üç kart, telefonda tek satır.
 */
function WaitingStrip({ ctx }: { ctx: TeamCtx }) {
  const { t, language } = useTranslation();
  const { team, board } = ctx;
  const columns = useMemo(() => groupBoard(board?.items ?? []), [board]);
  const pending = columns[0].rows.filter((item) => item.canDecide);
  const changes = columns[1].rows.filter((item) => item.mine);
  const rows = pending.length > 0 ? pending : changes;
  const proposals = board?.proposals.length ?? 0;
  const count = rows.length + (pending.length > 0 ? proposals : 0);
  if (count === 0) return null;
  const heading = pending.length > 0 || proposals > 0 ? t("tc.over.waiting") : t("tc.over.changesWaiting");
  const target = teamLink(team.id, "approvals");
  return (
    <section data-testid="team-waiting" className="rounded-2xl border border-border-soft bg-surface p-3 md:flex md:items-stretch md:gap-3 md:border-0 md:bg-transparent md:p-0">
      <Link href={target} className="flex min-h-12 items-center gap-2.5 md:block md:w-52 md:shrink-0 md:rounded-2xl md:border md:border-border-soft md:bg-surface md:p-3.5" data-waiting-open>
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-heart md:hidden" />
        <span className="min-w-0 flex-1 md:block">
          <span className="hidden items-center gap-2 font-display text-body font-bold text-text md:flex">
            <span aria-hidden className="h-2 w-2 rounded-full bg-heart" />
            {heading}
          </span>
          <span className="font-semibold text-text md:hidden">{t("tc.over.waitingPhone", { count })}</span>
          <span className="mt-2 hidden text-small font-semibold text-primary md:block">{t("tc.over.waitingOpen", { count })}</span>
        </span>
        <span className="text-small font-semibold text-primary md:hidden">{t("tc.over.open")}</span>
      </Link>
      <ul className="hidden min-w-0 flex-1 gap-3 md:grid md:grid-cols-3">
        {rows.slice(0, 3).map((item) => (
          <li key={item.id} className="min-w-0">
            <Link href={boardItemHref(team.id, item)} className="block h-full rounded-2xl border border-border-soft bg-surface p-3.5 hover:shadow-card" data-waiting-item={item.id}>
              <span className="block truncate text-caption font-bold uppercase tracking-[0.05em] text-text-muted">
                {t(KIND_KEY[item.kind] ?? "tp.kind.content")}
                {item.fileTitle ? ` · ${item.fileTitle}` : ""}
              </span>
              <span className="mt-0.5 block truncate text-body font-bold text-text">{item.title || t(KIND_KEY[item.kind] ?? "tp.kind.content")}</span>
              <span className="block truncate text-small text-text-secondary">
                {item.authorName ?? ""} · {formatRelativeTime(item.submittedAt ?? item.decidedAt ?? "", language)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
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
    <section className="rounded-2xl border border-border-soft bg-surface p-4" data-testid="team-activity">
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

/** Kanallar (mockup B1): açık kanallar, okunmamış sayılı; dokununca Sohbet sekmesi o kanalla açılır. */
function ChannelsCard({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team } = ctx;
  const { channels, loaded } = useTeamChannelList(team.id);
  const shown = channels.filter((channel) => channel.mode !== "project").slice(0, 5);
  if (loaded && shown.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border-soft bg-surface p-4" data-testid="team-overview-channels">
      <h3 className="mb-2 font-display text-body font-bold text-text">{t("tc.over.channels")}</h3>
      <ul>
        {shown.map((channel) => (
          <li key={channel.id}>
            <Link href={teamLink(team.id, "chat", { channel: channel.name })} className="flex items-center py-1.5 text-small text-text hover:text-primary" data-overview-channel={channel.name}>
              <span className="min-w-0 flex-1 truncate"># {channel.name}</span>
              {channel.unreadCount > 0 && !channel.muted && <span className="text-caption font-bold text-secondary">{t("tc.over.unread", { count: channel.unreadCount })}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Proje kartı (mockup B1): üstte projenin tonunda küçük kolaj, altta ad · sayılar · durum çipleri · rolüm. */
function ProjectCard({ team, project, changes }: { team: string; project: ProjectSummary; changes: number }) {
  const { t } = useTranslation();
  const lead = project.myRole === "lead";
  const pending = lead ? (project.pendingCount ?? 0) : 0;
  return (
    <Link
      href={projectLink(team, project.id)}
      className={cn("flex h-full overflow-hidden rounded-2xl border border-border-soft bg-surface transition-shadow hover:shadow-card-hover max-md:flex-row md:flex-col", project.archivedAt && "opacity-70")}
      data-project-card={project.id}
    >
      <span aria-hidden className={cn("grid shrink-0 grid-cols-2 gap-1.5 p-2.5 max-md:w-[5.25rem] md:h-[4.75rem] md:grid-cols-4", toneClass(project.tone))}>
        <span className="rounded-lg bg-current md:col-span-1" />
        <span className="rounded-lg bg-surface" />
        <span className="rounded-lg bg-surface/60" />
        <span className="rounded-lg bg-current opacity-45" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-2 p-3.5">
        <span className="block min-w-0">
          <span className="block truncate text-body font-bold text-text">{project.title}</span>
          <span className="block truncate text-small text-text-secondary">{t("tp.card.counts", { files: project.files.length, boards: project.boardCount, people: project.memberCount })}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {project.archivedAt && <span className="inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-caption font-semibold text-text-muted">{t("tp.card.archived")}</span>}
          {pending > 0 && (
            <span className="inline-flex h-6 items-center rounded-full bg-warning/10 px-2.5 text-caption font-bold text-warning" data-project-pending={pending}>
              {t("tp.card.pending", { count: pending })}
            </span>
          )}
          {changes > 0 && <span className="inline-flex h-6 items-center rounded-full bg-danger/10 px-2.5 text-caption font-bold text-danger">{t("tc.over.changesChip", { count: changes })}</span>}
          {project.myRole && <ProjectRoleChip role={project.myRole} />}
        </span>
      </span>
    </Link>
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
          <PillChoice
            ariaLabel={t("tp.create.whoSees")}
            value={mode}
            onChange={setMode}
            options={[
              { key: "selected", label: t("tp.access.mode.selected") },
              { key: "all", label: t("tp.access.mode.all") },
            ]}
          />
          <p className="mt-1.5 text-caption text-text-muted">{t(mode === "selected" ? "tp.access.mode.selectedHint" : "tp.access.mode.allHint")}</p>
          {mode === "all" && (
            <div className="mt-3">
              <span className="mb-1.5 block text-caption font-semibold text-text-secondary">{t("tp.access.baseRole")}</span>
              <PillChoice
                ariaLabel={t("tp.access.baseRole")}
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
        <div className="flex items-start gap-3 rounded-xl border border-border-soft px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-small font-bold text-text">{t("tp.create.reviewDefault")}</span>
            <span className="block text-caption text-text-secondary">{t("tp.create.reviewDefaultHint")}</span>
          </span>
          <Switch checked={review} onChange={setReview} label={t("tp.create.reviewDefault")} />
        </div>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
