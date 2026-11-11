"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "@/components/icons/chevron-down";
import { Copy } from "@/components/icons/copy";
import { Ellipsis } from "@/components/icons/ellipsis";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { Check } from "@/components/icons/check";
import { ChevronLeft } from "@/components/icons/chevron-left";
import { Pencil } from "@/components/icons/pencil";
import { Plus } from "@/components/icons/plus";
import { Trash2 } from "@/components/icons/trash-2";
import { ArrowUp } from "@/components/icons/arrow-up";
import { ArrowDown } from "@/components/icons/arrow-down";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { useToast } from "@/features/groups/use-toast";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { SpaceMenu } from "@/features/spaces/space-menu";
import { NewBoardDialog } from "@/features/teams/project-dialogs";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteBoard, renameBoard, renameBoardGroup } from "@/lib/supabase/team-projects";
import { duplicateBoard, fetchBoardThumb, reorderBoards, type ThumbItem } from "@/lib/supabase/team-board";
import { moveBoardId, type BoardPageInfo } from "@/lib/team-board";
import { canAddToArea, canReview } from "@/lib/team-projects";
import { formatRelativeTime, cn } from "@/lib/utils";
import { BoardPopover } from "./board-popover";
import type { TeamBoardConfig } from "./board-types";

/**
 * Pano grubu arayüzü (docs/history/367-*): sayfa değiştirici (masaüstü/telefon açılır liste, tablet çekmece), "Tüm panolara bak" genel bakışı,
 * her panonun ⋯ menüsü (yeniden adlandır, çoğalt, sırala, kaldır). Her pano ayrı tuval: öğeler karışmaz.
 */

// ---------------------------------------------------------------------------------------------
// Küçük resim
// ---------------------------------------------------------------------------------------------

const THUMB_FILL: Record<string, string> = {
  frame: "fill-surface stroke-border-strong",
  note: "fill-warning/35",
  prompt: "fill-primary/25",
  image: "fill-secondary/35",
  palette: "fill-success/35",
  text: "fill-text-muted/45",
  shape: "fill-text-muted/35",
  content: "fill-primary/20",
};

/** Bir panonun öğe kutularından çizilen sade küçük resim (yalnız konum ve tür; görsel yüklenmez). */
export function BoardThumb({ spaceId, className }: { spaceId: string; className?: string }) {
  const [items, setItems] = useState<ThumbItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchBoardThumb(spaceId).then(
      (list) => alive && setItems(list),
      () => alive && setItems([]),
    );
    return () => {
      alive = false;
    };
  }, [spaceId]);
  const frame = (content: React.ReactNode) => (
    <span className={cn("block overflow-hidden rounded-[10px] border border-border-soft bg-surface-soft", className)} data-board-thumb={spaceId}>
      {content}
    </span>
  );
  if (items === null) return frame(<span className="skeleton-shimmer block h-full w-full" />);
  if (items.length === 0) return frame(<span className="block h-full w-full" />);
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  const maxY = Math.max(...items.map((i) => i.y + i.h));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.06;
  return frame(
    <svg viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full" aria-hidden>
      {items.map((item, index) => (
        <rect key={index} x={item.x} y={item.y} width={item.w} height={item.h} rx={Math.min(item.w, item.h) * 0.06} strokeWidth={(maxX - minX) * 0.004} className={THUMB_FILL[item.kind] ?? "fill-text-muted/30"} />
      ))}
    </svg>,
  );
}

// ---------------------------------------------------------------------------------------------
// Eylemler (hepsi tek kancada: pencereler + gezinme)
// ---------------------------------------------------------------------------------------------

export interface PageActions {
  canEdit: boolean;
  /** "Yeni pano" yalnız bir panonun yanına (ya da dosyada bağımsız) eklenir; eski ana alandan grup kurulmaz. */
  canCreate: boolean;
  renameGroup: () => void;
  canLead: boolean;
  busy: boolean;
  open: (id: string) => void;
  create: () => void;
  rename: (page: BoardPageInfo) => void;
  duplicate: (page: BoardPageInfo) => void;
  move: (page: BoardPageInfo, delta: -1 | 1) => void;
  remove: (page: BoardPageInfo) => void;
}

