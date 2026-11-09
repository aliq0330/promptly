"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { FolderOpen } from "@/components/icons/folder-open";
import { MessageCircle } from "@/components/icons/message-circle";
import { Pencil } from "@/components/icons/pencil";
import { Plus } from "@/components/icons/plus";
import { Presentation } from "@/components/icons/presentation";
import { Settings } from "@/components/icons/settings";
import { Trash2 } from "@/components/icons/trash-2";
import { UsersRound } from "@/components/icons/users-round";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/features/groups/use-toast";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteBoard, fetchProject, renameBoard, setFileReview, type ProjectDetail } from "@/lib/supabase/team-projects";
import { teamLink } from "@/lib/teams";
import { canAddToArea, canReview, projectLink } from "@/lib/team-projects";
import { cn } from "@/lib/utils";
import {
  DeleteFileDialog,
  NewBoardDialog,
  NewFileDialog,
  ProjectAccessDialog,
  ProjectSettingsDialog,
  RenameFileDialog,
  ReviewSwitchRow,
  VariableDialog,
} from "./project-dialogs";
import { ProjectRoleChip, ProjectSection } from "./project-ui";
import { ProjectVariablesPanel } from "./project-variables";
import { isAreaTab, TeamAreaView, type AreaTab } from "./team-area-view";
import { TeamReviewInbox } from "./team-review-inbox";
import type { TeamCtx } from "./team-page";
import { PersonRow, SectionError } from "./team-ui";
import type { TeamActionError } from "@/lib/supabase/teams";

/**
 * Proje sayfası (`/teams/local?id=&tab=projects&project=&file=&board=&review=&sub=`; docs/history/362-*). Aynı adres dört görünüm taşır:
 * proje ana ekranı · dosya · pano (proje geneli/ek pano) · lider onay kuyruğu. Rol yalnız proje başınadır (dosya başına rol yok).
 */
export function TeamProjectPage({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const params = useSearchParams();
  const { team } = ctx;
  const projectId = params.get("project") ?? "";
  const fileId = params.get("file");
  const boardId = params.get("board");
  const reviewing = params.get("review") !== null && params.get("review") !== "";
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    fetchProject(projectId).then(
      (data) => {
        if (!alive) return;
        setDetail(data);
        setState("ready");
      },
      (e: TeamActionError) => {
        if (alive) setState(e.code === "project_not_found" ? "missing" : "failed");
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId, version]);

  if (state === "loading") return <Skeleton className="h-72 w-full rounded-xl" />;
  if (state !== "ready" || !detail) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={t(state === "failed" ? "tp.error.load" : "tp.page.missing")}
        description={t(state === "failed" ? "tp.page.failedBody" : "tp.page.missingBody")}
        action={{ label: t("tp.page.back"), href: projectLink(team.id) }}
      />
    );
  }

  if (reviewing) return <TeamReviewInbox ctx={ctx} detail={detail} onChanged={reload} />;
  if (fileId) {
    const file = detail.files.find((item) => item.id === fileId);
    if (!file) return <EmptyState icon={FolderOpen} title={t("tp.file.missing")} action={{ label: t("tp.page.back"), href: projectLink(team.id, detail.project.id) }} />;
    return <FilePage ctx={ctx} detail={detail} file={file} onChanged={reload} />;
  }
  if (boardId) return <BoardPage ctx={ctx} detail={detail} boardId={boardId} onChanged={reload} />;
  return <ProjectHome ctx={ctx} detail={detail} onChanged={reload} />;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Ortak: üst bant / geri bağlantısı
