"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FolderOpen } from "@/components/icons/folder-open";
import { Plus } from "@/components/icons/plus";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DescriptionField, FormError, SubmitButton, TitleField } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { createProject, listProjects, updateProject, type ProjectAccessEntry, type ProjectAccessMode, type ProjectSummary } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { projectLink } from "@/lib/team-projects";
import { cn } from "@/lib/utils";
import { ProjectAccessEditor } from "./project-access-editor";
import { ProjectRoleChip } from "./project-ui";
import type { TeamCtx } from "./team-page";
import { PillChoice, SectionError, Switch } from "./team-ui";

/**
 * Projeler sekmesi (docs/history/362-*): ekibin projeleri (en çok 50). Proje = ekibin çalışma alanı (Space DEĞİL): dosyalar, panolar,
 * değişkenler ve proje sohbeti taşır. Yalnız erişimi olan projeler listelenir; "Yeni proje" `create_spaces` yeteneği ister.
 */
export function TeamProjectsSection({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const { team, can } = ctx;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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
  const pendingTotal = active.reduce((sum, project) => sum + (project.pendingCount ?? 0), 0);
  const firstPending = active.find((project) => (project.pendingCount ?? 0) > 0);
  const canCreate = can("create_spaces") && team.myRole !== "guest";

  return (
    <section className="space-y-5" data-testid="team-projects">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 font-display font-bold text-text">{t("tp.list.title")}</h2>
          <p className="text-small text-text-secondary">{t("tp.list.subtitle", { count: active.length })}</p>
        </div>
        {canCreate && (
          <Button type="button" onClick={() => setCreateOpen(true)} data-team-new-project>
            <Plus size={16} aria-hidden />
            {t("tp.list.new")}
          </Button>
        )}
      </div>

      {pendingTotal > 0 && firstPending && (
        <Link
          href={projectLink(team.id, firstPending.id, { review: true })}
          className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-small text-text hover:bg-warning/15"
          data-project-pending-banner
        >
          <span className="grid h-8 min-w-8 place-items-center rounded-full bg-warning/20 px-2 font-bold text-warning">{pendingTotal}</span>
          <span className="min-w-0 flex-1 font-semibold">{t("tp.list.pendingBanner", { count: pendingTotal })}</span>
        </Link>
      )}

      {failed && <SectionError message={t("tp.error.load")} onRetry={load} />}
      {!failed && projects === null && (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
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
        <ul className="grid gap-4 md:grid-cols-2" data-testid="team-project-list">
          {active.map((project) => (
            <li key={project.id}>
              <ProjectCard team={team.id} project={project} />
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-small font-semibold text-text-muted">{t("tp.list.archived")}</h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {archived.map((project) => (
              <li key={project.id}>
                <ProjectCard team={team.id} project={project} />
              </li>
            ))}
          </ul>
        </div>
      )}

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
    </section>
  );
}

function ProjectCard({ team, project }: { team: string; project: ProjectSummary }) {
  const { t } = useTranslation();
  const lead = project.myRole === "lead";
  return (
    <Link
      href={projectLink(team, project.id)}
      className={cn("block h-full rounded-xl border border-border-soft bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover", project.archivedAt && "opacity-70")}
      data-project-card={project.id}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <FolderOpen size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-body font-bold text-text">{project.title}</h3>
            {project.myRole && <ProjectRoleChip role={project.myRole} />}
            {project.archivedAt && <span className="inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-caption font-semibold text-text-muted">{t("tp.card.archived")}</span>}
          </div>
          {project.description && <p className="mt-1 line-clamp-2 text-small text-text-secondary">{project.description}</p>}
        </div>
      </div>
      <p className="mt-3 text-caption text-text-muted">
        {t("tp.card.counts", { files: project.files.length, boards: project.boardCount, people: project.memberCount })}
      </p>
      {project.files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {project.files.slice(0, 4).map((file) => (
            <li key={file.id} className="inline-flex h-6 max-w-[11rem] items-center rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-secondary">
              <span className="truncate">{file.title}</span>
            </li>
          ))}
          {project.files.length > 4 && <li className="inline-flex h-6 items-center rounded-full bg-surface-soft px-2.5 text-caption text-text-muted">+{project.files.length - 4}</li>}
        </ul>
      )}
      {lead && (project.pendingCount ?? 0) > 0 && (
        <p className="mt-3 inline-flex h-6 items-center rounded-full bg-warning/10 px-2.5 text-caption font-semibold text-warning" data-project-pending={project.pendingCount}>
          {t("tp.card.pending", { count: project.pendingCount ?? 0 })}
        </p>
      )}
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
        <TitleField value={title} onChange={setTitle} autoFocus />
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