export function usePageActions(team: TeamBoardConfig): { actions: PageActions; nodes: React.ReactNode } {
  const { t } = useTranslation();
  const { node: toastNode, show } = useToast();
  const [dialog, setDialog] = useState<null | { kind: "create" } | { kind: "renameGroup" } | { kind: "rename"; page: BoardPageInfo } | { kind: "delete"; page: BoardPageInfo }>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = canAddToArea(team.role) && !team.archived;
  const canLead = canReview(team.role) && !team.archived;
  const extras = team.pages.filter((page) => !page.isMain);
  const currentPage = team.pages.find((page) => page.id === team.currentId);
  const canCreate = canEdit && Boolean(currentPage) && (!currentPage?.isMain || team.fileId !== null);

  const guard = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      show(e instanceof Error ? e.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const actions: PageActions = {
    canEdit,
    canCreate,
    renameGroup: () => setDialog({ kind: "renameGroup" }),
    canLead,
    busy,
    open: (id) => team.navigate(team.hrefOf(id), "replace"),
    create: () => setDialog({ kind: "create" }),
    rename: (page) => setDialog({ kind: "rename", page }),
    duplicate: (page) =>
      void guard(async () => {
        show(t("tb.pages.duplicating"));
        const id = await duplicateBoard({ projectId: team.projectId, fileId: team.fileId, fromSpace: page.id, title: page.title, suffix: t("tb.pages.copySuffix"), asBoard: !page.isMain });
        team.reload();
        team.navigate(team.hrefOf(id), "push");
      }),
    move: (page, delta) =>
      void guard(async () => {
        const ids = moveBoardId(extras.map((p) => p.id), page.id, delta);
        await reorderBoards(team.projectId, team.fileId, ids);
        team.reload();
      }),
    remove: (page) => setDialog({ kind: "delete", page }),
  };

  const nodes = (
    <>
      {dialog?.kind === "create" && (
        <NewBoardDialog
          projectId={team.projectId}
          fileId={team.fileId}
          fromBoard={currentPage && !currentPage.isMain ? currentPage.id : null}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            team.reload();
            team.navigate(team.hrefOf(id), "push");
          }}
        />
      )}
      {dialog?.kind === "renameGroup" && team.groupId && (
        <RenameGroupDialog groupId={team.groupId} title={team.groupTitle ?? ""} onClose={() => setDialog(null)} onDone={() => { setDialog(null); team.reload(); }} />
      )}
      {dialog?.kind === "rename" && <RenamePageDialog page={dialog.page} onClose={() => setDialog(null)} onDone={() => { setDialog(null); team.reload(); }} />}
      {dialog?.kind === "delete" && (
        <DeletePageDialog
          page={dialog.page}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            team.reload();
            if (dialog.page.id === team.currentId) team.navigate(team.hrefOf(team.pages[0]?.id ?? team.currentId), "replace");
          }}
        />
      )}
      {toastNode}
    </>
  );
  return { actions, nodes };
}

function RenameGroupDialog({ groupId, title: initial, onClose, onDone }: { groupId: string; title: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SpaceDialog
      title={t("tb.group.renameTitle")}
      onClose={onClose}
      busy={busy}
      formTestId="board-group-rename"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) return setError(t("tp.error.titleRequired"));
        setBusy(true);
        try {
          await renameBoardGroup(groupId, title.trim());
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("spaces.error.generic"));
          setBusy(false);
        }
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <label className="block space-y-1.5">
        <span className="text-small font-semibold text-text">{t("tb.group.name")}</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-body" />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
    </SpaceDialog>
  );
}

function RenamePageDialog({ page, onClose, onDone }: { page: BoardPageInfo; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(page.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SpaceDialog
      title={t("tb.pages.renameTitle")}
      onClose={onClose}
      busy={busy}
      formTestId="board-page-rename"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) return setError(t("tp.error.titleRequired"));
        setBusy(true);
        try {
          await renameBoard(page.id, title.trim());
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("spaces.error.generic"));
          setBusy(false);
        }
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <label className="block space-y-1.5">
        <span className="text-small font-semibold text-text">{t("tb.pages.name")}</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-body" />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
    </SpaceDialog>
  );
}

