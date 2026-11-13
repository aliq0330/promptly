"use client";

import { useId, useState, type ReactNode, type RefObject } from "react";
import { Check } from "@/components/icons/check";
import { Keyboard } from "@/components/icons/keyboard";
import { Map as MapIcon } from "@/components/icons/map";
import { Maximize } from "@/components/icons/maximize";
import { Maximize2 } from "@/components/icons/maximize-2";
import { Minimize2 } from "@/components/icons/minimize-2";
import { Minus } from "@/components/icons/minus";
import { Plus } from "@/components/icons/plus";
import { Redo2 } from "@/components/icons/redo-2";
import { Search } from "@/components/icons/search";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { Undo2 } from "@/components/icons/undo-2";
import { Crosshair } from "@/components/icons/crosshair";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { createBoard, createBoardInGroup } from "@/lib/supabase/team-projects";
import { cn } from "@/lib/utils";
import { BoardThumb } from "./board-pages";
import { BoardPopover, PopoverRow } from "./board-popover";
import type { TeamBoardConfig } from "./board-types";

/** Telefonda alttan açılan sayfa (Modal `sheet`): kendi kartını çizer, yüksekliği %75'i geçmez (Modal sınırlar). */
export function BoardSheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <Modal variant="sheet" onClose={onClose} labelledBy={id}>
      <div data-board-sheet="" className="flex w-full flex-col overflow-hidden rounded-t-xl border border-border-soft bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        <h2 id={id} className={title ? "px-5 pb-2 text-caption font-bold uppercase tracking-[0.06em] text-text-muted" : "sr-only"}>
          {title ?? "·"}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">{children}</div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Ekle menüsü
// ---------------------------------------------------------------------------------------------

export interface AddRow {
  key: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  tag?: string;
  run: () => void;
  hidden?: boolean;
}

