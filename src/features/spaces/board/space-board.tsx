"use client";

import { poofElement } from "@/lib/dust";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { AlignCenterHorizontal } from "@/components/icons/align-center-horizontal";
import { AlignCenterVertical } from "@/components/icons/align-center-vertical";
import { AlignEndHorizontal } from "@/components/icons/align-end-horizontal";
import { AlignEndVertical } from "@/components/icons/align-end-vertical";
import { AlignHorizontalDistributeCenter } from "@/components/icons/align-horizontal-distribute-center";
import { AlignStartHorizontal } from "@/components/icons/align-start-horizontal";
import { AlignStartVertical } from "@/components/icons/align-start-vertical";
import { AlignVerticalDistributeCenter } from "@/components/icons/align-vertical-distribute-center";
import { BringToFront } from "@/components/icons/bring-to-front";
import { Copy } from "@/components/icons/copy";
import { Group } from "@/components/icons/group";
import { Ellipsis } from "@/components/icons/ellipsis";
import { Hand } from "@/components/icons/hand";
import { ImagePlus } from "@/components/icons/image-plus";
import { Keyboard } from "@/components/icons/keyboard";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { Layers } from "@/components/icons/layers";
import { Loader2 } from "@/components/icons/loader-2";
import { Map as MapIcon } from "@/components/icons/map";
import { Maximize } from "@/components/icons/maximize";
import { Maximize2 } from "@/components/icons/maximize-2";
import { Minimize2 } from "@/components/icons/minimize-2";
import { Minus } from "@/components/icons/minus";
import { MousePointer2 } from "@/components/icons/mouse-pointer-2";
import { Palette } from "@/components/icons/palette";
import { Plus } from "@/components/icons/plus";
import { Redo2 } from "@/components/icons/redo-2";
import { Search } from "@/components/icons/search";
import { SendToBack } from "@/components/icons/send-to-back";
import { Spline } from "@/components/icons/spline";
import { SquareDashedMousePointer } from "@/components/icons/square-dashed-mouse-pointer";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { StickyNote } from "@/components/icons/sticky-note";
import { Trash2 } from "@/components/icons/trash-2";
import { Undo2 } from "@/components/icons/undo-2";
import { Ungroup } from "@/components/icons/ungroup";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { X } from "@/components/icons/x";
import { Lock } from "@/components/icons/lock";
import { LockOpen } from "@/components/icons/lock-open";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { WorkflowImportModal } from "../workflow-import-modal";
import { BoardConnectors, type ConnectorDraft } from "./board-connectors";
import { BoardMinimap } from "./board-minimap";
import { BoardSearch } from "./board-search";
import { ConnectionBar } from "./connection-bar";
import { WorkflowSyncBar } from "./workflow-sync-bar";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { imageSourceProblem } from "@/lib/image-processing";
import {
  alignItems,
  boundsOf,
  clampPosition,
  clampZoom,
  distributeItems,
  emptyHistory,
  fitViewport,
  groupFrames,
  itemsInRect,
  nudgeStep,
  pushHistory,
  rectFromPoints,
  redoHistory,
  resizeFromCorner,
  restack,
  screenToWorld,
  snap,
  tidyItems,
  topZ,
  undoHistory,
  worldToScreen,
  zoomAt,
  type AlignMode,
  type BoardGeom,
  type History,
  type Rect,
  type Viewport,
} from "@/lib/space-board";
import { isDuplicable, planDuplicate } from "@/lib/space-clipboard";
import { chainPairs, connectionExists } from "@/lib/space-connectors";
import { smartSnap, type Guide } from "@/lib/space-guides";
import { legacyFramesOf, loadPlanInput, runImport, type PlanIO } from "@/lib/supabase/workflow-board";
import { createSpaceGroup, uploadSpaceImage, type LayoutEntry, type NewSpaceItem, type SpaceConnection, type SpaceConnectionPatch, type SpaceItem } from "@/lib/supabase/spaces";
import { boardPageHref, dragBox, frameMemberIds, initialsOf, isDrawingKind, lineShape, normalizePoints, pinWorldPosition, presentationFrames, type StrokeWidth } from "@/lib/team-board";
import { deleteFileItem, transferItems } from "@/lib/supabase/team-board";
import { CONTENT_ADD_ROWS, useContentAdd } from "@/features/teams/content-add";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { BoardToolbar, type BoardTool, type PillShape } from "@/features/teams/board/board-toolbar";
import { TeamBoardBar } from "@/features/teams/board/board-bar";
import { PagesButton, PagesDrawer, PagesOverview, PagesPopover, usePageActions, usePagesUi } from "@/features/teams/board/board-pages";
import { CommentInput, CommentPeek, CommentsPanel, CommentTargetChip, PinMarker, usePinComments, type PanelThread } from "@/features/teams/board/board-comments";
import { MovePopover, BoardSheet, type AddRow } from "@/features/teams/board/board-menus";
import { FrameDialog, StyleControls, TextItemDialog, ShapeSvg } from "@/features/teams/board/board-draw";
import { ShareDialog } from "@/features/teams/board/board-share";
import { PresentBar } from "@/features/teams/board/board-present";
import { ContentPickerDialog } from "@/features/teams/board/board-content-picker";
import { NewPaletteDialog } from "../tabs/palette-tab";
import type { TeamBoardConfig } from "@/features/teams/board/board-types";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { fetchPinComments } from "@/lib/supabase/team-board";
import { canAddToArea, canReview } from "@/lib/team-projects";
import { Frame } from "@/components/icons/frame";
import { Type } from "@/components/icons/type";
import { Pencil } from "@/components/icons/pencil";
import { Square } from "@/components/icons/square";
import { Minus as MinusLine } from "@/components/icons/minus";
import { Palette as PaletteIcon } from "@/components/icons/palette";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { useSpaceContext } from "../space-provider";
import { DraftEditorModal, GroupsManagerModal, ITEM_KIND_LABEL, ItemDetailModal, NoteEditorModal, resolveSource, usePlaceNewItems, useItemTitle, type ResolvedSource } from "../space-items";
import { SaveIndicator } from "../save-indicator";
import { SpaceDialog } from "../space-modals";
import { SpaceMenu } from "../space-menu";
import { SPACE_COLOR_CLASS } from "../space-visuals";
import { BoardItem } from "./board-item";

/*
 * Spaces panosu (docs/history/213-*) — yeni bağımlılık eklemeden, Pointer Events ile yazılmış serbest tuval.
 *
 * Dünya ↔ ekran: öğeler dünya biriminde saklanır; görünüm (kaydırma + yakınlaştırma) yalnız bu oturumundur. Etkileşim:
 *  - fare: öğeyi sürükle = taşı, köşe tutamacı = boyutlandır, boş alanda sürükle = seçim kutusu, Boşluk/orta tuş/El aracı = kaydır,
 *    tekerlek = kaydır, Ctrl/⌘ + tekerlek (trackpad kıstırma) = yakınlaştır, Shift/⌘ + tıklama = seçime ekle/çıkar;
 *  - dokunma: öğeyi sürükle = taşı, boş alanda tek parmak = kaydır, iki parmak = yakınlaştır + kaydır, "Seç" modu = seçim kutusu
 *    ve çoklu seçim, seçim çubuğu (alt) bağlam menüsünün yerine geçer; "Tam ekran" panoyu tüm ekrana açar;
 *  - klavye (pano odaktayken): oklar = it (Shift büyük adım), Sil = kaldır, ⌘Z / ⌘⇧Z / ⌘Y = geri al / yinele, ⌘A = hepsini seç,
 *    ⌘G / ⌘⇧G = grupla / grubu çöz, Enter = aç, [ ] = önceki/sonraki öğe, + − 0 = yakınlaştır/uzaklaştır/sığdır, Esc = seçimi bırak.
 *
 * Kayıt: her işlem yerel durumu hemen değiştirir ve `queueLayout` ile sağlayıcıya verilir (birleştirilmiş, tek istek; durum
 * göstergesi). Geri al / yinele pano işlemlerini kapsar (taşı, boyutlandır, sıra, grup, hizala, panodan ekleme ve silme): geri
 * alınan silme öğeyi AYNI kimlikle geri koyar; sunucu reddederse (kaynak artık okunamıyor) hata söylenir, sahte başarı yok.
 * Görüntüleyici yalnız gezinir, seçer ve açar.
 */

type Geom = Pick<BoardGeom, "x" | "y" | "w" | "h" | "z" | "groupId">;
type Entry =
  | { type: "layout"; before: Record<string, Geom>; after: Record<string, Geom> }
  | { type: "delete"; items: SpaceItem[]; connections?: SpaceConnection[] }
  | { type: "add"; items: SpaceItem[] }
  | { type: "conn-add"; connections: SpaceConnection[] }
  | { type: "conn-delete"; connections: SpaceConnection[] }
  | { type: "conn-patch"; id: string; before: SpaceConnectionPatch; after: SpaceConnectionPatch }
  | { type: "import"; items: SpaceItem[]; connections: SpaceConnection[] };

interface Interaction {
  kind: "move" | "resize" | "pan" | "marquee" | "tap" | "draw" | "pencil";
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  origin: Record<string, Geom>;
  vpStart: Viewport;
  targetId: string | null;
  baseSelection: string[];
  wasSelected: boolean;
}

interface Pinch {
  distance: number;
  midX: number;
  midY: number;
  vpStart: Viewport;
}

const GUIDE_PX = 6;
const DUPLICATE_OFFSET = 32;
const MOVE_THRESHOLD = 4;
const MIN_START_ZOOM = 0.5;
const LOW_DETAIL_ZOOM = 0.4;

/** `usePageActions` koşulsuz çağrılır (kanca kuralı); kişisel Space panosunda bu boş yapılandırma kullanılır ve hiçbir şey çizilmez. */
const DUMMY_TEAM: TeamBoardConfig = {
  teamId: "",
  teamName: "",
  projectId: "",
  projectTitle: "",
  fileId: null,
  fileTitle: null,
  role: null,
  pages: [],
  currentId: "",
  mainTitle: "",
  groupId: null,
  groupTitle: null,
  people: [],
  archived: true,
  accessMode: "selected",
  canInvite: false,
  onInvite: () => undefined,
  canEditAccess: false,
  onEditAccess: () => undefined,
  onInfo: () => undefined,
  openComment: null,
  backHref: "",
  hrefOf: () => "",
  navigate: () => undefined,
  reload: () => undefined,
};

function geomOf(item: SpaceItem): Geom {
  return { x: item.x, y: item.y, w: item.w, h: item.h, z: item.z, groupId: item.groupId };
}

function toEntry(id: string, geom: Geom): LayoutEntry {
  return { id, x: geom.x, y: geom.y, w: geom.w, h: geom.h, z: geom.z, groupId: geom.groupId };
}

function toNewConnection(c: SpaceConnection) {
  return { id: c.id, spaceId: c.spaceId, fromItemId: c.fromItemId, toItemId: c.toItemId, label: c.label, lineStyle: c.lineStyle, arrow: c.arrow, route: c.route, color: c.color, sourceWorkflowId: c.sourceWorkflowId, sourceRole: c.sourceRole };
}

