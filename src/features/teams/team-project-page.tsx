"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FolderOpen } from "@/components/icons/folder-open";
import { MessageCircle } from "@/components/icons/message-circle";
import { Pencil } from "@/components/icons/pencil";
import { Pin } from "@/components/icons/pin";
import { Plus } from "@/components/icons/plus";
import { Presentation } from "@/components/icons/presentation";
import { Settings } from "@/components/icons/settings";
import { Trash2 } from "@/components/icons/trash-2";
import { UsersRound } from "@/components/icons/users-round";
import { Button, buttonClassName } from "@/components/ui/button";
import { ChevronRight } from "@/components/icons/chevron-right";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
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
import { ProjectPathBar, type PathCrumb } from "./project-path-bar";
import { ProjectRoleChip } from "./project-ui";
import { ProjectVariablesPanel } from "./project-variables";
import { TeamAreaView, type AreaBoardRow, type AreaTab } from "./team-area-view";
import { TeamReviewInbox } from "./team-review-inbox";
import type { TeamCtx } from "./team-page";
import { PersonRow, SectionError } from "./team-ui";
import type { TeamActionError } from "@/lib/supabase/teams";

/**
 * Proje sayfası (`/teams/local?id=&tab=projects&project=&file=&board=&review=&sub=&add=`; docs/history/362-*, 363-*). Aynı adres dört görünüm taşır:
 * proje ana ekranı · dosya · alan (Ortak / ek pano) · lider onay kuyruğu. Rol yalnız proje başınadır (dosya başına rol yok).
 *
 * Gezgin düzeni (docs/history/363-*): tek üst çubuk (geri + yol çipleri + bilgi); proje ana ekranı klasör listesidir (Ortak + dosyalar);
 * bir dosya/alan açılınca içindekiler satır satır görünür, hiçbir şey kendiliğinden açık gelmez, her şey "Ekle" ile eklenir.
 * Kişiler, roller, değişkenler ve onay anahtarı bilgi (ⓘ) penceresindedir.
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
// Ortak parçalar
// ---------------------------------------------------------------------------------------------------------------------------------------
/** Alanın tek alt görünümü pano (`sub=board`); eski `sub=images|prompts|notes|palette|content` adresleri listeye düşer (docs/history/365-*). */
function useAreaTab(): AreaTab | null {
  return useSearchParams().get("sub") === "board" ? "board" : null;
}

/** `?item=` (öğe sayfası, docs/history/364-*) ve `?focus=` (panoda öğeye odaklan). */
function useItemParams(): { item: string | null; focus: string | null } {
  const params = useSearchParams();
  return { item: params.get("item") || null, focus: params.get("focus") || null };
}

