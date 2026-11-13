"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "@/components/icons/chevron-down";
import { Circle } from "@/components/icons/circle";
import { Frame } from "@/components/icons/frame";
import { Hand } from "@/components/icons/hand";
import { Keyboard } from "@/components/icons/keyboard";
import { Layers } from "@/components/icons/layers";
import { MessageCircle } from "@/components/icons/message-circle";
import { Minus } from "@/components/icons/minus";
import { MousePointer2 } from "@/components/icons/mouse-pointer-2";
import { Pencil } from "@/components/icons/pencil";
import { Play } from "@/components/icons/play";
import { Plus } from "@/components/icons/plus";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Spline } from "@/components/icons/spline";
import { Square } from "@/components/icons/square";
import { SquareDashedMousePointer } from "@/components/icons/square-dashed-mouse-pointer";
import { StickyNote } from "@/components/icons/sticky-note";
import { Type } from "@/components/icons/type";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ShapeKind, StrokeWidth } from "@/lib/team-board";
import { STROKE_WIDTHS } from "@/lib/team-board";
import { cn } from "@/lib/utils";
import { AddMenuBody, BoardSheet, ZoomMenuBody, type AddRow, type ZoomMenuProps } from "./board-menus";
import { BoardPopover, PopoverRow } from "./board-popover";

export type BoardTool = "select" | "pan" | "connect" | "comment" | "text" | "frame" | "rect" | "oval" | "line" | "arrow" | "pencil";
export type PillShape = Extract<ShapeKind, "rect" | "oval" | "line" | "arrow">;

const PILL = "pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-soft bg-surface p-[5px] shadow-card";

function TbButton({ icon, label, active, onClick, chev, buttonRef, testId, disabled }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void; chev?: boolean; buttonRef?: React.Ref<HTMLButtonElement>; testId?: string; disabled?: boolean }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={cn("flex h-10 min-w-10 shrink-0 items-center justify-center gap-0.5 rounded-[11px] px-2 transition-colors disabled:opacity-50", active ? "bg-primary-soft text-primary" : "text-text-secondary hover:bg-surface-soft hover:text-text")}
    >
      {icon}
      {chev && <ChevronDown size={12} aria-hidden />}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-[1.375rem] w-px shrink-0 bg-border-soft" />;
}

export interface BoardToolbarProps {
  size: "desktop" | "tablet" | "phone";
  editable: boolean;
  /** Çizim araçları (çerçeve/metin/şekil/kalem): düzenleyici+ ve arşivsiz. */
  canDraw: boolean;
  tool: BoardTool;
  onTool: (tool: BoardTool) => void;
  multiSelect: boolean;
  onMultiSelect: () => void;
  shape: PillShape;
  onShape: (shape: PillShape) => void;
  pencilWidth: StrokeWidth;
  onPencilWidth: (width: StrokeWidth) => void;
  pagesSlot: ReactNode;
  zoomPercent: number;
  zoomProps: ZoomMenuProps;
  promptlyRows: AddRow[];
  drawingRows: AddRow[];
  onAddNote: () => void;
  onPresent: () => void;
  canPresent: boolean;
  onGroups: () => void;
  onComments: () => void;
  onShortcuts: () => void;
}

/**
 * Yüzen araç çubukları (docs/history/367-*): sol hap (pano · araçlar · Ekle), sağ hap (sunum · ayarlar · yakınlaştırma). Masaüstünde tüm araçlar, tablette sığanlar
 * (kalem/şekil Ekle menüsünde), telefonda yalnız pano · seç · Ekle. Açılır içerikler masaüstü/tablette panel, telefonda alttan açılan sayfadır.
 */