function DeletePageDialog({ page, onClose, onDone }: { page: BoardPageInfo; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SpaceDialog
      title={t("tb.pages.deleteTitle")}
      onClose={onClose}
      busy={busy}
      formTestId="board-page-delete"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await deleteBoard(page.id);
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("spaces.error.generic"));
          setBusy(false);
        }
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="danger" disabled={busy}>
            {t("tb.pages.deleteConfirm")}
          </Button>
        </>
      }
    >
      <p className="text-body text-text-secondary">{t("tb.pages.deleteBody", { name: page.title, count: page.itemCount })}</p>
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
    </SpaceDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Pano satırı + liste
// ---------------------------------------------------------------------------------------------

function pageMeta(page: BoardPageInfo, t: ReturnType<typeof useTranslation>["t"], language: "tr" | "en"): string {
  const parts = [t("tb.pages.itemCount", { count: page.itemCount })];
  if (page.pendingCount) parts.push(t("tb.pages.pending", { count: page.pendingCount }));
  if (page.openComments) parts.push(t("tb.pages.comments", { count: page.openComments }));
  if (page.updatedAt && parts.length < 3) parts.push(formatRelativeTime(page.updatedAt, language));
  return parts.join(" · ");
}

function PageMenu({ page, index, extrasCount, actions }: { page: BoardPageInfo; index: number; extrasCount: number; actions: PageActions }) {
  const { t } = useTranslation();
  const extraIndex = index - 1;
  const items = [
    { key: "rename", label: t("tb.pages.rename"), icon: Pencil, onSelect: () => actions.rename(page), hidden: !actions.canEdit || page.isMain },
    { key: "duplicate", label: t("tb.pages.duplicate"), icon: Copy, onSelect: () => actions.duplicate(page), hidden: !actions.canEdit },
    { key: "up", label: t("tb.pages.moveUp"), icon: ArrowUp, onSelect: () => actions.move(page, -1), hidden: !actions.canEdit || page.isMain || extraIndex <= 0 },
    { key: "down", label: t("tb.pages.moveDown"), icon: ArrowDown, onSelect: () => actions.move(page, 1), hidden: !actions.canEdit || page.isMain || extraIndex >= extrasCount - 1 },
    { key: "delete", label: t("tb.pages.delete"), icon: Trash2, danger: true, onSelect: () => actions.remove(page), hidden: !actions.canLead || page.isMain },
  ];
  if (items.every((item) => item.hidden)) return null;
  return <SpaceMenu label={t("tb.pages.options")} trigger={<Ellipsis size={18} aria-hidden />} items={items} />;
}