/** Başlık bloğu: büyük ad + tek satır özet; sağda isteğe bağlı eylemler. */
function TitleBlock({ title, meta, actions, children }: { title: string; meta?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-3 gap-y-2 px-1">
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-h1 font-display font-extrabold leading-tight text-text">{title}</h1>
        {meta && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-secondary">{meta}</div>}
        {children}
      </div>
      {actions}
    </header>
  );
}

/** Sağ altta sabit tek ana eylem (telefonda alt menünün üstünde). */
function FloatingAction({ onClick, label, attrs }: { onClick: () => void; label: string; attrs?: Record<string, string> }) {
  return (
    <div className="pointer-events-none sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex justify-end pt-2 md:bottom-6">
      <Button type="button" onClick={onClick} className="pointer-events-auto h-12 gap-2 rounded-full px-5 shadow-pop" {...attrs}>
        <Plus size={18} aria-hidden />
        {label}
      </Button>
    </div>
  );
}

function boardRows(detail: ProjectDetail, teamId: string, fileId: string | null): AreaBoardRow[] {
  return detail.boards
    .filter((board) => board.fileId === fileId && board.id !== detail.mainAreaId)
    .map((board) => ({ id: board.id, title: board.title, itemCount: board.itemCount, href: projectLink(teamId, detail.project.id, { board: board.id }) }));
}

function teamCrumb(ctx: TeamCtx): PathCrumb {
  return { label: ctx.team.name, href: projectLink(ctx.team.id) };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Bilgi pencereleri (kişiler, değişkenler, onay) — eskiden yan sütundu
// ---------------------------------------------------------------------------------------------------------------------------------------
function ProjectInfoSheet({
  ctx,
  detail,
  onClose,
  onChanged,
  onAccess,
  onSettings,
}: {
  ctx: TeamCtx;
  detail: ProjectDetail;
  onClose: () => void;
  onChanged: () => void;
  onAccess: () => void;
  onSettings: () => void;
}) {
  const { t } = useTranslation();
  const { team } = ctx;
  const { project, myRole } = detail;
  const lead = canReview(myRole);
  return (
    <SpaceDialog title={t("tp.info.projectTitle")} eyebrow={project.title} onClose={onClose} formTestId="project-info-sheet">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-small text-text-secondary">
          {t("tp.page.yourRole")} <ProjectRoleChip role={myRole} />
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.channelId && (
            <Link href={teamLink(team.id, "chat", { channel: detail.channelId })} className={buttonClassName({ variant: "outline", size: "sm", className: "gap-1.5" })} data-project-open-chat>
              <MessageCircle size={15} aria-hidden />
              {t("tp.page.openChat")}
            </Link>
          )}
          {lead && (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onSettings} data-project-settings>
              <Settings size={15} aria-hidden />
              {t("tp.settings.title")}
            </Button>
          )}
        </div>
        <section className="space-y-3" data-testid="project-people">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 text-body font-bold text-text">{t("tp.people.title")}</h3>
            {lead && (
              <button type="button" onClick={onAccess} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-semibold text-primary" data-project-edit-access>
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
        <ProjectVariablesPanel projectId={project.id} fileId={null} variables={detail.variables} role={myRole} onChanged={onChanged} />
      </div>
    </SpaceDialog>
  );
}

function FileInfoSheet({
  detail,
  file,
  onClose,
  onChanged,
  onRename,
  onDelete,
}: {
  detail: ProjectDetail;
  file: ProjectDetail["files"][number];
  onClose: () => void;
  onChanged: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { project, myRole } = detail;
  const lead = canReview(myRole);
  const { node: toastNode, show } = useToast();
  const [busy, setBusy] = useState(false);
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
    <SpaceDialog title={t("tp.info.fileTitle")} eyebrow={file.title} onClose={onClose} formTestId="file-info-sheet">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-small text-text-secondary">
          {t("tp.page.yourRole")} <ProjectRoleChip role={myRole} />
        </div>
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
        {lead && (
          <div className="flex flex-wrap gap-2 border-t border-border-soft pt-4">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onRename} data-file-rename>
              <Pencil size={15} aria-hidden />
              {t("tp.file.rename")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5 text-danger" onClick={onDelete} data-file-delete>
              <Trash2 size={15} aria-hidden />
              {t("tp.file.deleteTitle")}
            </Button>
          </div>
        )}
      </div>
      {toastNode}
    </SpaceDialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Proje ana ekranı: klasör listesi
// ---------------------------------------------------------------------------------------------------------------------------------------
function ProjectHome({ ctx, detail, onChanged }: { ctx: TeamCtx; detail: ProjectDetail; onChanged: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { team } = ctx;
  const { project, myRole } = detail;
  const lead = canReview(myRole);
  const [dialog, setDialog] = useState<null | "info" | "file" | "access" | "settings">(null);
  const archived = Boolean(project.archivedAt);
  const sharedBoards = boardRows(detail, team.id, null).length;

  return (
    <div className="space-y-4" data-testid="team-project-home" data-project-id={project.id} data-project-role={myRole}>
      <ProjectPathBar crumbs={[teamCrumb(ctx), { label: project.title }]} backHref={projectLink(team.id)} onInfo={() => setDialog("info")} />

      <TitleBlock
        title={project.title}
        meta={
          <>
            <ProjectRoleChip role={myRole} />
            <span>{t("tp.card.counts", { files: detail.files.length, boards: detail.boards.length, people: detail.people.length })}</span>
          </>
        }
      >
        {project.description && <p className="mt-1 max-w-2xl whitespace-pre-wrap break-words text-small text-text-secondary">{project.description}</p>}
      </TitleBlock>

      {archived && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-small text-text">
          {t("tp.page.archivedNotice")}
        </p>
      )}

      {lead && (detail.pendingCount ?? 0) > 0 && (
        <Link href={projectLink(team.id, project.id, { review: true })} className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-small hover:bg-warning/15" data-project-review-link>
          <span className="grid h-9 min-w-9 place-items-center rounded-full bg-warning/20 px-2 font-bold text-warning">{detail.pendingCount}</span>
          <span className="min-w-0 flex-1 font-semibold text-text">{t("tp.review.waitingForYou")}</span>
        </Link>
      )}

      <ul className="space-y-2" data-testid="project-files">
        {detail.mainAreaId && (
          <li>
            <Link href={projectLink(team.id, project.id, { board: detail.mainAreaId })} className="flex min-h-16 items-center gap-3 rounded-xl border border-border-soft bg-surface p-3 shadow-card hover:shadow-card-hover" data-project-main-area>
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary/10 text-secondary">
                <Pin size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-bold text-text">{t("tp.area.projectWide")}</span>
                <span className="block text-caption text-text-muted">
                  {t("tp.home.sharedSub", { items: detail.itemCount })}
                  {sharedBoards > 0 ? ` · ${t("tp.board.items", { count: sharedBoards })}` : ""}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted" />
            </Link>
          </li>
        )}
        {detail.files.map((file) => (
          <li key={file.id}>
            <Link href={projectLink(team.id, project.id, { file: file.id })} className="flex min-h-16 items-center gap-3 rounded-xl border border-border-soft bg-surface p-3 shadow-card hover:shadow-card-hover" data-file-card={file.id}>
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <FolderOpen size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-bold text-text">{file.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
                  {t("tp.file.counts", { items: file.itemCount, boards: file.boardCount ?? 0 })}
                  <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-caption font-semibold", file.reviewRequired ? "bg-success/10 text-success" : "bg-surface-soft text-text-secondary")}>
                    {t(file.reviewRequired ? "tp.file.reviewOn" : "tp.file.reviewOff")}
                  </span>
                  {lead && (file.pendingCount ?? 0) > 0 && <span className="inline-flex h-5 items-center rounded-full bg-warning/10 px-2 text-caption font-semibold text-warning">{t("tp.card.pending", { count: file.pendingCount ?? 0 })}</span>}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      {detail.files.length === 0 && <p className="rounded-xl border border-dashed border-border-soft p-5 text-small text-text-muted">{t(lead ? "tp.files.emptyLead" : "tp.files.empty")}</p>}

      {lead && !archived && <FloatingAction onClick={() => setDialog("file")} label={t("tp.file.new")} attrs={{ "data-project-new-file": "" }} />}

      {dialog === "info" && (
        <ProjectInfoSheet ctx={ctx} detail={detail} onClose={() => setDialog(null)} onChanged={onChanged} onAccess={() => setDialog("access")} onSettings={() => setDialog("settings")} />
      )}
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
function FilePage({ ctx, detail, file, onChanged }: { ctx: TeamCtx; detail: ProjectDetail; file: ProjectDetail["files"][number]; onChanged: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { team } = ctx;
  const { project, myRole } = detail;
  const tab = useAreaTab();
  const { item: itemParam, focus } = useItemParams();
  const [dialog, setDialog] = useState<null | "info" | "rename" | "delete" | "board" | "variable">(null);
  const fileBoards = boardRows(detail, team.id, file.id);
  const fileHref = projectLink(team.id, project.id, { file: file.id });

  return (
    <div className="space-y-4" data-testid="team-file-page" data-file-id={file.id} data-project-role={myRole}>
      {!itemParam && (
        <>
          <ProjectPathBar
            crumbs={[teamCrumb(ctx), { label: project.title, href: projectLink(team.id, project.id) }, { label: file.title }]}
            backHref={tab ? fileHref : projectLink(team.id, project.id)}
            onInfo={() => setDialog("info")}
          />
          <TitleBlock
            title={file.title}
            meta={
              <>
                <span>{t("tp.file.counts", { items: file.itemCount, boards: fileBoards.length })}</span>
                <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-caption font-semibold", file.reviewRequired ? "bg-success/10 text-success" : "bg-surface-soft text-text-secondary")}>
                  {t(file.reviewRequired ? "tp.file.reviewOn" : "tp.file.reviewOff")}
                </span>
              </>
            }
          />
        </>
      )}
      {file.mainAreaId ? (
        <TeamAreaView
          spaceId={file.mainAreaId}
          role={myRole}
          tab={tab}
          boards={fileBoards}
          hrefFor={(next, extra) => projectLink(team.id, project.id, { file: file.id, sub: next, focus: extra?.focus })}
          itemHref={(id) => projectLink(team.id, project.id, { file: file.id, item: id })}
          focusId={focus}
          item={
            itemParam
              ? {
                  itemId: itemParam,
                  crumbs: [teamCrumb(ctx), { label: project.title, href: projectLink(team.id, project.id) }, { label: file.title, href: fileHref }],
                  listHref: fileHref,
                  boardHref: (id) => projectLink(team.id, project.id, { file: file.id, sub: "board", focus: id }),
                  variables: detail.variables,
                  fileId: file.id,
                }
              : null
          }
          reviewHref={canReview(myRole) ? projectLink(team.id, project.id, { review: true }) : null}
          add={{ reviewOn: file.reviewRequired, onNewBoard: () => setDialog("board"), onNewVariable: () => setDialog("variable") }}
        />
      ) : (
        <SectionError message={t("tp.area.missing")} />
      )}

      {dialog === "info" && (
        <FileInfoSheet detail={detail} file={file} onClose={() => setDialog(null)} onChanged={onChanged} onRename={() => setDialog("rename")} onDelete={() => setDialog("delete")} />
      )}
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
// Alan sayfası: Ortak (proje geneli) ya da ek pano
// ---------------------------------------------------------------------------------------------------------------------------------------
function BoardPage({ ctx, detail, boardId, onChanged }: { ctx: TeamCtx; detail: ProjectDetail; boardId: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { team } = ctx;
  const { project, myRole } = detail;
  const tab = useAreaTab();
  const { item: itemParam, focus } = useItemParams();
  const isMain = boardId === detail.mainAreaId;
  const board = detail.boards.find((item) => item.id === boardId);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(board?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "info" | "board" | "variable" | "access" | "settings">(null);
  const known = isMain || Boolean(board);

  if (!known) return <EmptyState icon={Presentation} title={t("tp.board.missing")} action={{ label: t("tp.page.back"), href: projectLink(team.id, project.id) }} />;
  const heading = isMain ? t("tp.area.projectWide") : (board?.title ?? "");
  const lead = canReview(myRole);
  const fileOfBoard = board?.fileId ? detail.files.find((item) => item.id === board.fileId) : null;
  const parentHref = fileOfBoard ? projectLink(team.id, project.id, { file: fileOfBoard.id }) : projectLink(team.id, project.id);
  const selfHref = projectLink(team.id, project.id, { board: boardId });
  const crumbs: PathCrumb[] = [teamCrumb(ctx), { label: project.title, href: projectLink(team.id, project.id) }];
  if (fileOfBoard) crumbs.push({ label: fileOfBoard.title, href: parentHref });
  crumbs.push({ label: heading });

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
      router.replace(parentHref);
    } catch (e) {
      setError((e as TeamActionError).message);
    }
  };

  return (
    <div className="space-y-4" data-testid="team-board-page" data-board-id={boardId} data-project-role={myRole}>
      {!itemParam && <ProjectPathBar crumbs={crumbs} backHref={tab ? selfHref : parentHref} onInfo={() => setDialog("info")} />}
      {itemParam ? null : renaming ? (
        <div className="flex min-w-0 items-center gap-2 px-1">
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} aria-label={t("tp.board.rename")} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-body" />
          <Button type="button" size="sm" onClick={() => void rename()}>
            {t("common.save")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      ) : (
        <TitleBlock
          title={heading}
          actions={
            !isMain && (canAddToArea(myRole) || lead) ? (
              <div className="flex gap-2">
                {canAddToArea(myRole) && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setRenaming(true)} aria-label={t("tp.board.rename")}>
                    <Pencil size={15} aria-hidden />
                  </Button>
                )}
                {lead && (
                  <Button type="button" size="sm" variant="outline" className="text-danger" onClick={() => void remove()} aria-label={t("tp.board.delete")}>
                    <Trash2 size={15} aria-hidden />
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />
      )}
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <TeamAreaView
        spaceId={boardId}
        role={myRole}
        tab={tab}
        boards={isMain ? boardRows(detail, team.id, null) : []}
        hrefFor={(next, extra) => projectLink(team.id, project.id, { board: boardId, sub: next, focus: extra?.focus })}
        itemHref={(id) => projectLink(team.id, project.id, { board: boardId, item: id })}
        focusId={focus}
        item={
          itemParam
            ? {
                itemId: itemParam,
                crumbs: [...crumbs.slice(0, -1), { label: heading, href: selfHref }],
                listHref: selfHref,
                boardHref: (id) => projectLink(team.id, project.id, { board: boardId, sub: "board", focus: id }),
                variables: detail.variables,
                fileId: board?.fileId ?? null,
              }
            : null
        }
        reviewHref={lead ? projectLink(team.id, project.id, { review: true }) : null}
        add={{
          reviewOn: detail.project.reviewDefault,
          onNewBoard: isMain ? () => setDialog("board") : undefined,
          onNewVariable: isMain ? () => setDialog("variable") : undefined,
        }}
      />

      {dialog === "info" && <ProjectInfoSheet ctx={ctx} detail={detail} onClose={() => setDialog(null)} onChanged={onChanged} onAccess={() => setDialog("access")} onSettings={() => setDialog("settings")} />}
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
      {dialog === "variable" && (
        <VariableDialog
          projectId={project.id}
          fileId={null}
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
          fileId={null}
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