export function BoardToolbar(props: BoardToolbarProps) {
  const { t } = useTranslation();
  const { size, editable, canDraw, tool, onTool } = props;
  const phone = size === "phone";
  const [menu, setMenu] = useState<null | "add" | "zoom" | "settings" | "pencil" | "shape">(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const zoomRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const shapeRef = useRef<HTMLButtonElement>(null);
  const close = () => setMenu(null);
  const toggle = (key: NonNullable<typeof menu>) => setMenu((current) => (current === key ? null : key));

  const ShapeIcon = props.shape === "oval" ? Circle : props.shape === "line" ? Minus : props.shape === "arrow" ? ArrowUpRight : Square;
  const shapeTool = (tool === "rect" || tool === "oval" || tool === "line" || tool === "arrow") && tool === props.shape;

  const settingsRows = (
    <>
      <PopoverRow icon={<SquareDashedMousePointer size={20} aria-hidden />} label={t("spaces.board.multiSelect")} onClick={() => { props.onMultiSelect(); close(); }} tag={props.multiSelect ? t("tb.toolbar.on") : undefined} testId="board-settings-multiselect" />
      {editable && <PopoverRow icon={<Layers size={20} aria-hidden />} label={t("spaces.groups.manage")} onClick={() => { close(); props.onGroups(); }} testId="board-settings-groups" />}
      <PopoverRow icon={<MessageCircle size={20} aria-hidden />} label={t("tb.comments.title")} onClick={() => { close(); props.onComments(); }} testId="board-settings-comments" />
      <PopoverRow icon={<Keyboard size={20} aria-hidden />} label={t("spaces.board.shortcuts")} onClick={() => { close(); props.onShortcuts(); }} testId="board-settings-shortcuts" />
    </>
  );

  const content = (key: NonNullable<typeof menu>) => {
    if (key === "add") return <AddMenuBody promptly={props.promptlyRows} drawing={props.drawingRows} onDone={close} columns={!phone} />;
    if (key === "zoom") return <ZoomMenuBody props={props.zoomProps} onDone={close} />;
    return settingsRows;
  };

  return (
    <div className="pointer-events-none flex items-start justify-between gap-2" data-testid="board-floating-toolbar" data-board-toolbar-size={size}>
      <div className={cn(PILL, "min-w-0 max-w-full overflow-x-auto scrollbar-none")} role="toolbar" aria-label={t("spaces.board.toolbar")}>
        {props.pagesSlot}
        <Sep />
        <TbButton icon={<MousePointer2 size={20} aria-hidden />} label={t("spaces.board.toolSelect")} active={tool === "select" && !props.multiSelect} onClick={() => onTool("select")} testId="board-tool-select" />
        {!phone && <TbButton icon={<Hand size={20} aria-hidden />} label={t("spaces.board.toolPan")} active={tool === "pan"} onClick={() => onTool("pan")} testId="board-tool-pan" />}
        {!phone && canDraw && <TbButton icon={<Type size={20} aria-hidden />} label={t("tb.kind.text")} active={tool === "text"} onClick={() => onTool("text")} testId="board-tool-text" />}
        {!phone && canDraw && <TbButton icon={<Frame size={20} aria-hidden />} label={t("tb.kind.frame")} active={tool === "frame"} onClick={() => onTool("frame")} testId="board-tool-frame" />}
        {!phone && editable && <TbButton icon={<StickyNote size={20} aria-hidden />} label={t("spaces.board.addNote")} onClick={props.onAddNote} testId="board-tool-note" />}
        {size === "desktop" && canDraw && <TbButton buttonRef={pencilRef} icon={<Pencil size={20} aria-hidden />} chev label={t("tb.tool.pencil")} active={tool === "pencil"} onClick={() => { onTool("pencil"); toggle("pencil"); }} testId="board-tool-pencil" />}
        {size === "desktop" && canDraw && <TbButton buttonRef={shapeRef} icon={<ShapeIcon size={19} aria-hidden />} chev label={t("tb.tool.shape")} active={shapeTool} onClick={() => { onTool(props.shape); toggle("shape"); }} testId="board-tool-shape" />}
        {!phone && editable && <TbButton icon={<Spline size={20} aria-hidden />} label={t("spaces.connect.tool")} active={tool === "connect"} onClick={() => onTool(tool === "connect" ? "select" : "connect")} testId="board-tool-connect" />}
        {editable && <Sep />}
        {editable &&
          (phone ? (
            <TbButton buttonRef={addRef} icon={<Plus size={20} aria-hidden />} chev label={t("spaces.board.add")} active={menu === "add"} onClick={() => toggle("add")} testId="board-add-button" />
          ) : (
            <button
              ref={addRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={menu === "add"}
              onClick={() => toggle("add")}
              data-testid="board-add-button"
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-[11px] bg-primary pl-2.5 pr-3 text-small font-bold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus size={20} aria-hidden />
              {t("tb.toolbar.add")}
              <ChevronDown size={14} aria-hidden />
            </button>
          ))}
      </div>

      <div className={cn(PILL, "shrink-0")}>
        <TbButton icon={<Play size={20} aria-hidden />} label={t("tb.present.start")} onClick={props.onPresent} disabled={!props.canPresent} testId="board-present-start" />
        <TbButton buttonRef={settingsRef} icon={<SlidersHorizontal size={20} aria-hidden />} label={t("tb.toolbar.settings")} active={menu === "settings"} onClick={() => toggle("settings")} testId="board-settings-button" />
        <button
          ref={zoomRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={menu === "zoom"}
          aria-label={t("tb.toolbar.zoom")}
          onClick={() => toggle("zoom")}
          data-testid="board-zoom-button"
          data-board-zoom={props.zoomPercent}
          className={cn("flex h-10 shrink-0 items-center gap-1 rounded-[11px] px-2.5 text-small font-semibold tabular-nums text-text hover:bg-surface-soft", menu === "zoom" && "bg-surface-soft")}
        >
          {props.zoomPercent}%
          <ChevronDown size={12} className="text-text-muted" aria-hidden />
        </button>
      </div>

      {menu === "pencil" && (
        <BoardPopover anchorRef={pencilRef} onClose={close} width={200} label={t("tb.tool.pencil")}>
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              onClick={() => { props.onPencilWidth(width); close(); }}
              aria-pressed={props.pencilWidth === width}
              className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-small font-semibold hover:bg-surface-soft", props.pencilWidth === width && "bg-primary-soft text-primary")}
            >
              <span className="block w-8 rounded-full bg-current" style={{ height: width }} />
              {t(`tb.tool.stroke.${width}` as const)}
            </button>
          ))}
        </BoardPopover>
      )}
      {menu === "shape" && (
        <BoardPopover anchorRef={shapeRef} onClose={close} width={220} label={t("tb.tool.shape")}>
          {(["rect", "oval", "line", "arrow"] as const).map((kind) => {
            const Icon = kind === "oval" ? Circle : kind === "line" ? Minus : kind === "arrow" ? ArrowUpRight : Square;
            return (
              <PopoverRow key={kind} icon={<Icon size={20} aria-hidden />} label={t(`tb.tool.${kind}` as const)} onClick={() => { props.onShape(kind); onTool(kind); close(); }} tag={props.shape === kind ? t("tb.toolbar.on") : undefined} />
            );
          })}
        </BoardPopover>
      )}
      {menu && (menu === "add" || menu === "zoom" || menu === "settings") &&
        (phone ? (
          <BoardSheet onClose={close}>{content(menu)}</BoardSheet>
        ) : (
          <BoardPopover
            anchorRef={menu === "add" ? addRef : menu === "zoom" ? zoomRef : settingsRef}
            onClose={close}
            align={menu === "add" ? "left" : "right"}
            width={menu === "add" ? 560 : menu === "zoom" ? 300 : 260}
            label={t(menu === "add" ? "tb.toolbar.add" : menu === "zoom" ? "tb.toolbar.zoom" : "tb.toolbar.settings")}
          >
            {content(menu)}
          </BoardPopover>
        ))}
    </div>
  );
}
