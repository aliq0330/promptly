"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CENTER_H, CENTER_W, NODE_H, NODE_W, fitTransform, layoutRadial, type Point } from "@/lib/relations/graph-layout";
import { FILTER_ORDER, RELATION_TYPES, otherEnd, type RelationEdge, type RelationNode } from "@/lib/relations/types";
import { KIND_ICON, useRelationText } from "./relation-text";

interface View {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
/** The auto-fit never shrinks the map below this — readable beats "everything on screen"; the viewer pans. */
const FIT_MIN_ZOOM = 0.6;
/** Edge labels are noise at low zoom; the selected edge keeps its label. */
const LABEL_MIN_ZOOM = 0.5;
/** Edges shorter than this (world units) are too short for their label — it would sit on the nodes; selecting the edge shows it anyway. */
const LABEL_MIN_LENGTH = 150;
const DRAG_THRESHOLD = 5;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Point where the ray from a rectangle's center toward `toward` leaves the rectangle. */
function rectEdge(center: Point, size: { w: number; h: number }, toward: Point): Point {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const t = Math.min(dx === 0 ? Infinity : size.w / 2 / Math.abs(dx), dy === 0 ? Infinity : size.h / 2 / Math.abs(dy));
  return { x: center.x + dx * t, y: center.y + dy * t };
}

interface Geometry {
  edge: RelationEdge;
  d: string;
  mid: Point;
  /** Visible length of the edge between the two node borders — a label only fits on a long enough edge. */
  length: number;
  directed: boolean;
}

/**
 * The map itself: dependency-free SVG edges + HTML nodes inside one
 * pan/zoom-transformed layer. Nodes are real buttons (Tab / Enter), the
 * canvas pans with a drag or one finger, zooms with Ctrl/⌘+wheel, pinch, the
 * +/− buttons or the keyboard. Hand-written on purpose: the map is a
 * center-and-neighbors view of ≤ ~60 nodes, which does not justify a graph
 * library's bundle.
 */
export function RelationGraph({
  center,
  nodes,
  edges,
  selectedKey,
  onSelect,
  fitSignal,
}: {
  center: RelationNode;
  /** Visible nodes, center included. */
  nodes: RelationNode[];
  /** Visible edges only. */
  edges: RelationEdge[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Bump to re-fit the view (the "Sıfırla" button). */
  fitSignal: number;
}) {
  const { t, kindLabel, typeLabel, levelLabel } = useRelationText();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // `manual` is the viewer's own pan/zoom; it only applies to the layout it was made on — a new
  // center / filter / "Sıfırla" falls back to the fitted view (no effect, no extra render).
  const [manual, setManual] = useState<{ key: string; view: View } | null>(null);

  // Neighbors grouped by the relation that brought them in, strongest first.
  const neighbors = useMemo(() => {
    const rank = (node: RelationNode) => {
      const related = edges.filter((e) => otherEnd(e, center.key) === node.key);
      const group = Math.min(...related.map((e) => FILTER_ORDER.indexOf(RELATION_TYPES[e.type].filter)));
      const score = Math.max(0, ...related.map((e) => e.score ?? 0));
      return { group: Number.isFinite(group) ? group : 99, score };
    };
    return nodes
      .filter((n) => n.key !== center.key)
      .map((n) => ({ n, r: rank(n) }))
      .sort((a, b) => a.r.group - b.r.group || b.r.score - a.r.score || a.n.title.localeCompare(b.n.title))
      .map((entry) => entry.n);
  }, [nodes, edges, center.key]);

  // Ring shape follows the stage's aspect (quantized so a resize by a few pixels doesn't re-layout).
  const ratio = size ? Math.round((size.width / Math.max(1, size.height)) * 10) / 10 : 1.6;
  const layout = useMemo(() => layoutRadial(center.key, neighbors.map((n) => n.key), { ratio }), [center.key, neighbors, ratio]);

  // Measure the viewport.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layoutKey = `${center.key}|${neighbors.map((n) => n.key).join(",")}|${fitSignal}`;
  const fitView = useMemo<View>(() => {
    if (!size) return { x: 0, y: 0, zoom: 1 };
    const next = fitTransform(layout.bounds, size, 32, 1, FIT_MIN_ZOOM);
    return { x: next.x, y: next.y, zoom: next.zoom };
  }, [layout.bounds, size]);
  const view = manual && manual.key === layoutKey ? manual.view : fitView;
  const setView = useCallback(
    (next: View | ((current: View) => View)) =>
      setManual((prev) => {
        const base = prev && prev.key === layoutKey ? prev.view : fitView;
        return { key: layoutKey, view: typeof next === "function" ? next(base) : next };
      }),
    [layoutKey, fitView],
  );
  const fit = useCallback(() => setManual(null), []);

  /* ---------------- pan / zoom ---------------- */

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const zoom = clampZoom(v.zoom * factor);
        const ratio = zoom / v.zoom;
        return { zoom, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
      });
    },
    [setView],
  );

  const zoomCenter = (factor: number) => size && zoomAt(factor, size.width / 2, size.height / 2);

  const pointers = useRef(new Map<number, Point>());
  const drag = useRef<{ start: Point; origin: View; moved: boolean; pinch: number | null } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      drag.current = { start: { x: event.clientX, y: event.clientY }, origin: view, moved: false, pinch: null };
    } else if (pointers.current.size === 2 && drag.current) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { ...drag.current, moved: true, pinch: Math.hypot(a.x - b.x, a.y - b.y), origin: view };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = containerRef.current?.getBoundingClientRect();
    if (pointers.current.size >= 2 && current.pinch && rect) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = distance / current.pinch;
      current.pinch = distance;
      zoomAt(factor, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      return;
    }
    const dx = event.clientX - current.start.x;
    const dy = event.clientY - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!current.moved) {
      current.moved = true;
      // Capture only once it is clearly a drag — capturing earlier would retarget the click away from the node.
      containerRef.current?.setPointerCapture(event.pointerId);
    }
    setView({ ...current.origin, x: current.origin.x + dx, y: current.origin.y + dy });
  };

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (drag.current?.moved) suppressClick.current = true;
    if (pointers.current.size === 0) {
      drag.current = null;
      // Let the click that follows a drag pass, then re-arm.
      setTimeout(() => (suppressClick.current = false), 0);
    }
  };

  // Ctrl/⌘ + wheel zooms (a plain wheel keeps scrolling the page). Needs a non-passive native listener.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== containerRef.current) return;
    const step = 48;
    if (event.key === "ArrowLeft") setView((v) => ({ ...v, x: v.x + step }));
    else if (event.key === "ArrowRight") setView((v) => ({ ...v, x: v.x - step }));
    else if (event.key === "ArrowUp") setView((v) => ({ ...v, y: v.y + step }));
    else if (event.key === "ArrowDown") setView((v) => ({ ...v, y: v.y - step }));
    else if (event.key === "+" || event.key === "=") zoomCenter(1.2);
    else if (event.key === "-") zoomCenter(1 / 1.2);
    else if (event.key === "0") fit();
    else return;
    event.preventDefault();
  };

  /* ---------------- geometry ---------------- */

  const geometry = useMemo<Geometry[]>(() => {
    const sizeOf = (key: string) => (key === center.key ? { w: CENTER_W, h: CENTER_H } : { w: NODE_W, h: NODE_H });
    const seen = new Map<string, number>();
    const out: Geometry[] = [];
    for (const e of edges) {
      const a = layout.positions[e.from];
      const b = layout.positions[e.to];
      if (!a || !b) continue;
      const pair = [e.from, e.to].sort().join("|");
      const index = seen.get(pair) ?? 0;
      seen.set(pair, index + 1);
      // Fan parallel edges out symmetrically around the straight line.
      const bend = index === 0 ? 0 : (index % 2 === 1 ? 1 : -1) * Math.ceil(index / 2) * 34;
      const start = rectEdge(a, sizeOf(e.from), b);
      const end = rectEdge(b, sizeOf(e.to), a);
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      const control = { x: mx + (-(end.y - start.y) / len) * bend * 2, y: my + ((end.x - start.x) / len) * bend * 2 };
      out.push({
        edge: e,
        d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
        mid: { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y },
        length: len,
        directed: RELATION_TYPES[e.type].directed,
      });
    }
    return out;
  }, [edges, layout.positions, center.key]);

  const showLabels = view.zoom >= LABEL_MIN_ZOOM;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        role="group"
        aria-label={t("relations.canvasAria")}
        tabIndex={0}
        data-relation-canvas
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={onKeyDown}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
        className="absolute inset-0 touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div
          data-relation-layer
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden>
            <defs>
              {(["dna", "manual", "derived"] as const).map((origin) => (
                <marker key={origin} id={`rel-arrow-${origin}`} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={10} markerHeight={10} markerUnits="userSpaceOnUse" orient="auto-start-reverse" className={ARROW_FILL[origin]}>
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="currentColor" />
                </marker>
              ))}
            </defs>
            {geometry.map(({ edge, d, directed }) => {
              const origin = RELATION_TYPES[edge.type].origin;
              const active = selectedKey !== null && (edge.from === selectedKey || edge.to === selectedKey);
              return (
                <path
                  key={edge.id}
                  d={d}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={origin === "dna" ? "7 6" : undefined}
                  strokeWidth={active ? 2.75 : 1.75}
                  opacity={selectedKey === null || active ? 1 : 0.45}
                  markerEnd={directed ? `url(#rel-arrow-${origin})` : undefined}
                  className={cn("stroke-current", EDGE_COLOR[origin])}
                  data-edge-type={edge.type}
                />
              );
            })}
          </svg>

          {showLabels &&
            geometry
              .filter(({ edge, length }) => length >= LABEL_MIN_LENGTH || (selectedKey !== null && (edge.from === selectedKey || edge.to === selectedKey)))
              .map(({ edge, mid }) => {
              const neighborKey = otherEnd(edge, center.key) ?? edge.to;
              const text = edge.level ? `${typeLabel(edge.type)} · ${levelLabel(edge.level)}` : typeLabel(edge.type);
              return (
                <button
                  key={edge.id}
                  type="button"
                  tabIndex={-1}
                  onClick={() => onSelect(neighborKey)}
                  data-edge-label={edge.type}
                  className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-border-soft bg-surface px-2 py-0.5 text-caption font-medium text-text-secondary shadow-xs hover:border-border-strong hover:text-text"
                  style={{ left: mid.x, top: mid.y }}
                >
                  {text}
                </button>
              );
            })}

          {[center, ...neighbors].map((node) => {
            const pos = layout.positions[node.key];
            if (!pos) return null;
            const isCenter = node.key === center.key;
            const w = isCenter ? CENTER_W : NODE_W;
            const h = isCenter ? CENTER_H : NODE_H;
            const selected = selectedKey === node.key;
            const Icon = KIND_ICON[node.kind];
            // What links this node to the center, in words (so type never rests on line style or color alone).
            const types = [...new Set(edges.filter((e) => otherEnd(e, center.key) === node.key).map((e) => e.type))];
            const relationText = types.length === 0 ? null : types.length === 1 ? typeLabel(types[0]) : `${typeLabel(types[0])} +${types.length - 1}`;
            return (
              <button
                key={node.key}
                type="button"
                onClick={() => onSelect(node.key)}
                aria-pressed={selected}
                aria-label={t("relations.nodeAria", { kind: kindLabel(node.kind), title: node.title })}
                data-node-key={node.key}
                data-node-center={isCenter || undefined}
                className={cn(
                  "absolute flex items-center gap-2.5 overflow-hidden rounded-lg border bg-surface px-3 text-left shadow-card transition-[border-color,box-shadow,background-color] duration-200 ease-soft",
                  isCenter ? "border-primary bg-primary-soft" : "border-border-soft hover:border-border-strong",
                  selected && "border-primary ring-2 ring-primary",
                )}
                style={{ left: pos.x - w / 2, top: pos.y - h / 2, width: w, height: h }}
              >
                {node.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tiny node thumbnails; next/image's sizing overhead isn't worth it on a pan/zoom layer
                  <img src={node.imageUrl} alt="" draggable={false} className={cn("shrink-0 rounded-md object-cover", isCenter ? "h-14 w-14" : "h-9 w-9")} />
                ) : (
                  <span className={cn("grid shrink-0 place-items-center rounded-md bg-surface-soft text-text-muted", isCenter ? "h-14 w-14" : "h-9 w-9")}>
                    <Icon size={isCenter ? 22 : 18} strokeWidth={1.75} aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                    <Icon size={11} aria-hidden />
                    <span className="truncate">{isCenter ? t("relations.centerLabel") : kindLabel(node.kind)}</span>
                  </span>
                  <span className={cn("block font-semibold leading-snug text-text", isCenter ? "line-clamp-3 text-small" : "line-clamp-2 text-label")}>{node.title}</span>
                  {relationText && (
                    <span data-node-relation title={relationText} className="mt-0.5 inline-block max-w-full truncate rounded-full bg-primary-soft px-1.5 text-caption font-medium text-primary">
                      {relationText}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card">
        <ToolButton label={t("relations.zoomIn")} onClick={() => zoomCenter(1.25)}>
          <Plus size={16} />
        </ToolButton>
        <ToolButton label={t("relations.zoomOut")} onClick={() => zoomCenter(1 / 1.25)} bordered>
          <Minus size={16} />
        </ToolButton>
        <ToolButton label={t("relations.fit")} onClick={fit} bordered>
          <Maximize2 size={15} />
        </ToolButton>
      </div>
    </div>
  );
}

const EDGE_COLOR = { dna: "text-secondary", manual: "text-primary", derived: "text-text-secondary" } as const;
const ARROW_FILL = { dna: "text-secondary", manual: "text-primary", derived: "text-text-secondary" } as const;

function ToolButton({ label, onClick, bordered, children }: { label: string; onClick: () => void; bordered?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("grid h-11 w-11 place-items-center text-text-secondary transition-colors hover:bg-surface-soft hover:text-text", bordered && "border-t border-border-soft")}
    >
      {children}
    </button>
  );
}