// ---------------------------------------------------------------------------------------------------------------------------------------
function Crumbs({ teamId, detail, leaf }: { teamId: string; detail: ProjectDetail; leaf?: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("tp.page.crumbs")} className="flex flex-wrap items-center gap-1.5 text-small text-text-secondary" data-project-crumbs>
      <Link href={projectLink(teamId)} className="inline-flex items-center gap-1 font-medium hover:text-text hover:underline">
        <ArrowLeft size={14} aria-hidden />
        {t("tp.list.title")}
      </Link>
      <span aria-hidden>/</span>
      {leaf ? (
        <Link href={projectLink(teamId, detail.project.id)} className="font-medium hover:text-text hover:underline">
          {detail.project.title}
        </Link>
      ) : (
        <span className="font-semibold text-text">{detail.project.title}</span>
      )}
      {leaf && (
        <>
          <span aria-hidden>/</span>
          <span className="font-semibold text-text">{leaf}</span>
        </>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Proje ana ekranı
// ---------------------------------------------------------------------------------------------------------------------------------------
function ProjectHome({ ctx, detail, onChanged }: { ctx: TeamCtx; detail: ProjectDetail; onChanged: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { team } = ctx;
  const { project, myRole } = detail;
  const lead = canReview(myRole);
  const canAdd = canAddToArea(myRole);
  const [dialog, setDialog] = useState<null | "file" | "board" | "access" | "settings">(null);
  const archived = Boolean(project.archivedAt);
  const projectBoards = detail.boards.filter((board) => board.fileId === null);
  const projectVariables = detail.variables;

  return (
    <div className="space-y-6" data-testid="team-project-home" data-project-id={project.id} data-project-role={myRole}>
      <Crumbs teamId={team.id} detail={detail} />

      <header className="flex flex-wrap items-start gap-4 rounded-2xl bg-primary-soft p-5">
        <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-border-soft bg-surface text-primary">
          <FolderOpen size={30} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-caption font-bold uppercase tracking-[0.1em] text-primary">{t("tp.page.kicker")}</p>
          <h1 className="break-words text-h1 font-display font-extrabold text-text">{project.title}</h1>
          {project.description && <p className="max-w-2xl whitespace-pre-wrap break-words text-small text-text-secondary">{project.description}</p>}
          <p className="text-small text-text-secondary">{t("tp.card.counts", { files: detail.files.length, boards: detail.boards.length, people: detail.people.length })}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-2 text-small text-text-secondary">
            {t("tp.page.yourRole")} <ProjectRoleChip role={myRole} />
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            {detail.channelId && (
              <Link href={teamLink(team.id, "chat", { channel: detail.channelId })} className={buttonClassName({ variant: "outline", size: "sm", className: "gap-1.5" })} data-project-open-chat>
                <MessageCircle size={15} aria-hidden />
                {t("tp.page.openChat")}
              </Link>
            )}
            {lead && !archived && (
              <Button type="button" size="sm" onClick={() => setDialog("file")} data-project-new-file>
                <Plus size={15} aria-hidden />
                {t("tp.file.new")}
              </Button>
            )}
            {lead && (
              <Button type="button" size="sm" variant="outline" onClick={() => setDialog("settings")} aria-label={t("tp.settings.title")} data-project-settings>
                <Settings size={15} aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </header>

      {archived && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-small text-text">
          {t("tp.page.archivedNotice")}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-7">
          <ProjectSection title={t("tp.files.title")} hint={t("tp.files.hint")} testId="project-files">
            {detail.files.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-soft p-5 text-small text-text-muted">{t(lead ? "tp.files.emptyLead" : "tp.files.empty")}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {detail.files.map((file) => (
                  <li key={file.id}>
                    <Link
                      href={projectLink(team.id, project.id, { file: file.id })}
                      className="block h-full rounded-xl border border-border-soft bg-surface p-4 shadow-card transition-shadow hover:shadow-card-hover"
                      data-file-card={file.id}
                    >
                      <div className="flex items-center gap-2.5">
                        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                          <FolderOpen size={20} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-body font-bold text-text">{file.title}</span>
                      </div>
                      <p className="mt-2 text-caption text-text-muted">{t("tp.file.counts", { items: file.itemCount, boards: file.boardCount ?? 0 })}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-caption font-semibold", file.reviewRequired ? "bg-success/10 text-success" : "bg-surface-soft text-text-secondary")}>
                          {t(file.reviewRequired ? "tp.file.reviewOn" : "tp.file.reviewOff")}
                        </span>
                        {lead && (file.pendingCount ?? 0) > 0 && <span className="inline-flex h-6 items-center rounded-full bg-warning/10 px-2.5 text-caption font-semibold text-warning">{t("tp.card.pending", { count: file.pendingCount ?? 0 })}</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ProjectSection>

          <ProjectSection
            title={t("tp.boards.title")}
            hint={t("tp.boards.hint")}
            testId="project-boards"
            action={
              canAdd && !archived ? (
                <button type="button" onClick={() => setDialog("board")} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-semibold text-primary" data-project-new-board>
                  <Plus size={12} aria-hidden />
                  {t("tp.board.new")}
                </button>
              ) : null
            }
          >
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {detail.mainAreaId && (
                <li>
                  <Link href={projectLink(team.id, project.id, { board: detail.mainAreaId })} className="flex h-full items-center gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card hover:shadow-card-hover" data-project-main-area>
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary/10 text-secondary">
                      <Presentation size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-bold text-text">{t("tp.area.projectWide")}</span>
                      <span className="block text-caption text-text-muted">{t("tp.area.projectWideHint", { items: detail.itemCount })}</span>
                    </span>
                  </Link>
                </li>
              )}
              {projectBoards.map((board) => (
                <li key={board.id}>
                  <Link href={projectLink(team.id, project.id, { board: board.id })} className="flex h-full items-center gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card hover:shadow-card-hover" data-board-card={board.id}>
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-soft text-text-secondary">
                      <Presentation size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-bold text-text">{board.title}</span>
                      <span className="block text-caption text-text-muted">{t("tp.board.items", { count: board.itemCount })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </ProjectSection>
        </div>

        <aside className="min-w-0 space-y-5">
          {lead && (detail.pendingCount ?? 0) > 0 && (
            <Link href={projectLink(team.id, project.id, { review: true })} className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-small hover:bg-warning/15" data-project-review-link>
              <span className="grid h-9 min-w-9 place-items-center rounded-full bg-warning/20 px-2 font-bold text-warning">{detail.pendingCount}</span>
              <span className="min-w-0 flex-1 font-semibold text-text">{t("tp.review.waitingForYou")}</span>
            </Link>
          )}
          <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4" data-testid="project-people">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 text-body font-bold text-text">{t("tp.people.title")}</h3>
              {lead && (
                <button type="button" onClick={() => setDialog("access")} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-semibold text-primary" data-project-edit-access>
                  <UsersRound size={13} aria-hidden />
                  {t("tp.people.edit")}
                </button>
              )}
            </div>
            <ul className="divide-y divide-border-soft">
              {detail.people.map((person) => (
                <li key={`${person.type}-${person.id}`}>
                  <PersonRow
                    name={person.name}
                    username={person.username}
                    avatarUrl={person.avatarUrl}
                    sub={person.type === "group" ? t("tm.access.groupSub", { count: person.memberCount ?? 0 }) : person.implicit ? t("tp.people.implicit") : undefined}
                    right={<ProjectRoleChip role={person.role} />}
                  />
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-muted">{t("tp.people.note")}</p>
          </section>
          <ProjectVariablesPanel projectId={project.id} fileId={null} variables={projectVariables} role={myRole} onChanged={onChanged} />
        </aside>
      </div>

      {dialog === "file" && (
        <NewFileDialog
          project={detail}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            router.push(projectLink(team.id, project.id, { file: id }));
          }}
        />
      )}
      {dialog === "board" && (
        <NewBoardDialog
          projectId={project.id}
          fileId={null}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            router.push(projectLink(team.id, project.id, { board: id }));
          }}
        />
      )}
      {dialog === "access" && (
        <ProjectAccessDialog
          project={detail}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
      {dialog === "settings" && (
        <ProjectSettingsDialog
          project={detail}
          canManage={lead}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
          }}
          onDeleted={() => router.replace(projectLink(team.id))}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Dosya sayfası
// ---------------------------------------------------------------------------------------------------------------------------------------
function useAreaTab(): AreaTab {
  const params = useSearchParams();
  const sub = params.get("sub");
  return isAreaTab(sub) ? sub : "board";
}

function FilePage({ ctx, detail, file, onChanged }: { ctx: TeamCtx; detail: ProjectDetail; file: ProjectDetail["files"][number]; onChanged: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { team } = ctx;
  const { project, myRole } = detail;
  const lead = canReview(myRole);
  const tab = useAreaTab();
  const { node: toastNode, show } = useToast();
  const [dialog, setDialog] = useState<null | "rename" | "delete" | "board" | "variable">(null);
  const [busy, setBusy] = useState(false);
  const fileBoards = detail.boards.filter((board) => board.fileId === file.id);

  const toggleReview = async (on: boolean) => {
    setBusy(true);
    try {
      const left = await setFileReview(file.id, on);
      if (!on && left > 0) show(t("tp.review.turnedOffLeft", { count: left }));
      onChanged();
    } catch (e) {
      show((e as TeamActionError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="team-file-page" data-file-id={file.id} data-project-role={myRole}>
      <Crumbs teamId={team.id} detail={detail} leaf={file.title} />
      <header className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary-soft p-5">
        <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-border-soft bg-surface text-primary">
          <FolderOpen size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-bold uppercase tracking-[0.1em] text-primary">{t("tp.file.kicker", { project: project.title })}</p>
          <h1 className="break-words text-h1 font-display font-extrabold text-text">{file.title}</h1>
        </div>
        <ProjectRoleChip role={myRole} />
        {lead && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setDialog("rename")} aria-label={t("tp.file.rename")}>
              <Pencil size={15} aria-hidden />
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-danger" onClick={() => setDialog("delete")} aria-label={t("tp.file.deleteTitle")}>
              <Trash2 size={15} aria-hidden />
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {file.mainAreaId ? (
            <TeamAreaView
              spaceId={file.mainAreaId}
              role={myRole}
              tab={tab}
              hrefFor={(next) => projectLink(team.id, project.id, { file: file.id, sub: next })}
              reviewHref={lead ? projectLink(team.id, project.id, { review: true }) : null}
              add={{ reviewOn: file.reviewRequired, onNewBoard: () => setDialog("board"), onNewVariable: () => setDialog("variable") }}
            />
          ) : (
            <SectionError message={t("tp.area.missing")} />
          )}
        </div>
        <aside className="min-w-0 space-y-5">
          {lead ? (
            <div className={cn(busy && "pointer-events-none opacity-60")} data-file-review-switch>
              <ReviewSwitchRow value={file.reviewRequired} onChange={(on) => void toggleReview(on)} />
            </div>
          ) : (
            <p className="rounded-xl border border-border-soft bg-surface p-3.5 text-small text-text-secondary" data-file-review-note>
              {t(file.reviewRequired ? "tp.review.noteOn" : "tp.review.noteOff")}
            </p>
          )}
          <ProjectVariablesPanel projectId={project.id} fileId={file.id} variables={detail.variables} role={myRole} onChanged={onChanged} />
          <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4" data-testid="file-boards">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 text-body font-bold text-text">{t("tp.boards.fileTitle")}</h3>
              {canAddToArea(myRole) && (
                <button type="button" onClick={() => setDialog("board")} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-semibold text-primary" data-file-new-board>
                  <Plus size={12} aria-hidden />
                  {t("tp.board.new")}
                </button>
              )}
            </div>
            {fileBoards.length === 0 ? (
              <p className="text-small text-text-muted">{t("tp.boards.fileEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {fileBoards.map((board) => (
                  <li key={board.id}>
                    <Link href={projectLink(team.id, project.id, { board: board.id })} className="flex items-center gap-2 rounded-lg bg-surface-soft px-3 py-2 text-small font-semibold text-text hover:bg-surface-soft/70" data-board-card={board.id}>
                      <Presentation size={15} aria-hidden className="text-text-secondary" />
                      <span className="min-w-0 flex-1 truncate">{board.title}</span>
                      <span className="text-caption font-normal text-text-muted">{board.itemCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {toastNode}

      {dialog === "rename" && (
        <RenameFileDialog
          file={file}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
      {dialog === "delete" && <DeleteFileDialog file={file} onClose={() => setDialog(null)} onDone={() => router.replace(projectLink(team.id, project.id))} />}
      {dialog === "variable" && (
        <VariableDialog
          projectId={project.id}
          fileId={file.id}
          variable={null}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
      {dialog === "board" && (
        <NewBoardDialog
          projectId={project.id}
          fileId={file.id}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            router.push(projectLink(team.id, project.id, { board: id }));
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Pano sayfası (proje geneli alanı ya da ek pano)
// ---------------------------------------------------------------------------------------------------------------------------------------
function BoardPage({ ctx, detail, boardId, onChanged }: { ctx: TeamCtx; detail: ProjectDetail; boardId: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { team } = ctx;
  const { project, myRole } = detail;
  const tab = useAreaTab();
  const isMain = boardId === detail.mainAreaId;
  const board = detail.boards.find((item) => item.id === boardId);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(board?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const known = isMain || Boolean(board);

  if (!known) return <EmptyState icon={Presentation} title={t("tp.board.missing")} action={{ label: t("tp.page.back"), href: projectLink(team.id, project.id) }} />;
  const heading = isMain ? t("tp.area.projectWide") : (board?.title ?? "");
  const lead = canReview(myRole);

  const rename = async () => {
    setError(null);
    try {
      await renameBoard(boardId, title.trim());
      setRenaming(false);
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
    }
  };
  const remove = async () => {
    setError(null);
    try {
      await deleteBoard(boardId);
      router.replace(projectLink(team.id, project.id));
    } catch (e) {
      setError((e as TeamActionError).message);
    }
  };

  return (
    <div className="space-y-5" data-testid="team-board-page" data-board-id={boardId} data-project-role={myRole}>
      <Crumbs teamId={team.id} detail={detail} leaf={heading} />
      <header className="flex flex-wrap items-center gap-3">
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} aria-label={t("tp.board.rename")} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-body" />
            <Button type="button" size="sm" onClick={() => void rename()}>
              {t("common.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <h1 className="min-w-0 flex-1 break-words text-h1 font-display font-extrabold text-text">{heading}</h1>
        )}
        <ProjectRoleChip role={myRole} />
        {!isMain && canAddToArea(myRole) && !renaming && (
          <Button type="button" size="sm" variant="outline" onClick={() => setRenaming(true)} aria-label={t("tp.board.rename")}>
            <Pencil size={15} aria-hidden />
          </Button>
        )}
        {!isMain && lead && (
          <Button type="button" size="sm" variant="outline" className="text-danger" onClick={() => void remove()} aria-label={t("tp.board.delete")}>
            <Trash2 size={15} aria-hidden />
          </Button>
        )}
      </header>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <TeamAreaView
        spaceId={boardId}
        role={myRole}
        tab={tab}
        hrefFor={(next) => projectLink(team.id, project.id, { board: boardId, sub: next })}
        reviewHref={lead ? projectLink(team.id, project.id, { review: true }) : null}
        add={{ reviewOn: detail.project.reviewDefault }}
      />
    </div>
  );
}
