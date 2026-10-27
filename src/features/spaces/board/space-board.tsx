"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  BringToFront,
  Copy,
  ExternalLink,
  Group,
  Hand,
  ImagePlus,
  Keyboard,
  LayoutGrid,
  Layers,
  Loader2,
  Map as MapIcon,
  Maximize,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Palette,
  Plus,
  Redo2,
  Search,
  SendToBack,
  Spline,
  SquareDashedMousePointer,
  SquareTerminal,
  StickyNote,
  Trash2,
  Undo2,
  Ungroup,
  Workflow as WorkflowIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { WorkflowImportModal } from "../workflow-import-modal";
import { BoardConnectors, type ConnectorDraft } from "./board-connectors";
import { BoardMinimap } from "./board-minimap";
import { BoardSearch } from "./board-search";
import { ConnectionBar } from "./connection-bar";
import { WorkflowSyncBar } from "./workflow-sync-bar";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslation } from "@/lib/i18n/language-provider";
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
import { loadPlanInput, runImport, type PlanIO } from "@/lib/supabase/workflow-board";
import { createSpaceGroup, uploadSpaceImage, type LayoutEntry, type SpaceConnection, type SpaceConnectionPatch, type SpaceItem } from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";
import { DraftEditorModal, GroupsManagerModal, ItemDetailModal, NoteEditorModal, resolveSource, usePlaceNewItems, useItemTitle, type ResolvedSource } from "../space-items";
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
  kind: "move" | "resize" | "pan" | "marquee";
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

function geomOf(item: SpaceItem): Geom {
  return { x: item.x, y: item.y, w: item.w, h: item.h, z: item.z, groupId: item.groupId };
}

function toEntry(id: string, geom: Geom): LayoutEntry {
  return { id, x: geom.x, y: geom.y, w: geom.w, h: geom.h, z: geom.z, groupId: geom.groupId };
}

function toNewConnection(c: SpaceConnection) {
  return { id: c.id, spaceId: c.spaceId, fromItemId: c.fromItemId, toItemId: c.toItemId, label: c.label, lineStyle: c.lineStyle, arrow: c.arrow, route: c.route, color: c.color, sourceWorkflowId: c.sourceWorkflowId, sourceRole: c.sourceRole };
}