export function AddMenuBody({ promptly, drawing, onDone, columns }: { promptly: AddRow[]; drawing: AddRow[]; onDone: () => void; columns: boolean }) {
  const { t } = useTranslation();
  const group = (title: string, rows: AddRow[]) => (
    <div className="min-w-0 flex-1 space-y-0.5">
      <p className="px-2.5 pb-1 pt-1 text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{title}</p>
      {rows
        .filter((row) => !row.hidden)
        .map((row) => (
          <PopoverRow
            key={row.key}
            icon={row.icon}
            label={row.label}
            hint={columns ? row.hint : undefined}
            tag={row.tag}
            testId={`board-add-${row.key}`}
            onClick={() => {
              onDone();
              row.run();
            }}
          />
        ))}
    </div>
  );
  return (
    <div data-testid="board-add-menu" className={cn("gap-2", columns ? "flex" : "space-y-2")}>
      {group(t("tb.add.promptly"), promptly)}
      {columns && <span aria-hidden className="w-px bg-border-soft" />}
      {group(t("tb.add.drawing"), drawing)}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Yakınlaştırma menüsü
// ---------------------------------------------------------------------------------------------

export interface ZoomMenuProps {
  zoom: number;
  editable: boolean;
  hasSelection: boolean;
  guides: boolean;
  minimap: boolean;
  fullscreen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onFitSelection: () => void;
  onPreset: (zoom: number) => void;
  onGuides: () => void;
  onMinimap: () => void;
  onSearch: () => void;
  onShortcuts: () => void;
  onFullscreen: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

export function ZoomMenuBody({ props, onDone }: { props: ZoomMenuProps; onDone: () => void }) {
  const { t } = useTranslation();
  const row = (key: string, icon: ReactNode, label: string, run: () => void, opts: { disabled?: boolean; checked?: boolean; keep?: boolean } = {}) => (
    <button
      key={key}
      type="button"
      disabled={opts.disabled}
      data-testid={`board-zoom-${key}`}
      onClick={() => {
        run();
        if (!opts.keep) onDone();
      }}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body font-semibold text-text hover:bg-surface-soft disabled:text-text-muted disabled:opacity-50"
    >
      <span aria-hidden className="grid h-6 w-6 place-items-center text-text-secondary">{icon}</span>
      <span className="flex-1">{label}</span>
      {opts.checked && <Check size={20} className="text-primary" aria-hidden />}
    </button>
  );
  const divider = <div className="my-1.5 h-px bg-border-soft" />;
  return (
    <div data-testid="board-zoom-menu">
      {row("in", <Plus size={20} aria-hidden />, t("spaces.board.zoomIn"), props.onZoomIn, { keep: true })}
      {row("out", <Minus size={20} aria-hidden />, t("spaces.board.zoomOut"), props.onZoomOut, { keep: true })}
      {row("fit", <Maximize size={20} aria-hidden />, t("tb.zoom.fitAll"), props.onFit)}
      {row("selection", <Crosshair size={20} aria-hidden />, t("tb.zoom.fitSelection"), props.onFitSelection, { disabled: !props.hasSelection })}
      {divider}
      <p className="px-3 pb-1 pt-0.5 text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{t("tb.zoom.now", { percent: Math.round(props.zoom * 100) })}</p>
      <div className="grid grid-cols-3 gap-2 px-2 pb-1">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            data-testid={`board-zoom-preset-${preset * 100}`}
            aria-pressed={Math.abs(props.zoom - preset) < 0.005}
            onClick={() => {
              props.onPreset(preset);
              onDone();
            }}
            className={cn("h-11 rounded-xl border text-body font-semibold", Math.abs(props.zoom - preset) < 0.005 ? "border-primary bg-primary-soft text-primary" : "border-border-soft text-text")}
          >
            {Math.round(preset * 100)}%
          </button>
        ))}
      </div>
      {divider}
      {row("guides", <LayoutGrid size={20} aria-hidden />, t("tb.zoom.guides"), props.onGuides, { checked: props.guides, keep: true })}
      {row("minimap", <MapIcon size={19} aria-hidden />, t("spaces.board.minimap"), props.onMinimap, { checked: props.minimap, keep: true })}
      {row("search", <Search size={20} aria-hidden />, t("tb.zoom.search"), props.onSearch)}
      {row("shortcuts", <Keyboard size={20} aria-hidden />, t("spaces.board.shortcuts"), props.onShortcuts)}
      {row("fullscreen", props.fullscreen ? <Minimize2 size={20} aria-hidden /> : <Maximize2 size={20} aria-hidden />, props.fullscreen ? t("spaces.board.exitFullscreen") : t("spaces.board.fullscreen"), props.onFullscreen)}
      {props.editable && (
        <>
          {divider}
          {row("undo", <Undo2 size={20} aria-hidden />, t("spaces.board.undo"), props.onUndo, { disabled: !props.canUndo })}
          {row("redo", <Redo2 size={20} aria-hidden />, t("spaces.board.redo"), props.onRedo, { disabled: !props.canRedo })}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Panoya taşı / kopyala
// ---------------------------------------------------------------------------------------------

export function MovePopover({
  anchorRef,
  team,
  count,
  onClose,
  onRun,
  canMove,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  team: TeamBoardConfig;
  count: number;
  onClose: () => void;
  onRun: (targetId: string, copy: boolean) => Promise<void>;
  canMove: boolean;
}) {
  const { t } = useTranslation();
  const [copy, setCopy] = useState(!canMove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = team.pages.filter((page) => page.id !== team.currentId);
  const currentPage = team.pages.find((page) => page.id === team.currentId);
  const canNew = Boolean(currentPage) && (!currentPage?.isMain || team.fileId !== null);
  const run = async (resolve: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      await onRun(await resolve(), copy);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("spaces.error.generic"));
      setBusy(false);
    }
  };
  return (
    <BoardPopover anchorRef={anchorRef} onClose={onClose} width={276} label={t("tb.move.title", { count })} className="space-y-0.5">
      <p className="px-2.5 pb-1 pt-1 text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{t("tb.move.title", { count })}</p>
      {targets.map((page) => (
        <button
          key={page.id}
          type="button"
          disabled={busy}
          data-board-move-target={page.id}
          onClick={() => void run(async () => page.id)}
          className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2 py-1 text-left hover:bg-surface-soft disabled:opacity-50"
        >
          <BoardThumb spaceId={page.id} className="h-9 w-14 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-small font-bold text-text">{page.title}</span>
            <span className="block text-caption text-text-secondary">{t("tb.pages.itemCount", { count: page.itemCount })}</span>
          </span>
        </button>
      ))}
      {canNew && (
        <>
      <div className="my-1 h-px bg-border-soft" />
      <button
        type="button"
        disabled={busy}
        data-board-move-new=""
        onClick={() => void run(() => (currentPage && !currentPage.isMain ? createBoardInGroup(team.currentId, t("tb.pages.newDefaultName")) : createBoard(team.projectId, t("tb.pages.newDefaultName"), team.fileId ?? "")).then((id) => { team.reload(); return id; }))}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-small font-bold text-primary hover:bg-surface-soft disabled:opacity-50"
      >
        <Plus size={20} aria-hidden />
        {t("tb.move.new")}
      </button>
        </>
      )}
      <div role="radiogroup" aria-label={t("tb.move.mode")} className="mx-1 mt-1 flex gap-1 rounded-xl bg-surface-soft p-1">
        {[false, true].map((isCopy) => (
          <button
            key={String(isCopy)}
            type="button"
            role="radio"
            aria-checked={copy === isCopy}
            disabled={!isCopy && !canMove}
            onClick={() => setCopy(isCopy)}
            data-board-move-mode={isCopy ? "copy" : "move"}
            className={cn("h-9 flex-1 rounded-lg text-small font-semibold disabled:opacity-50", copy === isCopy ? "bg-surface text-text shadow-xs" : "text-text-secondary")}
          >
            {t(isCopy ? "tb.move.copy" : "tb.move.move")}
          </button>
        ))}
      </div>
      <p className="px-2.5 pb-1 pt-1.5 text-caption leading-snug text-text-secondary">{t(copy ? "tb.move.hintCopy" : "tb.move.hintMove")}</p>
      {!canMove && <p className="px-2.5 pb-1 text-caption leading-snug text-warning">{t("tb.move.leadOnly")}</p>}
      {error && (
        <p role="alert" className="px-2.5 pb-1 text-caption text-danger">
          {error}
        </p>
      )}
    </BoardPopover>
  );
}