export function PageRows({ team, actions, onPicked, thumbClass = "h-9 w-14" }: { team: TeamBoardConfig; actions: PageActions; onPicked?: () => void; thumbClass?: string }) {
  const { t, language } = useTranslation();
  const extrasCount = team.pages.filter((page) => !page.isMain).length;
  return (
    <ul className="space-y-0.5" data-testid="board-pages-list">
      {team.pages.map((page, index) => {
        const current = page.id === team.currentId;
        return (
          <li key={page.id} data-board-page={page.id} data-board-page-current={current ? "" : undefined} className={cn("flex items-center gap-1 rounded-xl pr-1", current && "bg-primary-soft/60")}>
            <button
              type="button"
              onClick={() => {
                onPicked?.();
                if (!current) actions.open(page.id);
              }}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left"
            >
              <BoardThumb spaceId={page.id} className={cn("shrink-0", thumbClass)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-bold text-text">{page.title}</span>
                <span className="block truncate text-caption text-text-secondary">{pageMeta(page, t, language)}</span>
              </span>
              {current && <Check size={18} className="shrink-0 text-primary" strokeWidth={2.6} aria-label={t("tb.pages.current")} />}
            </button>
            <PageMenu page={page} index={index} extrasCount={extrasCount} actions={actions} />
          </li>
        );
      })}
    </ul>
  );
}

function PageFooterActions({ actions, onOverview, onClosed }: { actions: PageActions; onOverview: () => void; onClosed: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-1 space-y-0.5 border-t border-border-soft pt-1.5">
      {actions.canCreate && (
        <button
          type="button"
          onClick={() => {
            onClosed();
            actions.create();
          }}
          data-board-page-new=""
          className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-small font-bold text-primary hover:bg-surface-soft"
        >
          <Plus size={19} strokeWidth={2.4} aria-hidden />
          {t("tb.pages.new")}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          onClosed();
          onOverview();
        }}
        data-board-overview-open=""
        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-small font-semibold text-text hover:bg-surface-soft"
      >
        <LayoutGrid size={19} aria-hidden />
        {t("tb.pages.all")}
      </button>
    </div>
  );
}

/** Masaüstü ve telefonda pano adının altına açılan liste. */
export function PagesPopover({ anchorRef, team, actions, onClose, onOverview }: { anchorRef: RefObject<HTMLElement | null>; team: TeamBoardConfig; actions: PageActions; onClose: () => void; onOverview: () => void }) {
  const { t } = useTranslation();
  return (
    <BoardPopover anchorRef={anchorRef} onClose={onClose} width={348} label={t("tb.pages.title")}>
      <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-1">
        <span className="min-w-0 truncate text-caption font-bold uppercase tracking-[0.06em] text-text-muted" data-board-group-name="">{t("tb.pages.groupLabel", { name: team.groupTitle ?? team.fileTitle ?? team.projectTitle })}</span>
        <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption font-bold text-text-secondary">{team.pages.length}</span>
        {team.groupId && actions.canEdit && (
          <button type="button" onClick={() => { onClose(); actions.renameGroup(); }} aria-label={t("tb.group.rename")} data-board-group-rename="" className="ml-auto grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-surface-soft">
            <Pencil size={15} aria-hidden />
          </button>
        )}
      </div>
      <PageRows team={team} actions={actions} onPicked={onClose} />
      <PageFooterActions actions={actions} onOverview={onOverview} onClosed={onClose} />
    </BoardPopover>
  );
}

/** Tablette soldan açılan çekmece. */
export function PagesDrawer({ team, actions, onClose, onOverview }: { team: TeamBoardConfig; actions: PageActions; onClose: () => void; onOverview: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-40" data-testid="board-pages-drawer">
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="absolute inset-0 bg-black/35" />
      <aside role="dialog" aria-label={t("tb.pages.title")} className="absolute inset-y-0 left-0 flex w-[21rem] max-w-[85%] flex-col border-r border-border-soft bg-surface shadow-pop animate-fade-in">
        <header className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
          <h2 className="font-display text-h3 font-extrabold text-text">{t("tb.pages.title")}</h2>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption font-bold text-text-secondary">{team.pages.length}</span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-soft">
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex items-center gap-2 px-1 pb-1.5">
            <p className="min-w-0 flex-1 truncate text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{t("tb.pages.groupLabel", { name: team.groupTitle ?? team.fileTitle ?? team.projectTitle })}</p>
            {team.groupId && actions.canEdit && (
              <button type="button" onClick={() => { onClose(); actions.renameGroup(); }} aria-label={t("tb.group.rename")} className="grid h-8 w-8 place-items-center rounded-full text-text-secondary hover:bg-surface-soft">
                <Pencil size={15} aria-hidden />
              </button>
            )}
          </div>
          <PageRows team={team} actions={actions} onPicked={onClose} thumbClass="h-16 w-24" />
        </div>
        <div className="space-y-2 border-t border-border-soft p-3">
          {actions.canCreate && (
            <Button type="button" onClick={() => { onClose(); actions.create(); }} className="h-11 w-full gap-2 rounded-full" data-board-page-new="">
              <Plus size={18} aria-hidden />
              {t("tb.pages.new")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => { onClose(); onOverview(); }} className="h-11 w-full gap-2 rounded-full" data-board-overview-open="">
            <LayoutGrid size={18} aria-hidden />
            {t("tb.pages.all")}
          </Button>
        </div>
      </aside>
    </div>
  );
}

/** Araç çubuğundaki pano düğmesi: sayaç + (geniş ekranda) ad + ok. */
export function PagesButton({ buttonRef, team, open, onClick, compact }: { buttonRef: RefObject<HTMLButtonElement | null>; team: TeamBoardConfig; open: boolean; onClick: () => void; compact: boolean }) {
  const { t } = useTranslation();
  const current = team.pages.find((page) => page.id === team.currentId);
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={t("tb.pages.title")}
      data-board-pages-button=""
      className={cn("flex h-10 shrink-0 items-center gap-2 rounded-[11px] px-2.5 text-text hover:bg-surface-soft", open && "bg-surface-soft")}
    >
      <span className="grid h-[1.375rem] min-w-[1.375rem] place-items-center rounded-full bg-surface-soft px-1.5 text-caption font-bold text-text-secondary">{team.pages.length}</span>
      {!compact && <span className="max-w-[11rem] truncate text-small font-semibold" data-board-page-name="">{current?.title ?? team.mainTitle}</span>}
      <ChevronDown size={15} className="text-text-muted" aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Genel bakış
// ---------------------------------------------------------------------------------------------

export function PagesOverview({ team, actions, onClose }: { team: TeamBoardConfig; actions: PageActions; onClose: () => void }) {
  const { t, language } = useTranslation();
  const extrasCount = team.pages.filter((page) => !page.isMain).length;
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background" data-testid="board-overview">
      <header className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-3 pt-4 md:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-h2 font-extrabold text-text">{t("tb.overview.title")}</h2>
          <p className="text-small text-text-secondary">{t("tb.overview.sub", { count: team.pages.length })}</p>
        </div>
        <Button type="button" variant="outline" onClick={onClose} className="h-11 gap-1.5 rounded-full" data-board-overview-close="">
          <ChevronLeft size={18} aria-hidden />
          {t("tb.overview.back")}
        </Button>
        {actions.canCreate && (
          <Button type="button" onClick={actions.create} className="h-11 gap-1.5 rounded-full" data-board-page-new="">
            <Plus size={18} aria-hidden />
            {t("tb.pages.new")}
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-6">
        <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {team.pages.map((page, index) => {
            const current = page.id === team.currentId;
            return (
              <li key={page.id} data-board-page={page.id} className={cn("space-y-2.5 rounded-2xl bg-surface p-2.5 md:p-3", current ? "border-2 border-primary" : "border border-border-soft")}>
                <button type="button" onClick={() => { onClose(); if (!current) actions.open(page.id); }} className="block w-full" aria-label={t("tb.overview.open", { name: page.title })}>
                  <BoardThumb spaceId={page.id} className="h-28 w-full md:h-44" />
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-bold text-text">{page.title}</span>
                    <span className="block truncate text-caption text-text-secondary">{pageMeta(page, t, language)}</span>
                  </span>
                  {current && <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[0.6875rem] font-bold text-primary">{t("tb.overview.open.chip")}</span>}
                  <PageMenu page={page} index={index} extrasCount={extrasCount} actions={actions} />
                </div>
              </li>
            );
          })}
          {actions.canCreate && (
            <li>
              <button type="button" onClick={actions.create} className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border text-small font-bold text-text-secondary hover:bg-surface-soft">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary">
                  <Plus size={22} strokeWidth={2.4} aria-hidden />
                </span>
                {t("tb.pages.new")}
              </button>
            </li>
          )}
        </ul>
        <p className="mt-4 rounded-xl border border-primary/25 bg-primary-soft px-3.5 py-3 text-small text-text-secondary">{t("tb.overview.note")}</p>
      </div>
    </div>
  );
}

/** Sayfa değiştiriciyi ve genel bakışı tek yerde yöneten küçük durum kancası. */
export function usePagesUi(phone: boolean, tablet: boolean) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return { menuOpen, setMenuOpen, overview, setOverview, buttonRef, drawer: tablet && !phone };
}