export function SpaceBoard({ focusId }: { focusId: string | null }) {
  const { t } = useTranslation();
  const { space, items, groups, palettes, sources, readable, caps, setItems, setGroups, queueLayout, layoutStatus, flushLayout, layoutNotice, dismissLayoutNotice, addItems, removeItems, patchItem, userId, connections, addConnections, removeConnections, patchConnection } =
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
  const [tool, setTool] = useState<"select" | "pan" | "connect">("select");
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
        if (!item) continue;
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

  const deleteSelection = useCallback(async () => {
    if (!editable || selection.length === 0) return;
    setError(null);
    try {
      // Uçlarından biri silinen oklar sunucuda kendiliğinden gider; geri almada öğelerle birlikte geri gelsin diye saklanır.
      const touching = connections.filter((c) => selection.includes(c.fromItemId) || selection.includes(c.toItemId));
      const removed = await removeItems(selection);
      setHistory((h) => pushHistory(h, { type: "delete", items: removed, connections: touching }));
      setSelection([]);
      setUndoNotice(t("spaces.board.removed", { count: removed.length }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }, [editable, selection, connections, removeItems, t]);

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
  const setToolMode = useCallback((next: "select" | "pan" | "connect") => {
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
      if (item.kind === "note") setDialog(editable ? { kind: "note", item } : { kind: "detail", id });
      else if (item.kind === "prompt" && item.isDraft && editable) setDialog({ kind: "draft", item });
      else if (item.kind !== "palette") setDialog({ kind: "detail", id });
    },
    [items, editable],
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

    if (handle && editable && !wantsPan) {
      interaction.current = { ...base, kind: "resize", targetId: handle, origin: { [handle]: geoms[handle] } };
      return;
    }
    if (frame && !wantsPan) {
      const members = items.filter((item) => item.groupId === frame).map((item) => item.id);
      setSelection(members);
      interaction.current = editable ? { ...base, kind: "move", origin: Object.fromEntries(members.map((id) => [id, geoms[id]])) } : { ...base, kind: "pan" };
      return;
    }
    if (itemId && !wantsPan) {
      let next = selection;
      if (additive) next = selectedSet.has(itemId) ? selection : [...selection, itemId];
      else if (!selectedSet.has(itemId)) next = [itemId];
      setSelection(next);
      interaction.current = editable
        ? { ...base, kind: "move", origin: Object.fromEntries(next.map((id) => [id, geoms[id]]).filter(([, geom]) => geom)) }
        : { ...base, kind: event.pointerType === "mouse" ? "marquee" : "pan" };
      return;
    }
    // Boş alan: dokunmada (Seç modu dışında) kaydırma, farede seçim kutusu.
    const marqueeMode = !wantsPan && (event.pointerType === "mouse" || event.pointerType === "pen" || multiSelect);
    interaction.current = { ...base, kind: marqueeMode ? "marquee" : "pan", baseSelection: additive ? selection : [] };
    if (!marqueeMode) setPanning(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
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

    if (current.kind === "pan") {
      setVp({ ...current.vpStart, x: current.vpStart.x + dx, y: current.vpStart.y + dy });
    } else if (current.kind === "move") {
      const next: Record<string, Geom> = {};
      for (const [id, origin] of Object.entries(current.origin)) {
        const x = origin.x + dx / zoom;
        const y = origin.y + dy / zoom;
        next[id] = { ...origin, x: clampPosition(event.altKey ? x : snap(x)), y: clampPosition(event.altKey ? y : snap(y)) };
      }
      // Akıllı kılavuzlar: taşınanların birleşik kutusu diğer nesnelerin kenar/ortasına yaklaşınca oraya yakalanır (Alt: kapalı).
      let found: Guide[] = [];
      if (!event.altKey) {
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
      if (activeFrom) {
        setConnectFrom(null);
        setDraftPoint(null);
      } else if (selectedConnId) setSelectedConnId(null);
      else if (tool === "connect" && selection.length === 0) setToolMode("select");
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
      addItems,
      addConnections,
      patchItem: (id, patch) => patchItem(id, patch),
      removeItems,
      removeConnections,
      createGroup: async (name) => {
        if (!userId) return null;
        try {
          const group = await createSpaceGroup(space.id, name, userId, groups.length);
          setGroups((list) => [...list, group]);
          return group;
        } catch {
          return null;
        }
      },
    }),
    [addItems, addConnections, patchItem, removeItems, removeConnections, userId, space.id, groups.length, setGroups],
  );

  const selectedItems = items.filter((item) => selectedSet.has(item.id));
  const single = selectedItems.length === 1 ? selectedItems[0] : null;
  const selectionGrouped = selectedItems.some((item) => item.groupId);
  const boardPalettes = palettes.filter((palette) => !items.some((item) => item.kind === "palette" && item.paletteId === palette.id));
  const lowDetail = vp.zoom < LOW_DETAIL_ZOOM;
  const cursor = panning ? "cursor-grabbing" : tool === "pan" || spaceHeld ? "cursor-grab" : tool === "connect" ? "cursor-crosshair" : "cursor-default";

  return (
    <div
      ref={rootRef}
      data-testid="space-board"
      data-fullscreen={fullscreen ? "" : undefined}
      className={cn(
        "relative flex scroll-mt-3 flex-col overflow-hidden rounded-xl border border-border-soft bg-surface-soft",
        fullscreen ? "fixed inset-0 z-[45] rounded-none border-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" : "h-[72dvh] min-h-[420px] md:h-[calc(100dvh-12rem)]",
      )}
    >
      {/* Üst araç çubuğu */}
      <ScrollRow role="toolbar" aria-label={t("spaces.board.toolbar")} wrapperClassName="z-20 shrink-0 border-b border-border-soft bg-surface" className="items-center gap-1 px-2 py-1.5">
        {editable && (
          <SpaceMenu
            align="left"
            label={t("spaces.board.add")}
            trigger={<Plus size={18} aria-hidden />}
            items={[
              { key: "note", label: t("spaces.board.addNote"), icon: StickyNote, onSelect: () => setDialog({ kind: "note", near: viewCenter() }) },
              { key: "draft", label: t("spaces.board.addDraft"), icon: SquareTerminal, onSelect: () => setDialog({ kind: "draft", near: viewCenter() }) },
              { key: "image", label: t("spaces.board.addImage"), icon: ImagePlus, onSelect: () => fileRef.current?.click() },
              { key: "workflow", label: t("wfSpace.import.menu"), icon: WorkflowIcon, onSelect: () => setDialog({ kind: "importWorkflow" }) },
              ...boardPalettes.slice(0, 6).map((palette) => ({
                key: `palette-${palette.id}`,
                label: t("spaces.board.addPalette", { name: palette.name }),
                icon: Palette,
                onSelect: () => void addFromBoard([{ spaceId: space.id, kind: "palette", paletteId: palette.id }]),
              })),
            ]}
          />
        )}
        <ToolButton icon={MousePointer2} label={t("spaces.board.toolSelect")} active={tool === "select" && !multiSelect} onClick={() => { setToolMode("select"); setMultiSelect(false); }} className="max-md:hidden" />
        <ToolButton icon={Hand} label={t("spaces.board.toolPan")} active={tool === "pan"} onClick={() => setToolMode("pan")} className="max-md:hidden" />
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
        <ToolButton icon={Keyboard} label={t("spaces.board.shortcuts")} onClick={() => setDialog({ kind: "shortcuts" })} className="max-md:hidden" />
        <ToolButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? t("spaces.board.exitFullscreen") : t("spaces.board.fullscreen")} onClick={() => setFullscreen((value) => !value)} />
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          {uploading && <Loader2 size={16} className="animate-spin text-text-muted" aria-label={t("spaces.images.uploadingShort")} />}
          <SaveIndicator status={layoutStatus} onRetry={() => void flushLayout()} className="ml-0" />
        </div>
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1} onChange={(event) => { void uploadFiles(event.target.files); event.target.value = ""; }} />
      </ScrollRow>

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
                showHandle={editable && selectedSet.has(item.id) && selection.length === 1}
                resolved={resolvedMap.get(item.id)!}
                palette={item.paletteId ? (palettes.find((palette) => palette.id === item.paletteId) ?? null) : null}
                attachedTitle={attached ? itemTitle(attached) : null}
                lowDetail={lowDetail}
              />
            );
          })}
        </div>
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
            onDone={() => setUndoNotice(t("wfSpace.sync.done"))}
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
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
          <div role="toolbar" aria-label={t("spaces.board.selectionToolbar")} data-board-selection={selectedItems.length} className="scrollbar-none pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border-soft bg-surface px-1.5 py-1 shadow-pop">
            <span className="shrink-0 px-2 text-caption font-semibold text-text-secondary">{t("spaces.board.selected", { count: selectedItems.length })}</span>
            {single && single.kind !== "palette" && <ToolButton icon={ExternalLink} label={t("spaces.board.open")} onClick={() => openItem(single.id)} />}
            {editable && single && single.kind !== "note" && single.kind !== "palette" && <ToolButton icon={StickyNote} label={t("spaces.board.attachNote")} onClick={() => setDialog({ kind: "note", attachTo: single.id })} />}
            {editable && (
              <>
                {selectedItems.some(isDuplicable) && <ToolButton icon={Copy} label={t("spaces.board.duplicate")} onClick={() => void duplicate(selection, 1)} />}
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
                <ToolButton icon={Trash2} label={t("spaces.board.remove")} onClick={() => void deleteSelection()} danger />
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

      {dialog?.kind === "detail" && <ItemDetailModal itemId={dialog.id} onClose={() => setDialog(null)} />}
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
            setHistory((h) => pushHistory(h, { type: "import", items: result.items, connections: result.connections }));
            setSelection(result.items.map((item) => item.id));
            const { w, h } = viewSize();
            setVp(fitViewport(result.items, w, h));
            if (result.degraded) setUndoNotice(t("wfSpace.objects.degraded"));
          }}
        />
      )}
      {dialog?.kind === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function ToolButton({ icon: Icon, label, onClick, active, disabled, danger, className }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean; className?: string }) {
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
