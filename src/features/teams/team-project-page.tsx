"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen } from "@/components/icons/folder-open";
import { Info } from "@/components/icons/info";
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
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteBoard, fetchProject, renameBoard, setFileReview, type ProjectDetail } from "@/lib/supabase/team-projects";
import { effectiveVariables } from "@/lib/team-projects";
import { teamLink } from "@/lib/teams";
import { canAddToArea, canReview, projectLink } from "@/lib/team-projects";
import { Breadcrumbs, DrillHeader } from "./team-drill";
import { BAND_TONE } from "./team-band";
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
import type { PathCrumb } from "./project-path-bar";
import { InviteDialog } from "./team-invites";
import type { TeamBoardConfig } from "./board/board-types";
import { boardGroupPagesOf, boardPageHref, fileBoardEntries } from "@/lib/team-board";
import { ProjectPeopleList } from "./project-people";
import { ProjectRoleChip, projectRoleLabelKey } from "./project-ui";
import { ProjectVariablesPanel } from "./project-variables";
import { TeamAreaView, type AreaBoardRow, type AreaTab } from "./team-area-view";
import type { AreaItemContext } from "./team-item-detail";
import type { BoardChoice } from "./team-add-to-board";
import { TeamReviewInbox } from "./team-review-inbox";
import type { TeamCtx } from "./team-page";
import { SectionError, TeamMark, toneClass } from "./team-ui";
import { addProjectChannel, type TeamActionError } from "@/lib/supabase/teams";
import { MuteCard, MuteChip } from "./mute-card";
import { useTeamChannelList, useTeamMutes } from "./team-chat-data";

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
  const [loadedVersion, setLoadedVersion] = useState(-1);
  const [retried, setRetried] = useState<string | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    fetchProject(projectId).then(
      (data) => {
        if (!alive) return;
        setDetail(data);
        setLoadedVersion(version);
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

  // Yeni açılan dosya/pano bellekteki eski proje verisinde yoktur ("Dosya bulunamadı" yalancısı): bulunamayınca veri BİR KEZ tazelenir, o sırada iskelet gösterilir.
  const stale = loadedVersion < version;
  const missingKey =
    state === "ready" && detail
      ? fileId
        ? detail.files.some((item) => item.id === fileId)
          ? null
          : `file:${fileId}`
        : boardId && boardId !== detail.mainAreaId && !detail.boards.some((item) => item.id === boardId) && !detail.areas?.some((item) => item.id === boardId)
          ? `board:${boardId}`
          : null
      : null;
  useEffect(() => {
    if (missingKey && retried !== missingKey && !stale) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tek seferlik veri tazeleme: yeni açılan dosya/pano eski bellekte yok
      setRetried(missingKey);
      reload();
    }
  }, [missingKey, retried, stale, reload]);

  if (state === "loading") return <Skeleton className="h-72 w-full rounded-xl" />;
  if (missingKey && (stale || retried !== missingKey)) return <Skeleton className="h-72 w-full rounded-xl" />;
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
  // Pano kipi (docs/history/367-*): `sub=board` her alanı (proje geneli, dosya ana alanı, ek pano) tam tuval olarak açar; `?item=` çekmecesi liste görünümündedir.
  if (params.get("sub") === "board" && !params.get("item")) return <BoardMode ctx={ctx} detail={detail} onChanged={reload} />;
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

/** Dosya ekranındaki pano satırları: bağımsız pano ve PANO GRUBU (grup tek satırdır, dokununca ilk panonun tuvaline gider). `fileId = null` = eski proje geneli panolar (salt okunur kalıntı). */
function boardRows(detail: ProjectDetail, teamId: string, fileId: string | null): AreaBoardRow[] {
  const entries = fileId
    ? fileBoardEntries(detail, fileId)
    : detail.boards.filter((board) => board.fileId === null).map((board) => ({ kind: "board" as const, id: board.id, title: board.title, itemCount: board.itemCount, boardCount: 1, openBoardId: board.id }));
  return entries.map((entry) => ({ id: entry.id, title: entry.title, itemCount: entry.itemCount, kind: entry.kind, boardCount: entry.boardCount, href: boardPageHref(teamId, detail.project.id, entry.openBoardId) }));
}

/** "Panoya ekle" için projenin tüm panoları (aynı dosyanınkiler pencerede öne alınır). */
function placementOf(detail: ProjectDetail, teamId: string, fileId: string | null): NonNullable<AreaItemContext["placement"]> {
  const boards: BoardChoice[] = detail.boards.map((board) => ({ id: board.id, title: board.title, fileId: board.fileId, fileTitle: detail.files.find((file) => file.id === board.fileId)?.title ?? null, itemCount: board.itemCount }));
  return { projectId: detail.project.id, fileId, boards, boardHref: (boardId, focusId) => projectLink(teamId, detail.project.id, { board: boardId, sub: "board", focus: focusId }) };
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
  onAccess,
  onSettings,
  onChanged,
}: {
  ctx: TeamCtx;
  detail: ProjectDetail;
  onClose: () => void;
  onAccess: () => void;
  onSettings: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { team } = ctx;
  const { project, myRole } = detail;
  const lead = canReview(myRole);
  // Proje sessize alma (docs/history/369-*): projenin TÜM kanallarını kapatır; ekip sessizse bunu söyler.
  const mutes = useTeamMutes(team.id);
  return (
    <SpaceDialog title={t("tp.info.projectTitle")} eyebrow={project.title} onClose={onClose} formTestId="project-info-sheet">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-small text-text-secondary">
          {t("tp.page.yourRole")} <ProjectRoleChip role={myRole} />
        </div>
        <section className="space-y-2" data-testid="project-notifications">
          <h3 className="text-body font-bold text-text">{t("th.project.notifications")}</h3>
          <MuteCard
            scope="project"
            muted={mutes.isProjectMuted(project.id)}
            teamMuted={mutes.teamMuted}
            busy={mutes.busy || !mutes.loaded}
            error={mutes.error}
            onToggle={(next) => void mutes.setProjectMuted(project.id, next)}
          />
        </section>
        <div className="flex flex-wrap gap-2">
          {detail.channelId && (
            <Link href={teamLink(team.id, "chat", { channel: detail.channelId })} className={buttonClassName({ variant: "outline", size: "sm", className: "gap-1.5" })} data-project-open-chat>
              <MessageCircle size={16} aria-hidden />
              {t("tp.page.openChat")}
            </Link>
          )}
          {lead && (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onSettings} data-project-settings>
              <Settings size={16} aria-hidden />
              {t("tp.settings.title")}
            </Button>
          )}
        </div>
        <section className="space-y-3" data-testid="project-people">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 text-body font-bold text-text">{t("tp.people.title")}</h3>
            {lead && (
              <button type="button" onClick={onAccess} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-semibold text-primary" data-project-edit-access>
                <UsersRound size={12} aria-hidden />
                {t("tp.people.edit")}
              </button>
            )}
          </div>
          <ProjectPeopleList detail={detail} lead={lead} onChanged={onChanged} />
        </section>
      </div>
    </SpaceDialog>
  );
}