export function SpaceBoard({ focusId, team }: { focusId: string | null; team?: TeamBoardConfig }) {
  const { t } = useTranslation();
  // Telefonda araç çubuğu gruplanır (docs/history/363-*): sık kullanılanlar görünür, gerisi "⋯" menüsünde.
  const phoneBar = useMediaQuery("(max-width: 767.98px)");
  const { space, items, groups, palettes, sources, readable, caps, setItems, setGroups, queueLayout, layoutStatus, flushLayout, layoutNotice, dismissLayoutNotice, addItems, applyImport, removeItems, patchItem, userId, connections, setConnections, addConnections, removeConnections, patchConnection } =
    useSpaceContext();
  const itemTitle = useItemTitle();
  const place = usePlaceNewItems();
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [vp, setVp] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [ready, setReady] = useState(false);
  const [rawSelection, setSelection] = useState<string[]>([]);
  const [panning, setPanning] = useState(false);
  const [live, setLive] = useState<Record<string, Geom> | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [tool, setTool] = useState<BoardTool>("select");
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [draftPoint, setDraftPoint] = useState<{ x: number; y: number } | null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [minimapOn, setMinimapOn] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState({ w: 800, h: 600 });
  const clipboard = useRef<{ ids: string[]; pastes: number }>({ ids: [], pastes: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [history, setHistory] = useState<History<Entry>>(emptyHistory);
  const [fullscreen, setFullscreen] = useState(false);
  const [dialog, setDialog] = useState<
    | null
    | { kind: "detail"; id: string }
    | { kind: "note"; item?: SpaceItem | null; attachTo?: string | null; near?: { x: number; y: number } }
    | { kind: "draft"; item?: SpaceItem | null; near?: { x: number; y: number } }
    | { kind: "groups" }
    | { kind: "shortcuts" }
    | { kind: "importWorkflow" }
    | { kind: "text"; item?: SpaceItem | null; near?: { x: number; y: number } }
    | { kind: "frame"; item: SpaceItem }
    | { kind: "content"; type: "preset" | "request" }
    | { kind: "palette" }
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [undoNotice, setUndoNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const interaction = useRef<Interaction | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const pinch = useRef<Pinch | null>(null);
  const lastTap = useRef<{ id: string; time: number } | null>(null);
  const vpRef = useRef(vp);
  useEffect(() => {
    vpRef.current = vp;
  }, [vp]);

  const editable = caps.edit;

  // Görünür alanın ölçüsü (mini harita) ve mini harita tercihi (yalnız bu tarayıcıda).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setView({ w: canvas.clientWidth, h: canvas.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tarayıcı tercihi ilk çizimden sonra okunur
      if (window.localStorage.getItem("promptly-board-minimap") === "0") setMinimapOn(false);
      else setMinimapOn(true);
    } catch {
      setMinimapOn(true);
    }
  }, []);
  const toggleMinimap = useCallback(() => {
    setMinimapOn((on) => {
      try {
        window.localStorage.setItem("promptly-board-minimap", on ? "0" : "1");
      } catch {
        // Depolama yoksa tercih yalnız bu oturum için geçerli.
      }
      return !on;
    });
  }, []);

  // ---- ekip modu (docs/history/367-*): pano grubu, çizim araçları, yorumlar, Paylaş, sunum ----
  const teamMode = Boolean(team);
  const { profile: ownProfile } = useOwnProfile();
  const tabletBar = useMediaQuery("(min-width: 768px) and (max-width: 1023.98px)");
  const size: "desktop" | "tablet" | "phone" = phoneBar ? "phone" : tabletBar ? "tablet" : "desktop";
  const canDraw = teamMode && caps.edit && !team?.archived;
  const [shape, setShape] = useState<PillShape>("rect");
  const [pencilWidth, setPencilWidth] = useState<StrokeWidth>(4);
  const [guidesOn, setGuidesOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  // Tuvaldeki yorum işaretlerini gizle (yalnız görünüm; yorumlar listede durur). Yeni yorum başlatılınca işaretler geri gelir.
  const [pinsHidden, setPinsHidden] = useState(false);
  const [allScope, setAllScope] = useState(false);
  const [scopeThreads, setScopeThreads] = useState<PanelThread[] | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number; itemId: string | null; offX: number | null; offY: number | null } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ tool: BoardTool; ax: number; ay: number; bx: number; by: number } | null>(null);
  const [pencilPoints, setPencilPoints] = useState<[number, number][]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const moveRef = useRef<HTMLButtonElement>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const pencilRef = useRef<[number, number][]>([]);
  const toolRef = useRef(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  const pagesUi = usePagesUi(phoneBar, tabletBar);
  const pageActions = usePageActions(team ?? DUMMY_TEAM);
  const pins = usePinComments(space.id, teamMode);

  // ---- türetilmiş veri ----
  const geoms = useMemo(() => {
    const out: Record<string, Geom> = {};
    for (const item of items) out[item.id] = live?.[item.id] ?? geomOf(item);
    return out;
  }, [items, live]);
  const ordered = useMemo(() => [...items].sort((a, b) => geoms[a.id].z - geoms[b.id].z || a.createdAt.localeCompare(b.createdAt)), [items, geoms]);
  const resolvedMap = useMemo(() => {
    const map = new Map<string, ResolvedSource>();
    for (const item of items) map.set(item.id, resolveSource(item, sources, readable));
    return map;
  }, [items, sources, readable]);
  const boardGeoms = useMemo<BoardGeom[]>(() => items.map((item) => ({ id: item.id, ...geoms[item.id] })), [items, geoms]);
  const frames = useMemo(() => groupFrames(boardGeoms), [boardGeoms]);
  // Başkası (ya da başka sekme) silerse seçim kendiliğinden daralır.
  const selection = useMemo(() => {
    const ids = new Set(items.map((item) => item.id));
    const next = rawSelection.filter((id) => ids.has(id));
    return next.length === rawSelection.length ? rawSelection : next;
  }, [rawSelection, items]);
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const selectedItemsRef = useRef<SpaceItem[]>([]);
  useEffect(() => {
    selectedItemsRef.current = items.filter((entry) => selectedSet.has(entry.id));
  }, [items, selectedSet]);
  // Kilitli nesneler (docs/history/307-*): taşınmaz, boyutlanmaz, silinmez. Sunucu tetikleyicisi de aynısını uygular; burası yalnız beklenen davranışı sessiz tutar.
  const lockedSet = useMemo(() => new Set(items.filter((item) => item.locked).map((item) => item.id)), [items]);
  const selectedConn = useMemo(() => connections.find((c) => c.id === selectedConnId) ?? null, [connections, selectedConnId]);
  // Başlangıç nesnesi silinirse ok çizme bekleyişi kendiliğinden düşer.
  const activeFrom = useMemo(() => (connectFrom && items.some((item) => item.id === connectFrom) ? connectFrom : null), [connectFrom, items]);
  const draft = useMemo<ConnectorDraft | null>(() => (activeFrom && draftPoint ? { fromId: activeFrom, x: draftPoint.x, y: draftPoint.y } : null), [activeFrom, draftPoint]);

  // ---- görünüm: ilk açılışta sığdır ya da odak öğesine git ----
  const viewSize = useCallback(() => {
    const canvas = canvasRef.current;
    return { w: canvas?.clientWidth ?? 800, h: canvas?.clientHeight ?? 600 };
  }, []);

  const centerOn = useCallback(
    (itemId: string) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;
      const { w, h } = viewSize();
      const zoom = clampZoom(Math.min(1, (w * 0.6) / item.w, (h * 0.6) / item.h));
      setVp({ zoom, x: w / 2 - (item.x + item.w / 2) * zoom, y: h / 2 - (item.y + item.h / 2) * zoom });
      setSelection([itemId]);
    },
    [items, viewSize],
  );

  useLayoutEffect(() => {
    if (ready) return;
    const { w, h } = viewSize();
    // Görünüm alanı ancak çizildikten sonra ölçülür: ilk yerleşim burada (bir kez) hesaplanır.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (focusId && items.some((item) => item.id === focusId)) centerOn(focusId);
    else {
      // Dar ekranda bütün panoyu sığdırmak öğeleri okunmaz bloklara çevirir: en az %50 ile içeriğin sol üstünden başlanır.
      const fitted = fitViewport(items, w, h);
      const b = boundsOf(items);
      setVp(fitted.zoom >= MIN_START_ZOOM || !b ? fitted : { zoom: MIN_START_ZOOM, x: 24 - b.x * MIN_START_ZOOM, y: 24 - b.y * MIN_START_ZOOM });
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [ready, items, focusId, centerOn, viewSize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address names an item to show ("Panoda göster")
    if (ready && focusId) centerOn(focusId);
    // Yalnız adres değişince (başka sekmeden "Panoda göster").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const fit = useCallback(() => {
    const { w, h } = viewSize();
    setVp(fitViewport(selection.length ? items.filter((item) => selectedSet.has(item.id)) : items, w, h));
  }, [items, selection.length, selectedSet, viewSize]);

  const zoomBy = useCallback(
    (factor: number) => {
      const { w, h } = viewSize();
      setVp((current) => zoomAt(current, current.zoom * factor, w / 2, h / 2));
    },
    [viewSize],
  );

  const viewCenter = useCallback(() => {
    const { w, h } = viewSize();
    return screenToWorld(vpRef.current, w / 2, h / 2);
  }, [viewSize]);

  // ---- yerleşim uygulama + geçmiş ----
  const applyGeoms = useCallback(
    (next: Record<string, Geom>) => {
      setItems((list) => list.map((item) => (next[item.id] ? { ...item, ...next[item.id] } : item)));
      queueLayout(Object.entries(next).map(([id, geom]) => toEntry(id, geom)));
    },
    [setItems, queueLayout],
  );

  const commitLayout = useCallback(
    (after: Record<string, Geom>) => {
      const before: Record<string, Geom> = {};
      const changed: Record<string, Geom> = {};
      for (const [id, geom] of Object.entries(after)) {
        const item = items.find((entry) => entry.id === id);
        if (!item || item.locked) continue;
        const prev = geomOf(item);
        if (prev.x === geom.x && prev.y === geom.y && prev.w === geom.w && prev.h === geom.h && prev.z === geom.z && prev.groupId === geom.groupId) continue;
        before[id] = prev;
        changed[id] = geom;
      }
      if (Object.keys(changed).length === 0) return;
      applyGeoms(changed);
      setHistory((h) => pushHistory(h, { type: "layout", before, after: changed }));
    },
    [items, applyGeoms],
  );

  const patchSelection = useCallback(
    (patch: (geom: Geom, id: string) => Partial<Geom>, ids = selection) => {
      const after: Record<string, Geom> = {};
      for (const id of ids) {
        const item = items.find((entry) => entry.id === id);
        if (item) after[id] = { ...geomOf(item), ...patch(geomOf(item), id) };
      }
      commitLayout(after);
    },
    [items, selection, commitLayout],
  );

  // Ekip panosunda içerik ekleme dosyadakiyle AYNI satırlardır (docs/history/376-*): Prompt/İstek/Workflow/Ayar paketi Oluştur · Seç.
  const contentAdd = useContentAdd(team?.fileId ? { projectId: team.projectId, fileId: team.fileId, boardId: team.currentId } : null);
  const [confirmFileDelete, setConfirmFileDelete] = useState(false);
  const [fileDeleteBusy, setFileDeleteBusy] = useState(false);

  const deleteSelection = useCallback(async () => {
    if (!editable || selection.length === 0) return;
    setError(null);
    // Kilitli nesneler silinmez (sunucu da reddeder); geri kalanı silinir ve kilitliler seçili kalır.
    const lockedIds = selection.filter((id) => lockedSet.has(id));
    const ids = selection.filter((id) => !lockedSet.has(id));
    if (ids.length === 0) {
      setError(t("spaces.board.lockedSkipped", { count: lockedIds.length }));
      return;
    }
    // Nesneler toz olup dağılır (docs/history/335-*); silme başarısız olursa geri gelir.
    const undoPoof = ids.map((id) => poofElement(document.querySelector<HTMLElement>(`[data-board-item="${id}"]`)));
    try {
      // Uçlarından biri silinen oklar sunucuda kendiliğinden gider; geri almada öğelerle birlikte geri gelsin diye saklanır.
      const touching = connections.filter((c) => ids.includes(c.fromItemId) || ids.includes(c.toItemId));
      const removed = await removeItems(ids);
      setHistory((h) => pushHistory(h, { type: "delete", items: removed, connections: touching }));
      setSelection(lockedIds);
      setUndoNotice(lockedIds.length ? t("spaces.board.lockedSkipped", { count: lockedIds.length }) : t("spaces.board.removed", { count: removed.length }));
    } catch (err) {
      undoPoof.forEach((undo) => undo());
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }, [editable, selection, lockedSet, connections, removeItems, t]);

  // Dosyadan sil (docs/history/376-*): seçili içerik öğelerinin ASIL öğesi (ve bütün panolardaki yansımaları) silinir; çizim nesneleri dosyada yoktur, atlanır.
  const fileBacked = useMemo(() => selection.map((id) => items.find((item) => item.id === id)).filter((item): item is SpaceItem => Boolean(item && item.fileItemId)), [selection, items]);
  const deleteFromFile = useCallback(async () => {
    if (fileBacked.length === 0) return;
    setFileDeleteBusy(true);
    setError(null);
    try {
      for (const item of fileBacked) await deleteFileItem(item.id);
      const gone = new Set(fileBacked.map((item) => item.id));
      setItems((current) => current.filter((item) => !gone.has(item.id)));
      setSelection((current) => current.filter((id) => !gone.has(id)));
      setUndoNotice(t("tf.board.fileDeleted", { count: fileBacked.length }));
      setConfirmFileDelete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setFileDeleteBusy(false);
    }
  }, [fileBacked, setItems, t]);

  // Seçili nesneleri kilitle / kilidi aç (hepsi kilitliyse aç, değilse hepsini kilitle). Sunucu yazar; hata sessiz yutulmaz.
  const toggleLock = useCallback(async () => {
    if (!editable || selection.length === 0) return;
    setError(null);
    const target = !selection.every((id) => lockedSet.has(id));
    try {
      await Promise.all(selection.filter((id) => lockedSet.has(id) !== target).map((id) => patchItem(id, { locked: target })));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }, [editable, selection, lockedSet, patchItem, t]);

  // ---- çoğalt / kopyala-yapıştır (docs/history/263-*) ----
  const duplicate = useCallback(
    async (ids: string[], step: number) => {
      if (!editable || ids.length === 0) return;
      setError(null);
      const plan = planDuplicate(items, connections, ids, { offset: { x: DUPLICATE_OFFSET * step, y: DUPLICATE_OFFSET * step }, z: topZ(items), makeId: () => crypto.randomUUID() });
      if (plan.items.length === 0) {
        setError(t("spaces.board.duplicateNone"));
        return;
      }
      try {
        const created = await addItems(plan.items);
        const arrows = plan.connections.length ? await addConnections(plan.connections) : [];
        setHistory((h) => pushHistory(h, { type: "import", items: created, connections: arrows }));
        setSelection(created.map((item) => item.id));
        setUndoNotice(plan.skipped ? t("spaces.board.duplicatedSkipped", { count: created.length, skipped: plan.skipped }) : t("spaces.board.duplicated", { count: created.length }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      }
    },
    [editable, items, connections, addItems, addConnections, t],
  );

  const copySelection = useCallback(() => {
    const ids = items.filter((item) => selectedSet.has(item.id) && isDuplicable(item)).map((item) => item.id);
    if (ids.length === 0) {
      setError(t("spaces.board.duplicateNone"));
      return;
    }
    clipboard.current = { ids, pastes: 0 };
    setUndoNotice(t("spaces.board.copied", { count: ids.length }));
  }, [items, selectedSet, t]);

  const pasteClipboard = useCallback(() => {
    const ids = clipboard.current.ids.filter((id) => items.some((item) => item.id === id));
    if (ids.length === 0) return;
    clipboard.current.pastes += 1;
    void duplicate(ids, clipboard.current.pastes);
  }, [items, duplicate]);

  const runEntry = useCallback(
    async (entry: Entry, direction: "undo" | "redo") => {
      if (entry.type === "layout") {
        applyGeoms(direction === "undo" ? entry.before : entry.after);
        return true;
      }
      try {
        if (entry.type === "conn-add" || entry.type === "conn-delete") {
          const restoreConnections = (entry.type === "conn-delete") === (direction === "undo");
          if (restoreConnections) await addConnections(entry.connections.map(toNewConnection));
          else await removeConnections(entry.connections.map((c) => c.id));
          return true;
        }
        if (entry.type === "conn-patch") {
          await patchConnection(entry.id, direction === "undo" ? entry.before : entry.after);
          return true;
        }
        if (entry.type === "import") {
          // Workflow aktarımı tek adımda geri alınır / yinelenir; öğeler silinince okları sunucuda kendiliğinden gider.
          if (direction === "undo") await removeItems(entry.items.map((item) => item.id));
          else {
            await addItems(entry.items);
            await addConnections(entry.connections.map(toNewConnection));
          }
          return true;
        }
        const restore = (entry.type === "delete") === (direction === "undo");
        if (restore) {
          await addItems(entry.items);
          if (entry.type === "delete" && entry.connections?.length) await addConnections(entry.connections.map(toNewConnection));
        } else await removeItems(entry.items.map((item) => item.id));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : t("spaces.error.generic"));
        return false;
      }
    },
    [applyGeoms, addItems, removeItems, addConnections, removeConnections, patchConnection, t],
  );

  const undo = useCallback(async () => {
    const { history: next, entry } = undoHistory(history);
    if (!entry) return;
    setHistory(next);
    setUndoNotice(null);
    // Başarısız geri alma geçmişten düşer (tekrar denemek aynı hatayı verir); durum değişmedi.
    if (!(await runEntry(entry, "undo"))) setHistory((h) => ({ ...h, future: h.future.slice(1) }));
  }, [history, runEntry]);

  const redo = useCallback(async () => {
    const { history: next, entry } = redoHistory(history);
    if (!entry) return;
    setHistory(next);
    if (!(await runEntry(entry, "redo"))) setHistory((h) => ({ ...h, past: h.past.slice(0, -1) }));
  }, [history, runEntry]);

  // ---- oklar (docs/history/262-*) ----
  const setToolMode = useCallback((next: BoardTool) => {
    setTool(next);
    if (next !== "connect") {
      setConnectFrom(null);
      setDraftPoint(null);
    }
  }, []);

  const connectItems = useCallback(
    async (pairs: [string, string][]) => {
      if (!editable || pairs.length === 0) return;
      setError(null);
      const fresh = pairs.filter(([a, b]) => !connectionExists(connections, a, b));
      if (fresh.length === 0) {
        setError(t("spaces.connect.alreadyConnected"));
        return;
      }
      try {
        const created = await addConnections(fresh.map(([from, to]) => ({ spaceId: space.id, fromItemId: from, toItemId: to })));
        setHistory((h) => pushHistory(h, { type: "conn-add", connections: created }));
        setSelection([]);
        setSelectedConnId(created[created.length - 1].id);
        if (created.length > 1) setUndoNotice(t("spaces.connect.added", { count: created.length }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      }
    },
    [editable, connections, addConnections, space.id, t],
  );

  const handleConnectPick = useCallback(
    (itemId: string) => {
      if (!activeFrom) {
        setConnectFrom(itemId);
        setSelection([]);
        return;
      }
      setConnectFrom(null);
      setDraftPoint(null);
      if (activeFrom !== itemId) void connectItems([[activeFrom, itemId]]);
    },
    [activeFrom, connectItems],
  );

  const patchSelectedConnection = useCallback(
    async (patch: SpaceConnectionPatch) => {
      if (!editable || !selectedConn) return;
      setError(null);
      const before: SpaceConnectionPatch = {};
      for (const key of Object.keys(patch) as (keyof SpaceConnectionPatch)[]) (before as Record<string, unknown>)[key] = selectedConn[key];
      try {
        await patchConnection(selectedConn.id, patch);
        setHistory((h) => pushHistory(h, { type: "conn-patch", id: selectedConn.id, before, after: patch }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      }
    },
    [editable, selectedConn, patchConnection, t],
  );

  const deleteSelectedConnection = useCallback(async () => {
    if (!editable || !selectedConn) return;
    setError(null);
    try {
      const removed = await removeConnections([selectedConn.id]);
      setHistory((h) => pushHistory(h, { type: "conn-delete", connections: removed }));
      setSelectedConnId(null);
      setUndoNotice(t("spaces.connect.removed", { count: removed.length }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }, [editable, selectedConn, removeConnections, t]);

  const groupSelection = useCallback(async () => {
    if (!editable || selection.length < 2 || !userId) return;
    setError(null);
    try {
      const group = await createSpaceGroup(space.id, t("spaces.board.groupName", { n: groups.length + 1 }), userId, groups.length);
      setGroups((list) => [...list, group]);
      patchSelection(() => ({ groupId: group.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }, [editable, selection, userId, space.id, groups.length, setGroups, patchSelection, t]);

  const ungroupSelection = useCallback(() => {
    if (!editable) return;
    patchSelection(() => ({ groupId: null }));
  }, [editable, patchSelection]);

  const align = useCallback(
    (mode: AlignMode | "distributeX" | "distributeY" | "tidy") => {
      const chosen = boardGeoms.filter((geom) => selectedSet.has(geom.id));
      const out = mode === "distributeX" ? distributeItems(chosen, "x") : mode === "distributeY" ? distributeItems(chosen, "y") : mode === "tidy" ? tidyItems(chosen) : alignItems(chosen, mode);
      patchSelection((_, id) => out[id] ?? {});
    },
    [boardGeoms, selectedSet, patchSelection],
  );

  const stack = useCallback(
    (to: "front" | "back") => {
      const out = restack(boardGeoms, selection, to);
      patchSelection((_, id) => (out[id] !== undefined ? { z: out[id] } : {}));
    },
    [boardGeoms, selection, patchSelection],
  );

  const openItem = useCallback(
    (id: string) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      if (item.kind === "text") {
        if (canDraw) setDialog({ kind: "text", item });
      } else if (item.kind === "frame") {
        if (canDraw) setDialog({ kind: "frame", item });
      } else if (item.kind === "shape") return;
      else if (item.kind === "note") setDialog(editable ? { kind: "note", item } : { kind: "detail", id });
      else if (item.kind === "prompt" && item.isDraft && editable) setDialog({ kind: "draft", item });
      else if (item.kind !== "palette") setDialog({ kind: "detail", id });
    },
    [items, editable, canDraw],
  );

  // ---- ekleme (panodan): görünümün ortasına; geri alınabilir ----
  const addFromBoard = useCallback(
    async (drafts: Parameters<typeof place>[0]) => {
      setError(null);
      try {
        const created = await addItems(place(drafts, viewCenter()));
        setHistory((h) => pushHistory(h, { type: "add", items: created }));
        setSelection(created.map((item) => item.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      }
    },
    [addItems, place, viewCenter, t],
  );

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const drafts: Parameters<typeof place>[0] = [];
    for (const file of [...files]) {
      const problem = imageSourceProblem(file);
      if (problem) {
        setError(`${file.name}: ${problem}`);
        continue;
      }
      try {
        const uploaded = await uploadSpaceImage(space.id, file);
        drafts.push({ spaceId: space.id, kind: "image", mediaUrl: uploaded.url, mediaWidth: uploaded.width, mediaHeight: uploaded.height, title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) });
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : t("spaces.error.upload")}`);
      }
    }
    if (drafts.length) await addFromBoard(drafts);
    setUploading(false);
  }

  // ---- ekip modu işlemleri (docs/history/367-*) ----
  const myRole = team?.role ?? null;
  const canResolveComments = canAddToArea(myRole);
  const canModerateComments = canReview(myRole);
  const itemPositions = useMemo(() => new Map(items.map((item) => [item.id, { x: geoms[item.id].x, y: geoms[item.id].y }])), [items, geoms]);

  /** Çizim öğesi ekler (geri alınabilir). Çerçeve en alta konur ki içindeki öğeler üstte kalsın. */
  const createDrawItem = useCallback(
    async (draft: Omit<NewSpaceItem, "spaceId" | "z">, behind = false): Promise<SpaceItem | null> => {
      if (!canDraw) return null;
      setError(null);
      const z = behind ? Math.min(0, ...items.map((entry) => entry.z)) - 1 : topZ(items) + 1;
      try {
        const created = await addItems([{ ...draft, spaceId: space.id, z }]);
        setHistory((h) => pushHistory(h, { type: "add", items: created }));
        setSelection(created.map((entry) => entry.id));
        return created[0] ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : t("spaces.error.generic"));
        return null;
      }
    },
    [canDraw, items, addItems, space.id, t],
  );

  const finishDraw = useCallback(
    async (kind: BoardTool, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dragged = Math.hypot(b.x - a.x, b.y - a.y) >= 6 / Math.max(vpRef.current.zoom, 0.1);
      if (kind === "frame") {
        const box = dragged ? dragBox(a.x, a.y, b.x, b.y) : { x: Math.round(a.x - 240), y: Math.round(a.y - 180), w: 480, h: 360 };
        const n = items.filter((entry) => entry.kind === "frame").length + 1;
        await createDrawItem({ kind: "frame", ...box, title: t("tb.frame.defaultName", { n }), color: "neutral", data: {} }, true);
      } else if (kind === "rect" || kind === "oval") {
        const box = dragged ? dragBox(a.x, a.y, b.x, b.y) : { x: Math.round(a.x - 100), y: Math.round(a.y - 70), w: 200, h: 140 };
        await createDrawItem({ kind: "shape", ...box, color: "primary", data: { shape: kind, fill: false, sw: 4, points: [] } });
      } else if ((kind === "line" || kind === "arrow") && dragged) {
        const line = lineShape(a.x, a.y, b.x, b.y);
        await createDrawItem({ kind: "shape", ...line.box, color: "primary", data: { shape: kind, fill: false, sw: 4, points: line.points } });
      } else if (kind === "line" || kind === "arrow") return;
      setToolMode("select");
    },
    [items, createDrawItem, setToolMode, t],
  );

  const finishPencil = useCallback(
    async (points: [number, number][]) => {
      if (points.length < 2) return;
      const out = normalizePoints(points, pencilWidth);
      await createDrawItem({ kind: "shape", ...out.box, color: "primary", data: { shape: "draw", fill: false, sw: pencilWidth, points: out.points } });
    },
    [createDrawItem, pencilWidth],
  );

  const saveText = useCallback(
    async (values: { body: string; color: SpaceItem["color"]; data: { size: string; bold: boolean } }, existing: SpaceItem | null, near?: { x: number; y: number }) => {
      if (existing) {
        await patchItem(existing.id, { body: values.body, color: values.color, data: values.data });
        return;
      }
      const px = { sm: 14, md: 20, lg: 32, xl: 52 }[values.data.size] ?? 20;
      const longest = Math.max(...values.body.split("\n").map((line) => line.length), 1);
      const w = Math.min(640, Math.max(80, Math.round(longest * px * 0.6) + 16));
      const lines = Math.max(1, values.body.split("\n").length);
      const h = Math.max(40, Math.round(lines * px * 1.35) + 12);
      const at = near ?? viewCenter();
      await createDrawItem({ kind: "text", x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, body: values.body, color: values.color, data: values.data });
      setToolMode("select");
    },
    [patchItem, createDrawItem, viewCenter, setToolMode],
  );

  const restyle = useCallback(
    async (patch: (item: SpaceItem) => { color?: SpaceItem["color"]; data?: Record<string, unknown> }) => {
      setError(null);
      try {
        await Promise.all(
          items
            .filter((entry) => selectedSet.has(entry.id) && (entry.kind === "shape" || entry.kind === "text" || entry.kind === "frame"))
            .map((entry) => {
              const next = patch(entry);
              return next.color || next.data ? patchItem(entry.id, { ...(next.color ? { color: next.color } : {}), ...(next.data ? { data: next.data } : {}) }) : Promise.resolve(entry);
            }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      }
    },
    [items, selectedSet, patchItem, t],
  );

  // Yorumlar
  const boardThreads = useMemo<PanelThread[]>(() => pins.threads.map((thread) => ({ ...thread, boardTitle: null, boardId: space.id })), [pins.threads, space.id]);
  useEffect(() => {
    if (!team || !allScope || !panelOpen) return;
    let alive = true;
    void (async () => {
      const lists = await Promise.all(team.pages.filter((page) => page.id !== space.id).map(async (page) => ({ page, comments: await fetchPinComments(page.id).catch(() => []) })));
      const { groupThreads } = await import("@/lib/team-board");
      if (!alive) return;
      setScopeThreads(lists.flatMap(({ page, comments }) => groupThreads(comments).map((thread) => ({ ...thread, boardTitle: page.title, boardId: page.id }))));
    })();
    return () => {
      alive = false;
    };
  }, [team, allScope, panelOpen, space.id]);
  const panelThreads = useMemo(() => (allScope ? [...boardThreads, ...(scopeThreads ?? [])] : boardThreads), [allScope, boardThreads, scopeThreads]);
  const activeThread = panelThreads.find((thread) => thread.root.id === activeComment) ?? null;
  const openBoardThreads = boardThreads.filter((thread) => !thread.root.resolvedAt);
  const hlItemId = activeThread?.boardId === space.id ? (activeThread.root.itemId ?? null) : null;

  const locate = useCallback(
    (thread: PanelThread) => {
      if (!team) return;
      if (thread.boardId !== space.id) {
        team.navigate(boardPageHref(team.teamId, team.projectId, thread.boardId, { comment: thread.root.id }), "replace");
        return;
      }
      const pos = pinWorldPosition(thread.root, itemPositions);
      if (!pos) return;
      const { w, h } = viewSize();
      const zoom = Math.max(vpRef.current.zoom, 0.6);
      setVp({ zoom, x: w / 2 - pos.x * zoom, y: h / 2 - pos.y * zoom });
      setActiveComment(thread.root.id);
      setSelection([]);
      if (phoneBar) {
        setPanelOpen(false);
        setPeek(true);
      }
    },
    [team, space.id, itemPositions, viewSize, phoneBar, setPanelOpen],
  );

  // Bildirimden gelen `?comment=`: yorumlar yüklenince bir kez yer gösterilir.
  const openedComment = useRef<string | null>(null);
  useEffect(() => {
    const wanted = team?.openComment;
    if (!wanted || openedComment.current === wanted || pins.status !== "ready" || !ready) return;
    const thread = boardThreads.find((entry) => entry.root.id === wanted);
    openedComment.current = wanted;
    if (!thread) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adres parametresi bir kez uygulanır
    if (!phoneBar) setPanelOpen(true);
    locate(thread);
  }, [team?.openComment, pins.status, ready, boardThreads, locate, phoneBar]);

  const startComment = useCallback(
    (point: { x: number; y: number }, targetId: string | null) => {
      const world = screenToWorld(vpRef.current, point.x, point.y);
      const target = targetId ? items.find((entry) => entry.id === targetId) : null;
      const geom = target ? geoms[target.id] : null;
      setPinsHidden(false);
      setDraftPin({ x: world.x, y: world.y, itemId: target?.id ?? null, offX: geom ? world.x - geom.x : null, offY: geom ? world.y - geom.y : null });
      setActiveComment(null);
      setPeek(false);
    },
    [items, geoms],
  );

  const submitDraft = useCallback(
    async (body: string) => {
      if (!draftPin) return;
      await pins.add({ body, ...draftPin });
      setDraftPin(null);
      setToolMode("select");
      setPanelOpen(true);
    },
    [draftPin, pins, setToolMode, setPanelOpen],
  );

  // Taşı / kopyala
  const runTransfer = useCallback(
    async (targetId: string, copy: boolean) => {
      const result = await transferItems({ fromSpace: space.id, toSpace: targetId, items: selectedItemsRef.current, copy });
      if (result.done === 0) throw new Error(t("tb.move.none"));
      if (!copy) {
        const gone = new Set(result.oldIds);
        setItems((list) => list.filter((entry) => !gone.has(entry.id)));
        setConnections((list) => list.filter((entry) => !gone.has(entry.fromItemId) && !gone.has(entry.toItemId)));
        setSelection([]);
        setHistory(emptyHistory);
      }
      team?.reload();
      setUndoNotice(t(result.skipped ? "tb.move.doneSkipped" : "tb.move.done", { count: result.done, skipped: result.skipped }));
    },
    [space.id, setItems, setConnections, team, t],
  );

  // Sunum
  const frameList = useMemo(() => presentationFrames(items), [items]);
  const frameListRef = useRef(frameList);
  useEffect(() => {
    frameListRef.current = frameList;
  }, [frameList]);
  const startPresent = useCallback(() => {
    if (frameListRef.current.length === 0) {
      setError(t("tb.present.noFrames"));
      return;
    }
    setSelection([]);
    setPresenting(0);
    setFullscreen(true);
  }, [t, setPresenting]);
  const exitPresent = useCallback(() => {
    setPresenting(null);
    setFullscreen(false);
  }, [setPresenting]);
  useEffect(() => {
    if (presenting === null) return;
    const frame = frameListRef.current[Math.min(presenting, frameListRef.current.length - 1)];
    if (!frame) return;
    setVp(fitViewport([frame], view.w, view.h, 40));
  }, [presenting, view.w, view.h]);
  useEffect(() => {
    if (presenting === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitPresent();
      else if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        setPresenting((n) => (n === null ? n : Math.min(frameListRef.current.length - 1, n + 1)));
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setPresenting((n) => (n === null ? n : Math.max(0, n - 1)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, exitPresent]);

  // ---- işaretçi olayları ----
  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function startPinch() {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    // Sürmekte olan taşıma/boyutlandırma bırakılır (yerel önizleme geri alınır), iki parmak görünümü yönetir.
    interaction.current = null;
    setLive(null);
    setMarquee(null);
    pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, vpStart: vpRef.current };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button === 2) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, { ...point, type: event.pointerType });
    try {
      canvasRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Yakalama desteklenmiyorsa (bazı dokunmatik tarayıcılar) olaylar yine tuvalden gelir.
    }
    canvasRef.current?.focus({ preventScroll: true });
    if (pointers.current.size === 2 && [...pointers.current.values()].every((p) => p.type === "touch")) {
      startPinch();
      return;
    }
    if (pointers.current.size > 1) return;

    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-resize-handle]")?.dataset.resizeHandle ?? null;
    const frame = target.closest<HTMLElement>("[data-group-label]")?.dataset.groupLabel ?? null;
    const itemId = target.closest<HTMLElement>("[data-board-item]")?.dataset.boardItem ?? null;
    const additive = event.shiftKey || event.metaKey || event.ctrlKey || multiSelect;
    const base: Omit<Interaction, "kind"> = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      moved: false,
      origin: {},
      vpStart: vpRef.current,
      targetId: itemId,
      baseSelection: selection,
      wasSelected: Boolean(itemId && selectedSet.has(itemId)),
    };
    const wantsPan = tool === "pan" || spaceHeld || event.button === 1;
    const connectorId = target.closest<HTMLElement>("[data-board-connector]")?.dataset.boardConnector ?? null;

    // Ekip araçları (docs/history/367-*): yorum / metin = dokunuşla yerleştir (sürüklenirse kaydırır); çerçeve/şekil/çizgi = sürükle; kalem = serbest çizim.
    if (teamMode && !wantsPan) {
      const world = screenToWorld(vpRef.current, point.x, point.y);
      if (tool === "comment" || tool === "text") {
        interaction.current = { ...base, kind: "tap", targetId: tool === "comment" ? itemId : null };
        return;
      }
      if (canDraw && (tool === "frame" || tool === "rect" || tool === "oval" || tool === "line" || tool === "arrow")) {
        drawStart.current = world;
        interaction.current = { ...base, kind: "draw" };
        setDrawPreview({ tool, ax: world.x, ay: world.y, bx: world.x, by: world.y });
        return;
      }
      if (canDraw && tool === "pencil") {
        pencilRef.current = [[world.x, world.y]];
        setPencilPoints([[world.x, world.y]]);
        interaction.current = { ...base, kind: "pencil" };
        return;
      }
    }

    // Ok seçme: öğenin üstünde değilse okun üzerine (ya da etiketine) dokunmak oku seçer.
    if (connectorId && !itemId && !wantsPan) {
      setSelectedConnId(connectorId);
      setSelection([]);
      setConnectFrom(null);
      setDraftPoint(null);
      return;
    }
    // Ok çizme aracı: iki nesneye art arda dokun; boş alan bekleyen başlangıcı bırakır (kaydırma yine çalışır).
    if (tool === "connect" && !wantsPan && editable) {
      if (itemId) {
        handleConnectPick(itemId);
        return;
      }
      setConnectFrom(null);
      setDraftPoint(null);
    }
    setSelectedConnId(null);

    if (handle && editable && !wantsPan && !lockedSet.has(handle)) {
      interaction.current = { ...base, kind: "resize", targetId: handle, origin: { [handle]: geoms[handle] } };
      return;
    }
    if (frame && !wantsPan) {
      const members = items.filter((item) => item.groupId === frame).map((item) => item.id);
      setSelection(members);
      const movableMembers = members.filter((id) => !lockedSet.has(id));
      interaction.current = editable && movableMembers.length > 0 ? { ...base, kind: "move", origin: Object.fromEntries(movableMembers.map((id) => [id, geoms[id]])) } : { ...base, kind: "pan" };
      return;
    }
    if (itemId && !wantsPan) {
      let next = selection;
      if (additive) next = selectedSet.has(itemId) ? selection : [...selection, itemId];
      else if (!selectedSet.has(itemId)) next = [itemId];
      setSelection(next);
      // Kilitli nesneler sürüklemeye katılmaz; seçimdeki hepsi kilitliyse sürükleme boş alanda olduğu gibi seçim kutusu / kaydırma olur.
      const movable = next.filter((id) => !lockedSet.has(id));
      // Çerçeve taşınınca içindeki öğeler de gelir (docs/history/367-*).
      const moving = new Set(movable);
      for (const id of movable) {
        if (items.find((entry) => entry.id === id)?.kind !== "frame") continue;
        const boxes = items.map((entry) => ({ id: entry.id, kind: entry.kind, ...geoms[entry.id], locked: entry.locked }));
        for (const member of frameMemberIds({ id, kind: "frame", ...geoms[id] }, boxes)) moving.add(member);
      }
      interaction.current =
        editable && movable.length > 0
          ? { ...base, kind: "move", origin: Object.fromEntries([...moving].map((id) => [id, geoms[id]]).filter(([, geom]) => geom)) }
          : { ...base, kind: event.pointerType === "mouse" ? "marquee" : "pan" };
      return;
    }
    // Boş alan: dokunmada (Seç modu dışında) kaydırma, farede seçim kutusu.
    const marqueeMode = !wantsPan && (event.pointerType === "mouse" || event.pointerType === "pen" || multiSelect);
    interaction.current = { ...base, kind: marqueeMode ? "marquee" : "pan", baseSelection: additive ? selection : [] };
    if (!marqueeMode) setPanning(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (teamMode && tool === "comment" && event.pointerType === "mouse") {
      const hovered = (event.target as HTMLElement).closest<HTMLElement>("[data-board-item]")?.dataset.boardItem ?? null;
      setHoverId((current) => (current === hovered ? current : hovered));
    }
    // Ok çizerken başlangıç nesnesinden imlece önizleme çizgisi (fare/kalem; dokunmada imleç yok).
    if (activeFrom && event.pointerType !== "touch") {
      const at = localPoint(event);
      setDraftPoint(screenToWorld(vpRef.current, at.x, at.y));
    }
    if (!pointers.current.has(event.pointerId)) return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, { ...point, type: event.pointerType });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const start = pinch.current;
      const zoomed = zoomAt(start.vpStart, start.vpStart.zoom * (distance / start.distance), start.midX, start.midY);
      setVp({ ...zoomed, x: zoomed.x + (midX - start.midX), y: zoomed.y + (midY - start.midY) });
      return;
    }

    const current = interaction.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = point.x - current.startX;
    const dy = point.y - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
    current.moved = true;
    const zoom = current.vpStart.zoom;

    if (current.kind === "pan" || current.kind === "tap") {
      setVp({ ...current.vpStart, x: current.vpStart.x + dx, y: current.vpStart.y + dy });
    } else if (current.kind === "draw" && drawStart.current) {
      const world = screenToWorld(current.vpStart, point.x, point.y);
      setDrawPreview((preview) => (preview ? { ...preview, bx: world.x, by: world.y } : preview));
    } else if (current.kind === "pencil") {
      const world = screenToWorld(current.vpStart, point.x, point.y);
      const last = pencilRef.current[pencilRef.current.length - 1];
      if (!last || Math.hypot(world.x - last[0], world.y - last[1]) >= 2 / zoom) {
        pencilRef.current.push([world.x, world.y]);
        setPencilPoints([...pencilRef.current]);
      }
    } else if (current.kind === "move") {
      const next: Record<string, Geom> = {};
      for (const [id, origin] of Object.entries(current.origin)) {
        const x = origin.x + dx / zoom;
        const y = origin.y + dy / zoom;
        next[id] = { ...origin, x: clampPosition(event.altKey ? x : snap(x)), y: clampPosition(event.altKey ? y : snap(y)) };
      }
      // Akıllı kılavuzlar: taşınanların birleşik kutusu diğer nesnelerin kenar/ortasına yaklaşınca oraya yakalanır (Alt: kapalı).
      let found: Guide[] = [];
      if (!event.altKey && guidesOn) {
        const movingIds = new Set(Object.keys(next));
        const box = boundsOf(Object.values(next));
        if (box) {
          const result = smartSnap(box, boardGeoms.filter((geom) => !movingIds.has(geom.id)), GUIDE_PX / zoom);
          if (result.dx || result.dy) for (const id of Object.keys(next)) next[id] = { ...next[id], x: clampPosition(next[id].x + result.dx), y: clampPosition(next[id].y + result.dy) };
          found = result.guides;
        }
      }
      setGuides(found);
      setLive(next);
    } else if (current.kind === "resize" && current.targetId) {
      const origin = current.origin[current.targetId];
      const item = items.find((entry) => entry.id === current.targetId);
      const rect = resizeFromCorner(origin, dx / zoom, dy / zoom, item?.kind === "image");
      setLive({ [current.targetId]: { ...origin, w: rect.w, h: rect.h } });
    } else if (current.kind === "marquee") {
      const screen = rectFromPoints(current.startX, current.startY, point.x, point.y);
      setMarquee(screen);
      const a = screenToWorld(current.vpStart, screen.x, screen.y);
      const world = { x: a.x, y: a.y, w: screen.w / zoom, h: screen.h / zoom };
      const hits = itemsInRect(boardGeoms, world);
      setSelection([...new Set([...current.baseSelection, ...hits])]);
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const current = interaction.current;
    if (!current || current.pointerId !== event.pointerId) return;
    interaction.current = null;
    setPanning(false);
    if (current.kind === "draw") {
      const start = drawStart.current;
      drawStart.current = null;
      setDrawPreview(null);
      if (start) {
        const at = localPoint(event);
        void finishDraw(toolRef.current, start, screenToWorld(current.vpStart, at.x, at.y));
      }
      return;
    }
    if (current.kind === "pencil") {
      const points = pencilRef.current;
      pencilRef.current = [];
      setPencilPoints([]);
      void finishPencil(points);
      return;
    }
    if (current.kind === "tap" && !current.moved) {
      const at = localPoint(event);
      if (toolRef.current === "comment") startComment(at, current.targetId);
      else if (toolRef.current === "text") setDialog({ kind: "text", near: screenToWorld(vpRef.current, at.x, at.y) });
      return;
    }
    if ((current.kind === "move" || current.kind === "resize") && current.moved && live) {
      commitLayout(live);
    } else if (!current.moved) {
      if (current.targetId) {
        const now = Date.now();
        const additive = event.shiftKey || event.metaKey || event.ctrlKey || multiSelect;
        if (additive && current.wasSelected) setSelection(current.baseSelection.filter((id) => id !== current.targetId));
        else if (!additive) setSelection([current.targetId]);
        // Çift dokunma / çift tıklama: aç.
        if (lastTap.current?.id === current.targetId && now - lastTap.current.time < 350) {
          lastTap.current = null;
          openItem(current.targetId);
        } else lastTap.current = { id: current.targetId, time: now };
      } else if (current.kind === "pan" || current.kind === "marquee") {
        if (!event.shiftKey && !multiSelect) setSelection([]);
      }
    }
    setLive(null);
    setGuides([]);
    setMarquee(null);
  }

  function onPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    drawStart.current = null;
    pencilRef.current = [];
    setDrawPreview(null);
    setPencilPoints([]);
    pinch.current = null;
    interaction.current = null;
    setPanning(false);
    setLive(null);
    setGuides([]);
    setMarquee(null);
  }

  // Tekerlek: pasif olmayan dinleyici (sayfa kaymasın).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      if (event.ctrlKey || event.metaKey) {
        setVp((current) => zoomAt(current, current.zoom * Math.exp(-event.deltaY * 0.01), sx, sy));
      } else {
        const scale = event.deltaMode === 1 ? 16 : 1;
        setVp((current) => ({ ...current, x: current.x - event.deltaX * scale, y: current.y - event.deltaY * scale }));
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Boşluk tuşu basılıyken kaydırma (yalnız pano odaktayken).
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (event.key === " ") {
      event.preventDefault();
      setSpaceHeld(true);
      return;
    }
    if (mod && key === "z") {
      event.preventDefault();
      if (!editable) return;
      void (event.shiftKey ? redo() : undo());
      return;
    }
    if (mod && key === "y") {
      event.preventDefault();
      if (editable) void redo();
      return;
    }
    if (mod && key === "a") {
      event.preventDefault();
      setSelection(items.map((item) => item.id));
      return;
    }
    if (mod && key === "d") {
      event.preventDefault();
      if (editable) void duplicate(selection, 1);
      return;
    }
    if (mod && key === "c") {
      if (selection.length === 0) return;
      event.preventDefault();
      if (editable) copySelection();
      return;
    }
    if (mod && key === "v") {
      event.preventDefault();
      if (editable) pasteClipboard();
      return;
    }
    if (mod && key === "f") {
      event.preventDefault();
      setSearchOpen(true);
      return;
    }
    if (mod && key === "g") {
      event.preventDefault();
      if (event.shiftKey) ungroupSelection();
      else void groupSelection();
      return;
    }
    if (!mod && key === "c" && editable) {
      event.preventDefault();
      setToolMode(tool === "connect" ? "select" : "connect");
      return;
    }
    if (event.key === "Escape") {
      if (draftPin) {
        setDraftPin(null);
        return;
      }
      if (peek || activeComment) {
        setPeek(false);
        setActiveComment(null);
        return;
      }
      if (activeFrom) {
        setConnectFrom(null);
        setDraftPoint(null);
      } else if (selectedConnId) setSelectedConnId(null);
      else if (tool !== "select" && selection.length === 0) setToolMode("select");
      else setSelection([]);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedConn && selection.length === 0) {
      event.preventDefault();
      void deleteSelectedConnection();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selection.length) {
      event.preventDefault();
      void deleteSelection();
      return;
    }
    if (event.key === "Enter" && selection.length === 1) {
      event.preventDefault();
      openItem(selection[0]);
      return;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      if (ordered.length === 0) return;
      const index = selection.length ? ordered.findIndex((item) => item.id === selection[selection.length - 1]) : -1;
      const next = ordered[(index + (event.key === "]" ? 1 : -1) + ordered.length) % ordered.length];
      centerOn(next.id);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1.2);
      return;
    }
    if (event.key === "-") {
      event.preventDefault();
      zoomBy(1 / 1.2);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      fit();
      return;
    }
    if (event.key.startsWith("Arrow") && selection.length && editable) {
      event.preventDefault();
      const step = nudgeStep(event.shiftKey);
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      patchSelection((geom) => ({ x: clampPosition(geom.x + dx), y: clampPosition(geom.y + dy) }));
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 160 : 48;
      setVp((current) => ({
        ...current,
        x: current.x + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0),
        y: current.y + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
      }));
    }
  }

  // ---- tam ekran ----
  useEffect(() => {
    if (!fullscreen) return;
    lockBodyScroll();
    document.documentElement.setAttribute("data-board-fullscreen", "");
    return () => {
      unlockBodyScroll();
      document.documentElement.removeAttribute("data-board-fullscreen");
    };
  }, [fullscreen]);

  // Telefonda pano sekmesi açılınca pano görünüme gelir (bant uzun; tuval aşağıda kalmasın).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) rootRef.current?.scrollIntoView({ block: "start" });
  }, []);

  // Panodan çıkarken bekleyen yerleşim gönderilir.
  useEffect(() => () => void flushLayout(), [flushLayout]);

  // Workflow aktarımı / güncellemesi sağlayıcının işlevleriyle çalışır (yerel durum ve kaynak yüklemesi güncel kalır).
  const boardIO = useMemo<PlanIO>(
    () => ({
      applyImport,
      addItems,
      addConnections,
      patchItem: (id, patch) => patchItem(id, patch),
      removeItems,
      removeConnections,
    }),
    [applyImport, addItems, addConnections, patchItem, removeItems, removeConnections],
  );

  const selectedItems = items.filter((item) => selectedSet.has(item.id));
  const single = selectedItems.length === 1 ? selectedItems[0] : null;
  // Ekip panosunda workflow dosyaya TEK referans kartı olarak girer; "Adımlara aç" onu mevcut planlayıcıyla ayrı nesnelere (adım kartı, prompt, görsel, oklar)
  // çevirir (docs/history/376-*). Kart yerinde kalır; aynı workflow bu panoda zaten açıldıysa planlayıcı yinelemez.
  const expandWorkflow = async (card: SpaceItem) => {
    if (card.kind !== "content" || card.contentType !== "workflow" || !card.contentId) return;
    setError(null);
    try {
      const input = await loadPlanInput(card.contentId, { fresh: true });
      if (!input) throw new Error(t("wfSpace.import.loadFailed"));
      const title = resolveSource(card, sources, readable).title;
      const result = await runImport({ io: boardIO, spaceId: space.id, workflowId: card.contentId, workflowTitle: title, input, options: { io: true, prompts: true, images: true, relations: true }, existingItems: items, near: { x: card.x, y: card.y + card.h + 40 } });
      setHistory((h) => pushHistory(h, { type: "import", items: result.items, connections: result.connections }));
      setSelection(result.items.map((item) => item.id));
      const { w, h } = viewSize();
      setVp(fitViewport(result.items, w, h));
      if (result.degraded) setUndoNotice(t("wfSpace.objects.degraded"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  };
  const selectionGrouped = selectedItems.some((item) => item.groupId);
  const boardPalettes = palettes.filter((palette) => !items.some((item) => item.kind === "palette" && item.paletteId === palette.id));
  const addMenuItems = [
    { key: "note", label: t("spaces.board.addNote"), icon: StickyNote, onSelect: () => setDialog({ kind: "note", near: viewCenter() }) },
    { key: "draft", label: t("spaces.board.addDraft"), icon: SquareTerminal, onSelect: () => setDialog({ kind: "draft", near: viewCenter() }) },
    { key: "image", label: t("spaces.board.addImage"), icon: ImagePlus, onSelect: () => fileRef.current?.click() },
    { key: "workflow", label: t("wfSpace.import.menu"), icon: WorkflowIcon, onSelect: () => setDialog({ kind: "importWorkflow" }) },
    ...boardPalettes.slice(0, 6).map((palette) => ({
      key: `palette-${palette.id}`,
      label: t("spaces.board.addPalette", { name: palette.name }),
      icon: Palette,
      onSelect: () => void addFromBoard([{ spaceId: space.id, kind: "palette" as const, paletteId: palette.id }]),
    })),
  ];
  const lowDetail = vp.zoom < LOW_DETAIL_ZOOM;
  const cursor = panning ? "cursor-grabbing" : tool === "pan" || spaceHeld ? "cursor-grab" : tool === "connect" || (teamMode && tool !== "select") ? "cursor-crosshair" : "cursor-default";

  const overviewOpen = Boolean(team && pagesUi.overview);
  const rootClass = cn(
    "relative flex scroll-mt-3 flex-col overflow-hidden rounded-xl border border-border-soft bg-surface-soft",
    fullscreen
      ? "fixed inset-0 z-[45] rounded-none border-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
      : teamMode
        ? overviewOpen
          ? // Genel bakış sayfa uzunluğuna göre uzar, iç kaydırma yok: sayfa kendisi kayar (docs/history/370-*).
            // Üst köşeler köşesizdir (üstündeki ekip başlığıyla düz birleşir).
            "h-auto min-h-[calc(100dvh-10rem)] rounded-t-none border-t-0"
          : // Tuval: telefonda üst menü ile alt menü arasını tam doldurur (dvh hesabı Safari'de boşluk bırakıyordu), masaüstünde sabit yükseklik.
            "max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-md:top-16 max-md:z-20 max-md:rounded-none max-md:border-x-0 md:h-[calc(100dvh-8.5rem)]"
        : "h-[72dvh] min-h-[420px] md:h-[calc(100dvh-12rem)]",
  );
  const commentMode = teamMode && tool === "comment";
  const openCommentCount = boardThreads.filter((thread) => !thread.root.resolvedAt).length;
  const selBox = (() => {
    if (!teamMode || selectedItems.length === 0) return null;
    const b = boundsOf(selectedItems.map((entry) => geoms[entry.id]));
    if (!b) return null;
    const tl = worldToScreen(vp, b.x, b.y);
    const br = worldToScreen(vp, b.x + b.w, b.y + b.h);
    return { cx: (tl.x + br.x) / 2, top: tl.y, bottom: br.y };
  })();
  const canMoveSelection = canReview(myRole) || selectedItems.every((entry) => isDrawingKind(entry.kind) || (entry.createdBy === userId && (entry.revState === "draft" || entry.revState === "changes")));
  const itemKindName = (item: SpaceItem) => t(ITEM_KIND_LABEL[item.kind]);

  const teamContentRows: AddRow[] = CONTENT_ADD_ROWS.map((row) => ({ key: row.key, icon: <row.icon size={19} aria-hidden />, label: t(row.label), hint: t(row.hint), run: () => contentAdd.run(row) }));
  const promptlyRows: AddRow[] = teamMode
    ? [
        ...teamContentRows,
        { key: "image", icon: <ImagePlus size={19} aria-hidden />, label: t("tb.add.image"), hint: t("tb.add.imageHint"), run: () => fileRef.current?.click() },
        { key: "note", icon: <StickyNote size={19} aria-hidden />, label: t("tb.add.note"), hint: t("tb.add.noteHint"), run: () => setDialog({ kind: "note", near: viewCenter() }) },
        { key: "palette", icon: <PaletteIcon size={19} aria-hidden />, label: t("tb.add.palette"), hint: t("tb.add.paletteHint"), run: () => setDialog({ kind: "palette" }) },
        ...boardPalettes.slice(0, 4).map((palette) => ({ key: `palette-${palette.id}`, icon: <PaletteIcon size={19} aria-hidden />, label: palette.name, hint: t("tb.add.paletteExisting"), run: () => void addFromBoard([{ spaceId: space.id, kind: "palette" as const, paletteId: palette.id }]) })),
      ]
    : [
      { key: "draft", icon: <SquareTerminal size={19} aria-hidden />, label: t("tb.add.prompt"), hint: t("tb.add.promptHint"), run: () => setDialog({ kind: "draft", near: viewCenter() }) },
      { key: "image", icon: <ImagePlus size={19} aria-hidden />, label: t("tb.add.image"), hint: t("tb.add.imageHint"), run: () => fileRef.current?.click() },
      { key: "note", icon: <StickyNote size={19} aria-hidden />, label: t("tb.add.note"), hint: t("tb.add.noteHint"), run: () => setDialog({ kind: "note", near: viewCenter() }) },
      { key: "palette", icon: <PaletteIcon size={19} aria-hidden />, label: t("tb.add.palette"), hint: t("tb.add.paletteHint"), run: () => setDialog({ kind: "palette" }) },
      ...boardPalettes.slice(0, 4).map((palette) => ({ key: `palette-${palette.id}`, icon: <PaletteIcon size={19} aria-hidden />, label: palette.name, hint: t("tb.add.paletteExisting"), run: () => void addFromBoard([{ spaceId: space.id, kind: "palette" as const, paletteId: palette.id }]) })),
      { key: "workflow", icon: <WorkflowIcon size={19} aria-hidden />, label: t("tb.add.workflow"), hint: t("tb.add.workflowHint"), run: () => setDialog({ kind: "importWorkflow" }) },
      { key: "preset", icon: <SlidersHorizontal size={19} aria-hidden />, label: t("tb.add.preset"), hint: t("tb.add.presetHint"), run: () => setDialog({ kind: "content", type: "preset" }) },
      { key: "request", icon: <Sparkles size={19} aria-hidden />, label: t("tb.add.request"), hint: t("tb.add.requestHint"), run: () => setDialog({ kind: "content", type: "request" }) },
    ];
  const drawingRows: AddRow[] = [
    { key: "text", icon: <Type size={19} aria-hidden />, label: t("tb.kind.text"), hint: t("tb.add.textHint"), tag: t("tb.add.new"), run: () => setToolMode("text"), hidden: !canDraw },
    { key: "frame", icon: <Frame size={19} aria-hidden />, label: t("tb.kind.frame"), hint: t("tb.add.frameHint"), tag: t("tb.add.new"), run: () => setToolMode("frame"), hidden: !canDraw },
    { key: "pencil", icon: <Pencil size={19} aria-hidden />, label: t("tb.tool.pencil"), hint: t("tb.add.pencilHint"), tag: t("tb.add.new"), run: () => setToolMode("pencil"), hidden: !canDraw },
    { key: "shape", icon: <Square size={19} aria-hidden />, label: t("tb.tool.shape"), hint: t("tb.add.shapeHint"), tag: t("tb.add.new"), run: () => { setShape("rect"); setToolMode("rect"); }, hidden: !canDraw },
    { key: "arrow", icon: <MinusLine size={19} className="-rotate-45" aria-hidden />, label: t("tb.add.lineArrow"), hint: t("tb.add.lineHint"), tag: t("tb.add.new"), run: () => { setShape("arrow"); setToolMode("arrow"); }, hidden: !canDraw },
    { key: "connect", icon: <Spline size={19} aria-hidden />, label: t("tb.add.connect"), hint: t("tb.add.connectHint"), run: () => setToolMode("connect") },
  ];
  const zoomProps = {
    zoom: vp.zoom,
    editable,
    hasSelection: selection.length > 0,
    guides: guidesOn,
    minimap: minimapOn,
    fullscreen,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    onZoomIn: () => zoomBy(1.2),
    onZoomOut: () => zoomBy(1 / 1.2),
    onFit: () => {
      const { w, h } = viewSize();
      setVp(fitViewport(items, w, h));
    },
    onFitSelection: fit,
    onPreset: (zoom: number) => {
      const { w, h } = viewSize();
      setVp((current) => zoomAt(current, zoom, w / 2, h / 2));
    },
    onGuides: () => setGuidesOn((on) => !on),
    onMinimap: toggleMinimap,
    onSearch: () => setSearchOpen((open) => !open),
    onShortcuts: () => setDialog({ kind: "shortcuts" }),
    onFullscreen: () => setFullscreen((value) => !value),
    onUndo: () => void undo(),
    onRedo: () => void redo(),
  };
  const shareData = {
    title: team?.fileTitle ?? team?.projectTitle ?? space.title,
    items,
    connections,
    palettes,
    describe: (item: SpaceItem) => {
      const resolved = resolvedMap.get(item.id);
      return { title: itemTitle(item), body: item.kind === "prompt" ? (item.isDraft ? item.body : (resolved?.prompt?.promptText ?? "")) : item.body };
    },
  };
  const composerBody = draftPin && (
    <div className="space-y-3" data-testid="board-comment-composer">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-foreground">{initialsOf(ownProfile?.displayName || ownProfile?.username || "?")}</span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-small font-bold leading-none text-text">{t("tb.comments.newTitle")}</p>
          <CommentTargetChip item={draftPin.itemId ? (items.find((entry) => entry.id === draftPin.itemId) ?? null) : null} itemTitle={itemTitle} />
        </div>
        <button type="button" onClick={() => setDraftPin(null)} aria-label={t("common.cancel")} className="grid h-9 w-9 place-items-center rounded-full text-text-secondary hover:bg-surface-soft">
          <X size={18} aria-hidden />
        </button>
      </div>
      <CommentInput people={team?.people ?? []} placeholder={t("tb.comments.placeholder")} submitLabel={t("tb.comments.send")} autoFocus={!phoneBar} onSubmit={submitDraft} onCancel={() => setDraftPin(null)} />
    </div>
  );
  const commentsPanel = (className?: string) => (
    <CommentsPanel
      className={className}
      threads={panelThreads}
      allScope={allScope}
      onScope={(all) => {
        setAllScope(all);
        if (!all) setScopeThreads(null);
      }}
      scopeLoading={allScope && scopeThreads === null}
      activeId={activeComment}
      items={items}
      itemTitle={itemTitle}
      people={team?.people ?? []}
      myId={userId}
      canModerate={canModerateComments}
      canResolve={canResolveComments}
      onLocate={locate}
      pinsHidden={pinsHidden}
      onTogglePins={setPinsHidden}
      onNew={() => {
        setPinsHidden(false);
        setToolMode("comment");
        if (phoneBar || tabletBar) setPanelOpen(false);
      }}
      onClose={() => setPanelOpen(false)}
      api={pins}
    />
  );

  return (
    <div
      ref={rootRef}
      data-testid="space-board"
      data-fullscreen={fullscreen ? "" : undefined}
      data-board-team={teamMode ? "" : undefined}
      className={rootClass}
    >
      {team && presenting === null && (
        <TeamBoardBar
          team={team}
          commentCount={openCommentCount}
          commentsActive={panelOpen || commentMode}
          onComments={() => setPanelOpen((open) => !open)}
          onShare={() => setShareOpen(true)}
          onInfo={team.onInfo}
        />
      )}
      {team && overviewOpen && <PagesOverview team={team} actions={pageActions.actions} onClose={() => pagesUi.setOverview(false)} />}
      <div className={cn("flex min-h-0 flex-1", overviewOpen && "hidden")}>
      <div className="relative flex min-w-0 flex-1 flex-col">
      {!teamMode && (
        <ScrollRow role="toolbar" aria-label={t("spaces.board.toolbar")} wrapperClassName="z-20 shrink-0 border-b border-border-soft bg-surface" className="items-center gap-1 px-2 py-1.5" data-board-toolbar={phoneBar ? "phone" : "full"}>
          {editable && <SpaceMenu align="left" label={t("spaces.board.add")} trigger={<Plus size={18} aria-hidden />} items={addMenuItems} />}
          {phoneBar ? (
            <>
              <ToolButton icon={SquareDashedMousePointer} label={t("spaces.board.multiSelect")} active={multiSelect} onClick={() => setMultiSelect((value) => !value)} />
              {editable && <ToolButton icon={Spline} label={t("spaces.connect.tool")} active={tool === "connect"} onClick={() => setToolMode(tool === "connect" ? "select" : "connect")} />}
              {editable && (
                <>
                  <Divider />
                  <ToolButton icon={Undo2} label={t("spaces.board.undo")} onClick={() => void undo()} disabled={history.past.length === 0} />
                  <ToolButton icon={Redo2} label={t("spaces.board.redo")} onClick={() => void redo()} disabled={history.future.length === 0} />
                </>
              )}
              <Divider />
              <button type="button" onClick={fit} title={t("spaces.board.fit")} className="h-9 min-w-14 shrink-0 rounded-full px-2 text-caption font-semibold tabular-nums text-text-secondary hover:bg-surface-soft" data-board-zoom={Math.round(vp.zoom * 100)}>
                {Math.round(vp.zoom * 100)}%
              </button>
              <SpaceMenu
                label={t("spaces.board.moreTools")}
                trigger={<Ellipsis size={18} aria-hidden />}
                items={[
                  { key: "groups", label: t("spaces.groups.manage"), icon: Layers, onSelect: () => setDialog({ kind: "groups" }), hidden: !editable },
                  { key: "zoomIn", label: t("spaces.board.zoomIn"), icon: Plus, onSelect: () => zoomBy(1.2) },
                  { key: "zoomOut", label: t("spaces.board.zoomOut"), icon: Minus, onSelect: () => zoomBy(1 / 1.2) },
                  { key: "fit", label: t("spaces.board.fit"), icon: Maximize, onSelect: fit },
                  { key: "search", label: t("spaces.board.search"), icon: Search, onSelect: () => setSearchOpen((open) => !open) },
                  { key: "minimap", label: t("spaces.board.minimap"), icon: MapIcon, onSelect: toggleMinimap },
                  { key: "fullscreen", label: fullscreen ? t("spaces.board.exitFullscreen") : t("spaces.board.fullscreen"), icon: fullscreen ? Minimize2 : Maximize2, onSelect: () => setFullscreen((value) => !value) },
                ]}
              />
            </>
          ) : (
            <>
              <ToolButton icon={MousePointer2} label={t("spaces.board.toolSelect")} active={tool === "select" && !multiSelect} onClick={() => { setToolMode("select"); setMultiSelect(false); }} />
              <ToolButton icon={Hand} label={t("spaces.board.toolPan")} active={tool === "pan"} onClick={() => setToolMode("pan")} />
              <ToolButton icon={SquareDashedMousePointer} label={t("spaces.board.multiSelect")} active={multiSelect} onClick={() => setMultiSelect((value) => !value)} />
              {editable && <ToolButton icon={Spline} label={t("spaces.connect.tool")} active={tool === "connect"} onClick={() => setToolMode(tool === "connect" ? "select" : "connect")} />}
              {editable && (
                <>
                  <Divider />
                  <ToolButton icon={Undo2} label={t("spaces.board.undo")} onClick={() => void undo()} disabled={history.past.length === 0} />
                  <ToolButton icon={Redo2} label={t("spaces.board.redo")} onClick={() => void redo()} disabled={history.future.length === 0} />
                  <ToolButton icon={Layers} label={t("spaces.groups.manage")} onClick={() => setDialog({ kind: "groups" })} />
                </>
              )}
              <Divider />
              <ToolButton icon={Minus} label={t("spaces.board.zoomOut")} onClick={() => zoomBy(1 / 1.2)} />
              <button type="button" onClick={fit} title={t("spaces.board.fit")} className="h-9 min-w-14 shrink-0 rounded-full px-2 text-caption font-semibold tabular-nums text-text-secondary hover:bg-surface-soft" data-board-zoom={Math.round(vp.zoom * 100)}>
                {Math.round(vp.zoom * 100)}%
              </button>
              <ToolButton icon={Plus} label={t("spaces.board.zoomIn")} onClick={() => zoomBy(1.2)} />
              <ToolButton icon={Maximize} label={t("spaces.board.fit")} onClick={fit} />
              <ToolButton icon={Search} label={t("spaces.board.search")} active={searchOpen} onClick={() => setSearchOpen((open) => !open)} />
              <ToolButton icon={MapIcon} label={t("spaces.board.minimap")} active={minimapOn} onClick={toggleMinimap} className="max-sm:hidden" />
              <ToolButton icon={Keyboard} label={t("spaces.board.shortcuts")} onClick={() => setDialog({ kind: "shortcuts" })} />
              <ToolButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? t("spaces.board.exitFullscreen") : t("spaces.board.fullscreen")} onClick={() => setFullscreen((value) => !value)} />
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
            {uploading && <Loader2 size={16} className="animate-spin text-text-muted" aria-label={t("spaces.images.uploadingShort")} />}
            <SaveIndicator status={layoutStatus} onRetry={() => void flushLayout()} className="ml-0" />
          </div>
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ""; }} />
        </ScrollRow>
      )}
      {team && presenting === null && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-2.5 pt-2.5">
          <BoardToolbar
            size={size}
            editable={editable}
            canDraw={canDraw}
            tool={tool}
            onTool={setToolMode}
            multiSelect={multiSelect}
            onMultiSelect={() => setMultiSelect((value) => !value)}
            shape={shape}
            onShape={setShape}
            pencilWidth={pencilWidth}
            onPencilWidth={setPencilWidth}
            pagesSlot={<PagesButton buttonRef={pagesUi.buttonRef} team={team} open={pagesUi.menuOpen} onClick={() => pagesUi.setMenuOpen((open) => !open)} compact={size === "phone"} />}
            zoomPercent={Math.round(vp.zoom * 100)}
            zoomProps={zoomProps}
            promptlyRows={promptlyRows}
            drawingRows={drawingRows}
            onAddNote={() => setDialog({ kind: "note", near: viewCenter() })}
            onPresent={startPresent}
            canPresent={frameList.length > 0}
            onGroups={() => setDialog({ kind: "groups" })}
            onComments={() => setPanelOpen(true)}
            onShortcuts={() => setDialog({ kind: "shortcuts" })}
          />
        </div>
      )}
      {teamMode && <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ""; }} />}



      {/* Tuval */}
      <div
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-roledescription={t("spaces.board.roleDescription")}
        aria-label={t("spaces.board.ariaLabel", { count: items.length })}
        data-board-canvas=""
        className={cn("relative min-h-0 flex-1 touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", cursor)}
        style={{ backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)", backgroundSize: `${24 * vp.zoom}px ${24 * vp.zoom}px`, backgroundPosition: `${vp.x}px ${vp.y}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => event.key === " " && setSpaceHeld(false)}
        onBlur={() => setSpaceHeld(false)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div data-board-world="" className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }}>
          {frames.map((frame) => {
            const group = groups.find((entry) => entry.id === frame.groupId);
            if (!group) return null;
            const colors = SPACE_COLOR_CLASS[group.color];
            return (
              <div key={frame.groupId} data-group-frame={group.id} className={cn("pointer-events-none absolute rounded-xl border-2 border-dashed", colors.border)} style={{ left: frame.rect.x, top: frame.rect.y, width: frame.rect.w, height: frame.rect.h, zIndex: 0 }}>
                <span
                  data-group-label={group.id}
                  className={cn("pointer-events-auto absolute left-2 top-1.5 inline-flex max-w-[calc(100%-1rem)] cursor-pointer items-center gap-1 truncate rounded-full px-2.5 py-1 text-caption font-semibold", colors.surface, colors.text)}
                >
                  <Group size={12} aria-hidden />
                  <span className="truncate">{group.name}</span>
                  <span className="opacity-70">{frame.count}</span>
                </span>
              </div>
            );
          })}
          <BoardConnectors
            connections={connections}
            boxes={geoms}
            zoom={vp.zoom}
            selectedId={selectedConnId}
            draft={draft}
            interactive
            lowDetail={lowDetail}
            titleOf={(itemId) => {
              const target = items.find((entry) => entry.id === itemId);
              return target ? itemTitle(target) : "";
            }}
          />
          {guides.map((guide, index) =>
            guide.axis === "x" ? (
              <div key={`gx${index}`} data-board-guide="x" className="pointer-events-none absolute bg-secondary" style={{ left: guide.pos - 0.5 / vp.zoom, top: guide.from, width: 1 / vp.zoom, height: guide.to - guide.from, zIndex: 9000 }} />
            ) : (
              <div key={`gy${index}`} data-board-guide="y" className="pointer-events-none absolute bg-secondary" style={{ left: guide.from, top: guide.pos - 0.5 / vp.zoom, width: guide.to - guide.from, height: 1 / vp.zoom, zIndex: 9000 }} />
            ),
          )}
          {ordered.map((item) => {
            const geom = geoms[item.id];
            const selected = selectedSet.has(item.id) || item.id === activeFrom;
            const attached = item.attachedItemId ? items.find((entry) => entry.id === item.attachedItemId) : null;
            return (
              <BoardItem
                key={item.id}
                item={item}
                x={geom.x}
                y={geom.y}
                w={geom.w}
                h={geom.h}
                z={geom.z}
                selected={selected}
                showHandle={editable && !item.locked && selectedSet.has(item.id) && selection.length === 1}
                resolved={resolvedMap.get(item.id)!}
                palette={item.paletteId ? (palettes.find((palette) => palette.id === item.paletteId) ?? null) : null}
                attachedTitle={attached ? itemTitle(attached) : null}
                lowDetail={lowDetail}
              />
            );
          })}
          {teamMode && commentMode && hoverId && geoms[hoverId] && (
            <div aria-hidden data-board-hover={hoverId} className="pointer-events-none absolute rounded-lg border-2 border-dashed border-primary bg-primary/5" style={{ left: geoms[hoverId].x - 4, top: geoms[hoverId].y - 4, width: geoms[hoverId].w + 8, height: geoms[hoverId].h + 8, zIndex: 8000 }}>
              <span className="absolute -top-7 left-0 inline-flex h-6 items-center whitespace-nowrap rounded-md bg-primary px-2 text-caption font-bold text-primary-foreground" style={{ transform: `scale(${1 / vp.zoom})`, transformOrigin: "left bottom" }}>
                {(() => {
                  const target = items.find((entry) => entry.id === hoverId);
                  return target ? `${itemKindName(target)} · ${itemTitle(target)}` : "";
                })()}
              </span>
            </div>
          )}
          {teamMode && hlItemId && geoms[hlItemId] && (
            <div aria-hidden data-board-highlight={hlItemId} className="pointer-events-none absolute rounded-lg border-2 border-primary bg-primary/10" style={{ left: geoms[hlItemId].x - 4, top: geoms[hlItemId].y - 4, width: geoms[hlItemId].w + 8, height: geoms[hlItemId].h + 8, zIndex: 8000 }} />
          )}
          {drawPreview && (() => {
            const box = dragBox(drawPreview.ax, drawPreview.ay, drawPreview.bx, drawPreview.by);
            if (drawPreview.tool === "line" || drawPreview.tool === "arrow") {
              const line = lineShape(drawPreview.ax, drawPreview.ay, drawPreview.bx, drawPreview.by);
              return (
                <div aria-hidden className="pointer-events-none absolute" style={{ left: line.box.x, top: line.box.y, zIndex: 8000 }}>
                  <ShapeSvg w={line.box.w} h={line.box.h} data={{ shape: drawPreview.tool, fill: false, sw: 4, points: line.points }} color="primary" />
                </div>
              );
            }
            return <div aria-hidden data-board-draw-preview="" className={cn("pointer-events-none absolute border-2 border-dashed border-primary bg-primary/5", drawPreview.tool === "oval" ? "rounded-[50%]" : "rounded-md")} style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: 8000 }} />;
          })()}
          {pencilPoints.length > 1 && (
            <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} style={{ zIndex: 8000 }}>
              <path d={pencilPoints.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth={pencilWidth} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        {teamMode && presenting === null && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" data-board-pins="">
            {!pinsHidden && pins.threads.map((thread) => {
              const pos = pinWorldPosition(thread.root, itemPositions);
              if (!pos) return null;
              const at = worldToScreen(vp, pos.x, pos.y);
              if (at.x < -40 || at.y < -40 || at.x > view.w + 40 || at.y > view.h + 80) return null;
              return <PinMarker key={thread.root.id} comment={thread.root} x={at.x} y={at.y} active={activeComment === thread.root.id} replies={thread.replies.length} onSelect={() => { setActiveComment(thread.root.id); if (!phoneBar) setPanelOpen(true); else setPeek(true); }} />;
            })}
            {draftPin && (() => {
              const at = worldToScreen(vp, draftPin.x, draftPin.y);
              return <PinMarker comment={null} draft x={at.x} y={at.y} active />;
            })()}
          </div>
        )}
        {minimapOn && <BoardMinimap geoms={boardGeoms} vp={vp} view={view} onNavigate={(wx, wy) => setVp((current) => ({ ...current, x: view.w / 2 - wx * current.zoom, y: view.h / 2 - wy * current.zoom }))} />}
        {searchOpen && (
          <BoardSearch
            haystack={items.map((item) => ({ id: item.id, text: [itemTitle(item), item.title, item.body, item.note].filter(Boolean).join(" ") }))}
            onFocusItem={centerOn}
            onClose={() => {
              setSearchOpen(false);
              canvasRef.current?.focus({ preventScroll: true });
            }}
          />
        )}
        {editable && (
          <WorkflowSyncBar
            spaceId={space.id}
            items={items}
            connections={connections}
            io={boardIO}
            onDone={(kind, degraded) => setUndoNotice(degraded ? t("wfSpace.objects.degraded") : t(kind === "convert" ? "wfSpace.legacy.done" : "wfSpace.sync.done"))}
            onError={(message) => setError(message)}
          />
        )}
        {tool === "connect" && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
            <div role="status" data-board-connect-hint="" className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-text px-3.5 py-1.5 text-small text-background shadow-pop">
              <Spline size={14} aria-hidden />
              <span className="min-w-0 truncate">{activeFrom ? t("spaces.connect.hintTo") : t("spaces.connect.hintFrom")}</span>
              <button type="button" onClick={() => setToolMode("select")} className="shrink-0 font-semibold underline underline-offset-2">
                {t("spaces.connect.exit")}
              </button>
            </div>
          </div>
        )}
        {marquee && <div aria-hidden className="pointer-events-none absolute rounded-sm border border-primary bg-primary/10" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}

        {items.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-2">
              <p className="text-h3 font-semibold text-text">{t("spaces.board.emptyTitle")}</p>
              <p className="text-small text-text-secondary">{editable ? t("spaces.board.emptyEditor") : t("spaces.board.emptyViewer")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Bildirimler */}
      {(error || layoutNotice || undoNotice) && (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center px-3">
          <div role={error ? "alert" : "status"} className={cn("pointer-events-auto flex max-w-lg items-center gap-2 rounded-full px-3.5 py-2 text-small shadow-pop", error ? "bg-danger text-white" : "bg-text text-background")}>
            <span className="min-w-0 break-words">{error ?? layoutNotice ?? undoNotice}</span>
            {!error && undoNotice && editable && (
              <button type="button" onClick={() => void undo()} className="shrink-0 font-semibold underline underline-offset-2">
                {t("spaces.board.undo")}
              </button>
            )}
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={() => {
                setError(null);
                setUndoNotice(null);
                dismissLayoutNotice();
              }}
              className="shrink-0 rounded-full p-0.5 opacity-80 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Seçim çubuğu (her ekranda; dokunmada bağlam menüsünün yerine) */}
      {selectedItems.length > 0 && !selectedConn && (
        <div
          className={cn("pointer-events-none absolute z-30 flex justify-center", teamMode && size !== "phone" && selBox ? "" : "inset-x-0 bottom-3 px-3")}
          style={
            teamMode && size !== "phone" && selBox
              ? { left: Math.min(Math.max(selBox.cx, Math.min(300, view.w / 2)), view.w - Math.min(300, view.w / 2)), top: selBox.top - 56 >= 64 ? selBox.top - 56 : Math.min(selBox.bottom + 12, view.h - 60), transform: "translateX(-50%)", maxWidth: "calc(100% - 1rem)" }
              : undefined
          }
        >
          <div role="toolbar" aria-label={t("spaces.board.selectionToolbar")} data-board-selection={selectedItems.length} className="scrollbar-none pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border-soft bg-surface px-1.5 py-1 shadow-pop">
            <span className="shrink-0 px-2 text-caption font-semibold text-text-secondary">{t("spaces.board.selected", { count: selectedItems.length })}</span>
            {single && single.kind !== "palette" && single.kind !== "shape" && <ToolButton icon={ArrowUpRight} label={t("spaces.board.open")} onClick={() => openItem(single.id)} />}
            {teamMode && editable && single && single.kind === "content" && single.contentType === "workflow" && <ToolButton icon={WorkflowIcon} label={t("tf.board.expandWorkflow")} onClick={() => void expandWorkflow(single)} />}
            {editable && single && single.kind !== "note" && single.kind !== "palette" && !isDrawingKind(single.kind) && <ToolButton icon={StickyNote} label={t("spaces.board.attachNote")} onClick={() => setDialog({ kind: "note", attachTo: single.id })} />}
            {editable && (
              <>
                {selectedItems.some(isDuplicable) && <ToolButton icon={Copy} label={t("spaces.board.duplicate")} onClick={() => void duplicate(selection, 1)} />}
                <ToolButton
                  icon={selectedItems.every((item) => item.locked) ? LockOpen : Lock}
                  label={selectedItems.every((item) => item.locked) ? t("spaces.board.unlock") : t("spaces.board.lock")}
                  active={selectedItems.every((item) => item.locked)}
                  onClick={() => void toggleLock()}
                />
                <ToolButton icon={BringToFront} label={t("spaces.board.bringFront")} onClick={() => stack("front")} />
                <ToolButton icon={SendToBack} label={t("spaces.board.sendBack")} onClick={() => stack("back")} />
                {selectedItems.length >= 2 && <ToolButton icon={Group} label={t("spaces.board.group")} onClick={() => void groupSelection()} />}
                {selectedItems.length >= 2 && <ToolButton icon={Spline} label={t("spaces.connect.selection")} onClick={() => void connectItems(chainPairs(selection, connections))} />}
                {selectionGrouped && <ToolButton icon={Ungroup} label={t("spaces.board.ungroup")} onClick={ungroupSelection} />}
                {selectedItems.length >= 2 && (
                  <SpaceMenu
                    label={t("spaces.board.align")}
                    trigger={<AlignStartVertical size={17} aria-hidden />}
                    items={[
                      { key: "left", label: t("spaces.board.alignLeft"), icon: AlignStartVertical, onSelect: () => align("left") },
                      { key: "centerX", label: t("spaces.board.alignCenterX"), icon: AlignCenterVertical, onSelect: () => align("centerX") },
                      { key: "right", label: t("spaces.board.alignRight"), icon: AlignEndVertical, onSelect: () => align("right") },
                      { key: "top", label: t("spaces.board.alignTop"), icon: AlignStartHorizontal, onSelect: () => align("top") },
                      { key: "centerY", label: t("spaces.board.alignCenterY"), icon: AlignCenterHorizontal, onSelect: () => align("centerY") },
                      { key: "bottom", label: t("spaces.board.alignBottom"), icon: AlignEndHorizontal, onSelect: () => align("bottom") },
                      { key: "distX", label: t("spaces.board.distributeX"), icon: AlignHorizontalDistributeCenter, onSelect: () => align("distributeX"), hidden: selectedItems.length < 3 },
                      { key: "distY", label: t("spaces.board.distributeY"), icon: AlignVerticalDistributeCenter, onSelect: () => align("distributeY"), hidden: selectedItems.length < 3 },
                      { key: "tidy", label: t("spaces.board.tidy"), icon: LayoutGrid, onSelect: () => align("tidy") },
                    ]}
                  />
                )}
                {teamMode && canDraw && selectedItems.every((entry) => entry.kind === "shape" || entry.kind === "text" || entry.kind === "frame") && <StyleControls items={selectedItems} onPatch={(patch) => void restyle(patch)} />}
                {team && team.pages.length > 1 && !team.archived && (
                  <button
                    ref={moveRef}
                    type="button"
                    onClick={() => setMoveOpen((open) => !open)}
                    aria-haspopup="dialog"
                    aria-expanded={moveOpen}
                    data-board-move-button=""
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-caption font-bold text-primary"
                  >
                    {t(size === "desktop" ? "tb.move.button" : "tb.move.buttonShort")}
                  </button>
                )}
                <ToolButton icon={Trash2} label={t(teamMode ? "tf.board.removeFromBoard" : "spaces.board.remove")} onClick={() => void deleteSelection()} danger />
                {teamMode && fileBacked.length > 0 && !team?.archived && <ToolButton icon={Trash2} label={t("tf.board.deleteFromFile")} onClick={() => setConfirmFileDelete(true)} danger />}
              </>
            )}
            <ToolButton icon={X} label={t("spaces.board.clearSelection")} onClick={() => setSelection([])} />
          </div>
        </div>
      )}

      {selectedConn && (
        <ConnectionBar
          connection={selectedConn}
          editable={editable}
          onPatch={(patch) => void patchSelectedConnection(patch)}
          onReverse={() => void patchSelectedConnection({ fromItemId: selectedConn.toItemId, toItemId: selectedConn.fromItemId })}
          onDelete={() => void deleteSelectedConnection()}
          onClose={() => setSelectedConnId(null)}
        />
      )}

      {dialog?.kind === "detail" && <ItemDetailModal drawer itemId={dialog.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === "note" && <NoteEditorModal note={dialog.item ?? null} attachTo={dialog.attachTo ?? null} near={dialog.near} onClose={() => setDialog(null)} />}
      {dialog?.kind === "draft" && <DraftEditorModal draft={dialog.item ?? null} near={dialog.near} onClose={() => setDialog(null)} />}
      {dialog?.kind === "groups" && <GroupsManagerModal onClose={() => setDialog(null)} />}
      {dialog?.kind === "importWorkflow" && (
        <WorkflowImportModal
          spaceVisibility={space.visibility}
          items={items}
          onClose={() => setDialog(null)}
          onImport={async ({ workflow, options }) => {
            // Hata pencerede gösterilsin diye `addFromBoard` değil doğrudan çalıştırılır; geri al tek adımdır (`import`).
            const input = await loadPlanInput(workflow.id, { fresh: true });
            if (!input) throw new Error(t("wfSpace.import.loadFailed"));
            const result = await runImport({ io: boardIO, spaceId: space.id, workflowId: workflow.id, workflowTitle: workflow.title, input, options, existingItems: items, near: viewCenter() });
            // Aynı workflow bu panoda eski tek parça çerçeve olarak duruyorsa yeni nesnelerle yan yana kalmasın.
            const frames = legacyFramesOf(items, workflow.id);
            if (frames.length) await removeItems(frames.map((frame) => frame.id));
            setHistory((h) => pushHistory(h, { type: "import", items: result.items, connections: result.connections }));
            setSelection(result.items.map((item) => item.id));
            const { w, h } = viewSize();
            setVp(fitViewport(result.items, w, h));
            if (result.degraded) setUndoNotice(t("wfSpace.objects.degraded"));
          }}
        />
      )}
      {contentAdd.dialog}
      {confirmFileDelete && (
        <ConfirmDialog
          id="board-file-delete-title"
          title={t("tf.board.deleteFromFileTitle", { count: fileBacked.length })}
          body={t("tf.board.deleteFromFileBody")}
          confirmLabel={t("tf.board.deleteFromFile")}
          danger
          busy={fileDeleteBusy}
          error={null}
          overLayers
          onCancel={() => setConfirmFileDelete(false)}
          onConfirm={() => void deleteFromFile()}
        />
      )}
      {dialog?.kind === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "text" && <TextItemDialog item={dialog.item ?? null} onClose={() => setDialog(null)} onSave={(values) => saveText(values, dialog.item ?? null, dialog.near)} />}
      {dialog?.kind === "frame" && <FrameDialog item={dialog.item} onClose={() => setDialog(null)} onSave={async (values) => { await patchItem(dialog.item.id, { title: values.title, color: values.color }); }} />}
      {dialog?.kind === "content" && (
        <ContentPickerDialog
          type={dialog.type}
          onClose={() => setDialog(null)}
          onPick={async (row) => {
            const created = await addItems(place([{ spaceId: space.id, kind: "content", contentType: dialog.type, contentId: row.id, title: row.title }], viewCenter()));
            setHistory((h) => pushHistory(h, { type: "add", items: created }));
            setSelection(created.map((entry) => entry.id));
          }}
        />
      )}
      {dialog?.kind === "palette" && <NewPaletteDialog onClose={() => setDialog(null)} />}

      {/* Ekip modu katmanları (docs/history/367-*) */}
      {commentMode && !draftPin && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3">
          <div role="status" data-board-comment-hint="" className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-text py-2 pl-5 pr-2 text-small text-background shadow-pop">
            <span className="min-w-0 flex-1">{t("tb.comments.hint")}</span>
            <button type="button" onClick={() => setToolMode("select")} aria-label={t("tb.comments.exitMode")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background/15">
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>
      )}
      {draftPin && composerBody && (() => {
        if (size === "phone") return <BoardSheet onClose={() => setDraftPin(null)}>{composerBody}</BoardSheet>;
        const at = worldToScreen(vp, draftPin.x, draftPin.y);
        const left = Math.max(8, Math.min(at.x + 20, view.w - 344));
        const top = Math.max(8, Math.min(at.y - 44, view.h - 270));
        return (
          <div className="absolute z-40 w-[21rem] rounded-2xl border border-border-soft bg-surface p-3.5 shadow-pop animate-pop-in" style={{ left, top }}>
            {composerBody}
          </div>
        );
      })()}
      {peek && activeThread && phoneBar && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30">
          <CommentPeek
            thread={activeThread}
            index={Math.max(0, openBoardThreads.findIndex((entry) => entry.root.id === activeThread.root.id))}
            total={openBoardThreads.length}
            items={items}
            itemTitle={itemTitle}
            onPrev={() => {
              const index = openBoardThreads.findIndex((entry) => entry.root.id === activeThread.root.id);
              const next = openBoardThreads[(index - 1 + openBoardThreads.length) % openBoardThreads.length];
              if (next) locate(next);
            }}
            onNext={() => {
              const index = openBoardThreads.findIndex((entry) => entry.root.id === activeThread.root.id);
              const next = openBoardThreads[(index + 1) % openBoardThreads.length];
              if (next) locate(next);
            }}
            onList={() => {
              setPeek(false);
              setPanelOpen(true);
            }}
          />
        </div>
      )}
      {team && pagesUi.menuOpen && pagesUi.drawer && <PagesDrawer team={team} actions={pageActions.actions} onClose={() => pagesUi.setMenuOpen(false)} onOverview={() => pagesUi.setOverview(true)} />}
      {team && pagesUi.menuOpen && !pagesUi.drawer && <PagesPopover anchorRef={pagesUi.buttonRef} team={team} actions={pageActions.actions} onClose={() => pagesUi.setMenuOpen(false)} onOverview={() => pagesUi.setOverview(true)} />}
      {team && moveOpen && selectedItems.length > 0 && <MovePopover anchorRef={moveRef} team={team} count={selectedItems.length} canMove={canMoveSelection} onClose={() => setMoveOpen(false)} onRun={runTransfer} />}
      {team && panelOpen && size === "tablet" && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-[21rem] max-w-[92%] border-l border-border-soft bg-surface shadow-pop animate-fade-in">{commentsPanel("w-full")}</div>
      )}
      {team && panelOpen && size === "phone" && (
        <BoardSheet onClose={() => setPanelOpen(false)}>
          <div className="h-[min(62dvh,34rem)]">{commentsPanel("h-full")}</div>
        </BoardSheet>
      )}
      {presenting !== null && frameList.length > 0 && (
        <PresentBar index={Math.min(presenting, frameList.length - 1)} total={frameList.length} title={frameList[Math.min(presenting, frameList.length - 1)]?.title ?? ""} onPrev={() => setPresenting((n) => Math.max(0, (n ?? 0) - 1))} onNext={() => setPresenting((n) => Math.min(frameList.length - 1, (n ?? 0) + 1))} onExit={exitPresent} />
      )}
      </div>
      {team && panelOpen && size === "desktop" && presenting === null && (
        <aside className="flex w-[23.75rem] shrink-0 border-l border-border-soft bg-surface" data-testid="board-comments-aside">
          {commentsPanel("w-full")}
        </aside>
      )}
      </div>
      {team && shareOpen && (
        <ShareDialog
          team={team}
          data={shareData}
          canInvite={team.canInvite}
          canExport={canAddToArea(myRole)}
          canEditAccess={team.canEditAccess}
          onInvite={() => {
            setShareOpen(false);
            team.onInvite();
          }}
          onEditAccess={() => {
            setShareOpen(false);
            team.onEditAccess();
          }}
          onClose={() => setShareOpen(false)}
        />
      )}
      {pageActions.nodes}
    </div>
  );
}

function ToolButton({ icon: Icon, label, onClick, active, disabled, danger, className }: { icon: IconComponent; label: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
        active ? "bg-primary-soft text-primary" : danger ? "text-danger hover:bg-danger/10" : "text-text-secondary hover:bg-surface-soft hover:text-text",
        className,
      )}
    >
      <Icon size={17} aria-hidden />
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border-soft" />;
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ["↑ ↓ ← →", t("spaces.shortcuts.nudge")],
    ["Shift + ↑ ↓ ← →", t("spaces.shortcuts.nudgeBig")],
    ["Delete / Backspace", t("spaces.shortcuts.delete")],
    ["⌘/Ctrl + Z", t("spaces.board.undo")],
    ["⌘/Ctrl + Shift + Z · ⌘/Ctrl + Y", t("spaces.board.redo")],
    ["⌘/Ctrl + A", t("spaces.shortcuts.selectAll")],
    ["⌘/Ctrl + G · ⌘/Ctrl + Shift + G", t("spaces.shortcuts.group")],
    ["C", t("spaces.shortcuts.connect")],
    ["⌘/Ctrl + D", t("spaces.board.duplicate")],
    ["⌘/Ctrl + C · ⌘/Ctrl + V", t("spaces.shortcuts.copyPaste")],
    ["⌘/Ctrl + F", t("spaces.board.search")],
    ["Enter", t("spaces.board.open")],
    ["[ · ]", t("spaces.shortcuts.cycle")],
    ["+ · − · 0", t("spaces.shortcuts.zoom")],
    [t("spaces.shortcuts.spaceKey"), t("spaces.shortcuts.pan")],
    ["Esc", t("spaces.board.clearSelection")],
  ];
  return (
    <SpaceDialog title={t("spaces.board.shortcuts")} onClose={onClose}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
        {rows.map(([keys, label]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="rounded-md border border-border bg-surface-soft px-1.5 py-0.5 font-mono text-caption text-text">{keys}</kbd>
            </dt>
            <dd className="text-text-secondary">{label}</dd>
          </div>
        ))}
      </dl>
    </SpaceDialog>
  );
}