function FileInfoSheet({
  teamId,
  detail,
  file,
  onClose,
  onChanged,
  onRename,
  onDelete,
}: {
  teamId: string;
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
  // Dosya sohbeti (docs/history/369-*): kendiliğinden açılmaz; lider sonradan buradan açar. Sessizliği kanalın KENDİ ayarıdır (kanal bilgisinden), burada yalnız durumu görünür.
  const channelsState = useTeamChannelList(teamId);
  const fileChannel = channelsState.channels.find((channel) => channel.fileId === file.id) ?? null;
  const createChat = async () => {
    setBusy(true);
    try {
      await addProjectChannel(project.id, { file: file.id });
      channelsState.reload();
    } catch (e) {
      show((e as TeamActionError).message);
    } finally {
      setBusy(false);
    }
  };
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
          <p className="rounded-lg border border-border-soft bg-surface p-4 text-small text-text-secondary" data-file-review-note>
            {t(file.reviewRequired ? "tp.review.noteOn" : "tp.review.noteOff")}
          </p>
        )}
        <section className="space-y-2" data-testid="file-chat-section">
          <h3 className="text-body font-bold text-text">{t("th.file.chatSection")}</h3>
          {fileChannel ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={teamLink(teamId, "chat", { channel: fileChannel.id })} className={buttonClassName({ variant: "outline", size: "sm", className: "gap-1.5" })} data-file-open-chat>
                <MessageCircle size={16} aria-hidden />
                {t("th.file.chatOpen")}
              </Link>
              <MuteChip scope={fileChannel.muteScope ?? (fileChannel.muted ? "channel" : null)} />
            </div>
          ) : lead ? (
            <div className="space-y-2">
              <p className="text-caption text-text-secondary">{t("th.file.chatNoneLead")}</p>
              <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy || !channelsState.loaded} onClick={() => void createChat()} data-file-create-chat>
                <Plus size={16} aria-hidden />
                {t("th.file.chatCreate")}
              </Button>
            </div>
          ) : (
            <p className="text-caption text-text-secondary" data-file-chat-none>
              {t("th.file.chatNone")}
            </p>
          )}
        </section>
        <ProjectVariablesPanel projectId={project.id} fileId={file.id} variables={detail.variables} role={myRole} onChanged={onChanged} />
        {lead && (
          <div className="flex flex-wrap gap-2 border-t border-border-soft pt-4">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onRename} data-file-rename>
              <Pencil size={16} aria-hidden />
              {t("tp.file.rename")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5 text-danger" onClick={onDelete} data-file-delete>
              <Trash2 size={16} aria-hidden />
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
  // Proje BOŞ doğar (docs/history/368-*): proje geneli alan/pano açılmaz. Önceki sürümden kalan veri varsa yalnız OKUNUR/açılır, silinmez.
  const sharedBoards = boardRows(detail, team.id, null);
  const legacyShared = Boolean(detail.mainAreaId) && (detail.itemCount > 0 || sharedBoards.length > 0);
  const overview = teamLink(team.id);
  const chatHref = detail.channelId ? teamLink(team.id, "chat", { channel: detail.channelId }) : null;
  const reviewOnNames = detail.files.filter((file) => file.reviewRequired).map((file) => file.title);
  const FILE_TONES = ["primary", "plum", "success", "warning"] as const;

  return (
    <div className="space-y-4" data-testid="team-project-home" data-project-id={project.id} data-project-role={myRole}>
      <DrillHeader backHref={overview} parent={`${team.name} › ${t("tp.list.title")}`} title={project.title} sub={`${t("tp.page.yourRole")} ${t(projectRoleLabelKey(myRole))}`} tone={project.tone} markName={project.title} chatHref={chatHref} onInfo={() => setDialog("info")} />
      <Breadcrumbs crumbs={[{ label: t("tc.tab.overview"), href: overview }, { label: t("tp.list.title"), href: overview }, { label: project.title }]} />

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_18.75rem] xl:items-start xl:gap-5">
        <div className="min-w-0 space-y-4">
          <header className={cn("hidden items-center gap-4 rounded-xl px-[18px] py-4 md:flex", BAND_TONE[project.tone] ?? BAND_TONE.primary)} data-project-header>
            <TeamMark name={project.title} tone={project.tone} solid size={56} className="rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-caption font-bold uppercase tracking-[0.08em] text-primary">
                {t("tp.page.kicker")} · {t("tc.proj.yourRole")}: {t(projectRoleLabelKey(myRole)).toLocaleUpperCase()}
              </p>
              <h1 className="break-words font-display text-[1.625rem] font-extrabold leading-tight text-text" data-project-title>
                {project.title}
              </h1>
            </div>
            {chatHref && (
              <Link href={chatHref} className={buttonClassName({ variant: "outline", className: "gap-2 bg-surface" })} data-project-open-chat>
                <MessageCircle size={16} aria-hidden />
                {t("tp.page.openChat")}
              </Link>
            )}
            {lead && !archived && (
              <Button type="button" onClick={() => setDialog("file")} data-project-new-file>
                {t("tp.file.new")}
              </Button>
            )}
            <button type="button" onClick={() => setDialog("info")} aria-label={t("tp.info.open")} data-path-info className="grid h-10 w-10 place-items-center rounded-full bg-surface text-primary xl:hidden">
              <Info size={20} aria-hidden />
            </button>
          </header>
          {project.description && <p className="max-w-2xl whitespace-pre-wrap break-words px-1 text-small text-text-secondary">{project.description}</p>}

          {archived && (
            <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-small text-text">
              {t("tp.page.archivedNotice")}
            </p>
          )}

          {lead && (detail.pendingCount ?? 0) > 0 && (
            <Link href={projectLink(team.id, project.id, { review: true })} className="flex min-h-12 items-center gap-3 rounded-lg border border-border-soft bg-surface px-4 py-3 text-small hover:shadow-card" data-project-review-link>
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-heart" />
              <span className="min-w-0 flex-1 font-semibold text-text">{t("tc.proj.waitingBanner", { count: detail.pendingCount ?? 0 })}</span>
              <span className="font-semibold text-primary">{t("tc.over.open")}</span>
            </Link>
          )}

          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 font-display text-h3 font-bold text-text">{t("tp.files.title")}</h2>
            {reviewOnNames.length > 0 && <span className="truncate text-small text-text-muted max-md:hidden">{t("tc.proj.reviewOn", { names: reviewOnNames.join(", ") })}</span>}
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3" data-testid="project-files">
            {legacyShared && detail.mainAreaId && (
              <li>
                <FileCard
                  href={projectLink(team.id, project.id, { board: detail.mainAreaId })}
                  title={t("tb.file.legacyTitle")}
                  meta={t("tp.home.sharedSub", { items: detail.itemCount })}
                  tone="plum"
                  attrs={{ "data-project-main-area": "" }}
                  chip={t("tc.proj.projectWide")}
                  chipTone="primary"
                />
              </li>
            )}
            {detail.files.map((file, index) => (
              <li key={file.id}>
                <FileCard
                  href={projectLink(team.id, project.id, { file: file.id })}
                  title={file.title}
                  attrs={{ "data-file-card": file.id }}
                  meta={`${t("tp.file.counts", { items: file.itemCount, boards: file.boardCount ?? 0 })} · ${t(file.reviewRequired ? "tp.file.reviewOn" : "tp.file.reviewOff")}`}
                  tone={FILE_TONES[index % FILE_TONES.length]}
                  chip={lead && (file.pendingCount ?? 0) > 0 ? t("tc.proj.filePending", { count: file.pendingCount ?? 0 }) : file.reviewRequired ? undefined : t("tc.proj.directPublish")}
                  chipTone={lead && (file.pendingCount ?? 0) > 0 ? "warning" : "neutral"}
                />
              </li>
            ))}
            {lead && !archived && (
              <li className="max-md:hidden">
                <button type="button" onClick={() => setDialog("file")} className="grid min-h-[11rem] w-full place-items-center rounded-lg border border-dashed border-border text-small font-semibold text-text-muted hover:bg-surface-soft" data-project-new-file-card>
                  + {t("tp.file.new")}
                </button>
              </li>
            )}
          </ul>
          {detail.files.length === 0 && <p className="rounded-xl border border-dashed border-border-soft p-5 text-small text-text-muted">{t(lead ? "tp.files.emptyLead" : "tp.files.empty")}</p>}

          {legacyShared && sharedBoards.length > 0 && (
            <>
              <h2 className="font-display text-h3 font-bold text-text">{t("tc.proj.boards")}</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-3" data-testid="project-boards">
                {sharedBoards.map((board) => (
                  <li key={board.id}>
                    <Link href={board.href} className="block rounded-lg border border-border-soft bg-surface px-4 py-3 hover:shadow-card" data-project-board={board.id}>
                      <span className="block truncate font-bold text-text">{board.title}</span>
                      <span className="block text-caption text-text-muted">{t("tp.board.items", { count: board.itemCount })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <aside className="mt-4 hidden gap-3 md:grid md:grid-cols-2 xl:mt-0 xl:block xl:space-y-4" data-testid="project-side">
          <section className="rounded-lg border border-border-soft bg-surface p-4" data-testid="project-people">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="min-w-0 flex-1 font-display text-body font-bold text-text">{t("tp.people.title")}</h3>
              {lead && (
                <button type="button" onClick={() => setDialog("access")} className="text-small font-semibold text-primary" data-project-edit-access>
                  {t("tc.proj.edit")}
                </button>
              )}
            </div>
            <ProjectPeopleList detail={detail} lead={lead} onChanged={onChanged} />
          </section>
        </aside>
      </div>

      {lead && !archived && (
        <div className="md:hidden">
          <FloatingAction onClick={() => setDialog("file")} label={t("tp.file.new")} attrs={{ "data-project-new-file-phone": "" }} />
        </div>
      )}

      {dialog === "info" && (
        <ProjectInfoSheet ctx={ctx} detail={detail} onClose={() => setDialog(null)} onAccess={() => setDialog("access")} onSettings={() => setDialog("settings")} onChanged={onChanged} />
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

/** Dosya kartı (mockup B2): üstte tonlu mini kolaj, altta ad · özet · durum çipi. */
function FileCard({ href, title, meta, tone, chip, chipTone, attrs }: { href: string; title: string; meta: string; tone: string; chip?: string; chipTone: "primary" | "warning" | "neutral"; attrs?: Record<string, string> }) {
  return (
    <Link href={href} className="flex overflow-hidden rounded-lg border border-border-soft bg-surface transition-shadow hover:shadow-card-hover max-sm:flex-row sm:flex-col" data-project-file-card {...attrs}>
      <span aria-hidden className={cn("grid shrink-0 grid-cols-2 gap-1.5 p-2.5 max-sm:w-24 sm:h-[4.5rem] sm:grid-cols-3 md:h-24", toneClass(tone))}>
        <span className="rounded-lg bg-current" />
        <span className="rounded-lg bg-surface" />
        <span className="rounded-lg bg-current opacity-45" />
        <span className="rounded-lg bg-surface/60 sm:hidden" />
      </span>
      <span className="block min-w-0 flex-1 p-3 md:px-4 md:py-3">
        <span className="block truncate text-body font-bold text-text">{title}</span>
        <span className="block text-small text-text-secondary max-sm:line-clamp-2 sm:truncate">{meta}</span>
        {chip && (
          <span className={cn("mt-2 inline-flex h-6 items-center rounded-full px-2.5 text-caption font-bold", chipTone === "warning" ? "bg-warning/10 text-warning" : chipTone === "primary" ? "bg-primary-soft text-primary" : "bg-surface-soft text-text-secondary")}>
            {chip}
          </span>
        )}
      </span>
    </Link>
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
  const overview = teamLink(team.id);
  const lead = canReview(myRole);
  const { node: toastNode, show } = useToast();
  const [reviewBusy, setReviewBusy] = useState(false);
  const toggleReview = async (on: boolean) => {
    setReviewBusy(true);
    try {
      const left = await setFileReview(file.id, on);
      if (!on && left > 0) show(t("tp.review.turnedOffLeft", { count: left }));
      onChanged();
    } catch (e) {
      show((e as TeamActionError).message);
    } finally {
      setReviewBusy(false);
    }
  };
  const variableNames = effectiveVariables(detail.variables, file.id).map((variable) => variable.name);
  const itemCrumbs = [teamCrumb(ctx), { label: project.title, href: projectLink(team.id, project.id) }, { label: file.title, href: fileHref }];

  return (
    <div className="space-y-4" data-testid="team-file-page" data-file-id={file.id} data-project-role={myRole}>
      <DrillHeader backHref={tab ? fileHref : projectLink(team.id, project.id)} parent={project.title} title={file.title} tone={project.tone} onInfo={() => setDialog("info")} />
      <Breadcrumbs crumbs={[{ label: t("tc.tab.overview"), href: overview }, { label: project.title, href: projectLink(team.id, project.id) }, { label: file.title }]} />
      <div className="hidden items-center gap-3 md:flex">
        <h1 className="min-w-0 flex-1 break-words font-display text-[1.625rem] font-extrabold leading-tight text-text" data-file-title>
          {file.title}
        </h1>
        <button type="button" onClick={() => setDialog("info")} aria-label={t("tp.info.open")} data-path-info className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-secondary hover:bg-surface-soft">
          <Info size={18} aria-hidden />
        </button>
      </div>
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
                  crumbs: itemCrumbs,
                  listHref: fileHref,
                  boardHref: (id) => projectLink(team.id, project.id, { file: file.id, sub: "board", focus: id }),
                  onBoard: false,
                  variables: detail.variables,
                  fileId: file.id,
                  drawer: true,
                  placement: placementOf(detail, team.id, file.id),
                }
              : null
          }
          reviewHref={lead ? projectLink(team.id, project.id, { review: true }) : null}
          add={{
            reviewOn: file.reviewRequired,
            reviewSwitch: lead ? { busy: reviewBusy, onChange: (on) => void toggleReview(on) } : null,
            variableNames,
            onVariables: () => setDialog("info"),
            onNewBoard: () => setDialog("board"),
            onNewVariable: () => setDialog("variable"),
            content: { projectId: project.id, fileId: file.id },
            placement: placementOf(detail, team.id, file.id),
          }}
        />
      ) : (
        <SectionError message={t("tp.area.missing")} />
      )}
      {toastNode}

      {dialog === "info" && (
        <FileInfoSheet teamId={ctx.team.id} detail={detail} file={file} onClose={() => setDialog(null)} onChanged={onChanged} onRename={() => setDialog("rename")} onDelete={() => setDialog("delete")} />
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
          fromBoard={null}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            onChanged();
            router.push(boardPageHref(team.id, project.id, id));
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
  const [dialog, setDialog] = useState<null | "info" | "access" | "settings">(null);
  const known = isMain || Boolean(board);
  // Dosyanın bir panosu artık doğrudan tuvalde açılır (öğeler dosyanın listesindedir); eski liste adresleri tuvale yönlenir.
  const redirectToCanvas = Boolean(board) && !isMain && !tab && !itemParam;
  useEffect(() => {
    if (redirectToCanvas) router.replace(boardPageHref(team.id, project.id, boardId), { scroll: false });
  }, [redirectToCanvas, router, team.id, project.id, boardId]);
  if (redirectToCanvas) return <Skeleton className="h-72 w-full rounded-xl" />;

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

  const overview = teamLink(team.id);
  return (
    <div className="space-y-4" data-testid="team-board-page" data-board-id={boardId} data-project-role={myRole}>
      <DrillHeader backHref={tab ? selfHref : parentHref} parent={fileOfBoard ? `${project.title} › ${fileOfBoard.title}` : project.title} title={heading} tone={project.tone} onInfo={() => setDialog("info")} />
      <Breadcrumbs crumbs={[{ label: t("tc.tab.overview"), href: overview }, { label: project.title, href: projectLink(team.id, project.id) }, ...(fileOfBoard ? [{ label: fileOfBoard.title, href: parentHref }] : []), { label: heading }]} />
      {renaming ? (
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
        <div className="hidden items-center gap-3 md:flex">
          <h1 className="min-w-0 flex-1 break-words font-display text-[1.625rem] font-extrabold leading-tight text-text" data-board-title>
            {heading}
          </h1>
          {!isMain && canAddToArea(myRole) && (
            <Button type="button" size="sm" variant="outline" onClick={() => setRenaming(true)} aria-label={t("tp.board.rename")}>
              <Pencil size={16} aria-hidden />
            </Button>
          )}
          {!isMain && lead && (
            <Button type="button" size="sm" variant="outline" className="text-danger" onClick={() => void remove()} aria-label={t("tp.board.delete")}>
              <Trash2 size={16} aria-hidden />
            </Button>
          )}
          <button type="button" onClick={() => setDialog("info")} aria-label={t("tp.info.open")} data-path-info className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-secondary hover:bg-surface-soft">
            <Info size={18} aria-hidden />
          </button>
        </div>
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
        mainBoardRow
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
                onBoard: !isMain,
                variables: detail.variables,
                fileId: board?.fileId ?? null,
                drawer: true,
                placement: placementOf(detail, team.id, null),
              }
            : null
        }
        reviewHref={lead ? projectLink(team.id, project.id, { review: true }) : null}
        add={{
          reviewOn: detail.project.reviewDefault,
          content: board?.fileId ? { projectId: project.id, fileId: board.fileId, boardId } : undefined,
        }}
      />

      {dialog === "info" && <ProjectInfoSheet ctx={ctx} detail={detail} onClose={() => setDialog(null)} onAccess={() => setDialog("access")} onSettings={() => setDialog("settings")} onChanged={onChanged} />}
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
// Pano kipi (docs/history/367-*): tam tuval + yüzen araç çubukları; üst bant/sekmeler gizlenir, telefonda alt menü yerinde kalır
// ---------------------------------------------------------------------------------------------------------------------------------------
function BoardMode({ ctx, detail, onChanged }: { ctx: TeamCtx; detail: ProjectDetail; onChanged: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const { team } = ctx;
  const { project, myRole } = detail;
  const [dialog, setDialog] = useState<null | "info" | "access" | "settings" | "invite">(null);
  const fileParam = params.get("file");
  const boardParam = params.get("board");
  const focus = params.get("focus") || null;
  const comment = params.get("comment") || null;

  // Açılacak alan: `board=` (her alan) › dosyanın ana alanı › projenin ana alanı.
  const fileOfParam = fileParam ? detail.files.find((file) => file.id === fileParam) : null;
  const areaId = boardParam ?? fileOfParam?.mainAreaId ?? detail.mainAreaId;
  const area = detail.areas?.find((item) => item.id === areaId);
  const scopeFile = area ? (area.fileId ? (detail.files.find((file) => file.id === area.fileId) ?? null) : null) : (detail.files.find((file) => file.mainAreaId === areaId) ?? fileOfParam ?? null);
  const scopeFileId = scopeFile?.id ?? null;
  const mainTitle = scopeFile?.title ?? t("tp.area.projectWide");
  // Pano değiştirici YALNIZ açık panonun grubunu gösterir (docs/history/368-*); bağımsız pano tek sayfadır.
  const pages = areaId ? boardGroupPagesOf(detail, areaId, mainTitle) : [];
  const current = pages.find((page) => page.id === areaId);
  const groupId = current?.groupId ?? null;
  const groupTitle = groupId ? (detail.groups?.find((group) => group.id === groupId)?.title ?? null) : null;
  const backHref = scopeFile ? projectLink(team.id, project.id, { file: scopeFile.id }) : projectLink(team.id, project.id);
  const lead = canReview(myRole);

  const config = useMemo<TeamBoardConfig | null>(() => {
    if (!current || !areaId) return null;
    return {
      teamId: team.id,
      teamName: team.name,
      projectId: project.id,
      projectTitle: project.title,
      fileId: scopeFileId,
      fileTitle: scopeFile?.title ?? null,
      role: myRole,
      pages,
      currentId: areaId,
      mainTitle,
      groupId,
      groupTitle,
      people: detail.people,
      archived: Boolean(project.archivedAt),
      accessMode: project.accessMode === "all" ? "all" : "selected",
      canInvite: ctx.can("manage_members") && team.myRole !== "guest",
      onInvite: () => setDialog("invite"),
      canEditAccess: lead,
      onEditAccess: () => setDialog("access"),
      onInfo: () => setDialog("info"),
      openComment: comment,
      backHref,
      hrefOf: (id: string) => boardPageHref(team.id, project.id, id),
      navigate: (href: string, mode = "push") => (mode === "replace" ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false })),
      reload: onChanged,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yapılandırma yalnız bu girdilerle yeniden kurulur; ctx.can/router kararlıdır
  }, [current, areaId, team.id, team.name, team.myRole, project, scopeFileId, scopeFile?.title, myRole, pages, mainTitle, groupId, groupTitle, detail.people, comment, backHref, lead, onChanged]);

  if (!areaId || !current || !config) {
    return <EmptyState icon={Presentation} title={t("tp.board.missing")} action={{ label: t("tp.page.back"), href: projectLink(team.id, project.id) }} />;
  }

  return (
    <div data-testid="team-board-mode" data-board-id={areaId} data-project-role={myRole}>
      <TeamAreaView key={areaId} spaceId={areaId} role={myRole} tab="board" hrefFor={(_next, extra) => boardPageHref(team.id, project.id, areaId) + (extra?.focus ? `&focus=${extra.focus}` : "")} focusId={focus} team={config} />
      {dialog === "info" && <ProjectInfoSheet ctx={ctx} detail={detail} onClose={() => setDialog(null)} onAccess={() => setDialog("access")} onSettings={() => setDialog("settings")} onChanged={onChanged} />}
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
      {dialog === "invite" && <InviteDialog ctx={ctx} onClose={() => setDialog(null)} onDone={() => undefined} />}
    </div>
  );
}
