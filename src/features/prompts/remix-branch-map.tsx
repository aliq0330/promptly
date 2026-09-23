"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  Crosshair,
  EyeOff,
  GitMerge,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { fetchGeneratorRemixGraph, fetchRemixGraph, resolveGeneratorGraphRootId, resolveGraphRootId } from "@/lib/supabase/remix-graph";
import { fetchMergeRequestsForPrompts } from "@/lib/supabase/merge-requests";
import { supabase } from "@/lib/supabase/client";
import { computeTreeBounds, layoutRemixTree, NODE_HEIGHT, NODE_WIDTH } from "./remix-tree-layout";
import { RemixMapNodeCard, type NodeMergeStatus } from "./remix-map-node-card";
import { RemixNodeDetailPanel } from "./remix-node-detail-panel";
import { cn } from "@/lib/utils";
import type { Generator, MergeRequest, Prompt, RemixGraphNode } from "@/types";

type RemixMapTarget = { prompt: Prompt; generator?: never } | { generator: Generator; prompt?: never };

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.75;

/**
 * The "Remix Dallanma Haritası" tab's content, next to "Yorumlar" and
 * "Remixler" on a prompt's detail page (`prompt-detail-view.tsx`
 * owns the tab switcher —
 * this component only renders once that tab is active, so it's always
 * fully visible when mounted; no internal show/hide toggle). Real data
 * only: every node and every merge link comes from `fetch_remix_graph`/
 * `merge_requests` (Aşama 22 step 2's own instruction — "harita sadece
 * dekoratif bir diyagram olmayacak"). Pan/zoom/fit are hand-rolled
 * (pointer events + a CSS transform) rather than a charting/graph
 * library — this app adds no new dependency for it, matching CLAUDE.md §2.
 */
export function RemixBranchMap(target: RemixMapTarget) {
  const isGenerator = Boolean(target.generator);
  const currentId = target.generator ? target.generator.id : target.prompt.id;
  const currentTitle = target.generator ? target.generator.title : target.prompt.title;
  const rootId = useMemo(
    () => (target.generator ? resolveGeneratorGraphRootId(target.generator) : resolveGraphRootId(target.prompt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derives whenever the target itself changes, not a stale prop reference
    [isGenerator, currentId],
  );

  const [nodes, setNodes] = useState<RemixGraphNode[]>([]);
  const [mergeRequests, setMergeRequests] = useState<MergeRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(currentId);
  const [expanded, setExpanded] = useState(false);
  const [showMergeLinks, setShowMergeLinks] = useState(true);
  const [minimizeDeleted, setMinimizeDeleted] = useState(false);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the loading flag before a fresh graph fetch for the new rootId, matching this codebase's established fetch-on-id-change pattern
    setLoaded(false);
    const graphFetch = isGenerator ? fetchGeneratorRemixGraph(rootId) : fetchRemixGraph(rootId);
    graphFetch.then(async (graphNodes) => {
      if (cancelled) return;
      setNodes(graphNodes);
      // Merge talepleri yalnızca promptlar için var (Bölüm 9.36'nın
      // migration'ının kendi gerekçesi — bir generatorun mergelenebilir
      // birimi düz metin değil yapılandırılmış bir JSON şema/şablon) — bir
      // generator haritası için hiç sorgulanmıyor, boş kalıyor.
      const requests = isGenerator ? [] : await fetchMergeRequestsForPrompts(graphNodes.map((n) => n.id));
      if (cancelled) return;
      setMergeRequests(requests);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [rootId, isGenerator]);

  // Gerçek zamanlı güncelleme (Aşama 15) — yeni bir remix, yeni/kabul/
  // reddedilmiş bir merge talebi, ya da bir silme (deleted_at değişimi)
  // olduğunda haritayı sayfa yenilenmeden güncelliyor. Tam sayfa
  // yenileme yerine yalnızca bu iki fetch'i tekrarlıyor — küçük bir
  // ağaç için tam yeniden çekmek, artımlı bir patch uygulamaktan daha
  // basit ve bu ölçekte performans sorunu yaratmıyor (Bölüm 21'in zaten
  // bilinen "N+1/artımlı güncelleme yok" kategorisiyle aynı, dokümante
  // edilmiş kapsam kararı).
  useEffect(() => {
    const channel = supabase.channel(`remix-graph:${isGenerator ? "generator" : "prompt"}:${rootId}`);
    if (isGenerator) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generators", filter: `root_generator_id=eq.${rootId}` },
        () => {
          fetchGeneratorRemixGraph(rootId).then(setNodes);
        },
      );
    } else {
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "merge_requests" }, () => {
          fetchMergeRequestsForPrompts(nodes.map((n) => n.id)).then(setMergeRequests);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "prompts", filter: `root_prompt_id=eq.${rootId}` }, () => {
          fetchRemixGraph(rootId).then(setNodes);
        });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetches by rootId; re-subscribing per nodes-array identity change would churn the channel needlessly
  }, [rootId, isGenerator]);

  const positions = useMemo(() => layoutRemixTree(nodes, rootId), [nodes, rootId]);
  const bounds = useMemo(() => computeTreeBounds(positions), [positions]);
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const mergeStatusByNode = useMemo(() => {
    const map = new Map<string, NodeMergeStatus>();
    for (const req of mergeRequests) {
      for (const id of [req.sourcePromptId, req.targetPromptId]) {
        const existing = map.get(id) ?? { hasPending: false, hasAccepted: false };
        if (req.status === "pending") existing.hasPending = true;
        if (req.status === "accepted") existing.hasAccepted = true;
        map.set(id, existing);
      }
    }
    return map;
  }, [mergeRequests]);

  function fitToView() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const padding = 32;
    const nextScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min(
        (viewport.clientWidth - padding) / bounds.width,
        (viewport.clientHeight - padding) / bounds.height,
      )),
    );
    setScale(Number.isFinite(nextScale) ? nextScale : 1);
    setPan({ x: padding / 2 - bounds.minX * nextScale, y: padding / 2 });
  }

  function centerOnCurrent() {
    const viewport = viewportRef.current;
    const pos = positions.get(currentId);
    if (!viewport || !pos) return;
    setPan({
      x: viewport.clientWidth / 2 - (pos.x + NODE_WIDTH / 2) * scale,
      y: viewport.clientHeight / 2 - (pos.y + NODE_HEIGHT / 2) * scale,
    });
  }

  useEffect(() => {
    if (loaded) fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fit when a fresh graph loads, not on every scale/pan change
  }, [loaded, nodes.length]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    dragState.current = { startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    setIsDragging(true);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    setPan({ x: dragState.current.panX + dx, y: dragState.current.panY + dy });
  }
  function handlePointerUp() {
    dragState.current = null;
    setIsDragging(false);
  }
  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)));
  }

  const selectedNode = nodesById.get(selectedId) ?? nodesById.get(currentId) ?? null;
  const nodeCount = nodes.length;

  const treeCanvas = (
    <div
      ref={viewportRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      role="img"
      aria-label={`${nodeCount} içerikten oluşan prompt geçmişi, odak: ${currentTitle}`}
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-background/40",
        expanded ? "h-[560px]" : "h-[320px]",
      )}
      style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      >
        <svg
          width={bounds.width - bounds.minX + NODE_WIDTH}
          height={bounds.maxY + NODE_HEIGHT}
          className="absolute left-0 top-0 overflow-visible"
          aria-hidden
        >
          {nodes.map((node) => {
            if (!node.sourcePromptId) return null;
            const from = positions.get(node.sourcePromptId);
            const to = positions.get(node.id);
            if (!from || !to) return null;
            return (
              <path
                key={`edge-${node.id}`}
                d={`M ${from.x - bounds.minX + NODE_WIDTH / 2} ${from.y + NODE_HEIGHT} C ${from.x - bounds.minX + NODE_WIDTH / 2} ${from.y + NODE_HEIGHT + 24}, ${to.x - bounds.minX + NODE_WIDTH / 2} ${to.y - 24}, ${to.x - bounds.minX + NODE_WIDTH / 2} ${to.y}`}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={2}
                markerEnd="url(#remix-arrow)"
              />
            );
          })}
          {showMergeLinks &&
            mergeRequests
              .filter((req) => positions.has(req.sourcePromptId) && positions.has(req.targetPromptId))
              .map((req) => {
                const from = positions.get(req.sourcePromptId)!;
                const to = positions.get(req.targetPromptId)!;
                const color =
                  req.status === "accepted" ? "var(--color-primary)" : req.status === "pending" ? "#d97706" : "var(--color-text-muted)";
                return (
                  <line
                    key={`merge-${req.id}`}
                    x1={from.x - bounds.minX + NODE_WIDTH / 2}
                    y1={from.y}
                    x2={to.x - bounds.minX + NODE_WIDTH}
                    y2={to.y + NODE_HEIGHT / 2}
                    stroke={color}
                    strokeWidth={1.75}
                    strokeDasharray="5 4"
                    markerEnd="url(#merge-arrow)"
                    opacity={0.85}
                  />
                );
              })}
          <defs>
            <marker id="remix-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-border)" />
            </marker>
            <marker id="merge-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-primary)" />
            </marker>
          </defs>
        </svg>
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          return (
            <RemixMapNodeCard
              key={node.id}
              node={node}
              x={pos.x - bounds.minX}
              y={pos.y}
              isSelected={selectedId === node.id}
              isCurrent={currentId === node.id}
              mergeStatus={mergeStatusByNode.get(node.id) ?? { hasPending: false, hasAccepted: false }}
              onSelect={setSelectedId}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
        <span className="mr-auto rounded-sm bg-accent-surface px-2 py-1 font-medium text-primary">{nodeCount} içerik</span>
        <button type="button" onClick={() => setScale((s) => Math.min(MAX_SCALE, s + 0.15))} aria-label="Haritayı büyüt" className="rounded-md border border-border p-1.5 hover:bg-accent-surface">
          <ZoomIn size={14} />
        </button>
        <button type="button" onClick={() => setScale((s) => Math.max(MIN_SCALE, s - 0.15))} aria-label="Haritayı küçült" className="rounded-md border border-border p-1.5 hover:bg-accent-surface">
          <ZoomOut size={14} />
        </button>
        <button type="button" onClick={fitToView} aria-label="Görünüme sığdır" title="Görünüme sığdır" className="rounded-md border border-border p-1.5 hover:bg-accent-surface">
          <Maximize2 size={14} />
        </button>
        <button type="button" onClick={centerOnCurrent} aria-label="Merkez içeriğe dön" title="Merkez içeriğe dön" className="rounded-md border border-border p-1.5 hover:bg-accent-surface">
          <Crosshair size={14} />
        </button>
        {!isGenerator && (
          <button
            type="button"
            onClick={() => setShowMergeLinks((v) => !v)}
            aria-pressed={showMergeLinks}
            title="Merge ilişkilerini göster/gizle"
            className={cn("rounded-md border p-1.5 hover:bg-accent-surface", showMergeLinks ? "border-primary text-primary" : "border-border")}
          >
            <GitMerge size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMinimizeDeleted((v) => !v)}
          aria-pressed={minimizeDeleted}
          title="Silinen içerikleri sadeleştir"
          className={cn("rounded-md border p-1.5 hover:bg-accent-surface", minimizeDeleted ? "border-primary text-primary" : "border-border")}
        >
          <EyeOff size={14} />
        </button>
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Haritayı küçült" : "Haritayı genişlet"} className="rounded-md border border-border p-1.5 hover:bg-accent-surface">
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} className="rotate-45" />}
        </button>
      </div>

      {!loaded ? (
        <div className="flex h-[320px] items-center justify-center rounded-md border border-border text-sm text-text-muted">
          Yükleniyor…
        </div>
      ) : nodeCount <= 1 ? (
        <div className="flex h-[160px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-center text-sm text-text-muted">
          <p>Bu içeriğin henüz bir remix dallanması yok.</p>
        </div>
      ) : (
        treeCanvas
      )}

      <MapLegend isGenerator={isGenerator} />

      {selectedNode && (
        <RemixNodeDetailPanel
          key={selectedNode.id}
          node={selectedNode}
          currentId={currentId}
          allNodes={nodes}
          mergeRequests={mergeRequests}
          onMergeRequestsChanged={setMergeRequests}
          onSelectNode={setSelectedId}
        />
      )}
    </div>
  );
}

function MapLegend({ isGenerator }: { isGenerator: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-surface ring-1 ring-primary/50" /> Orijinal</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-surface" /> Remix</span>
      {!isGenerator && (
        <>
          <span className="flex items-center gap-1"><GitMerge size={11} className="text-amber-600" /> Bekleyen merge</span>
          <span className="flex items-center gap-1"><GitMerge size={11} className="text-primary" /> Kabul edilmiş</span>
          <span className="flex items-center gap-1"><span className="italic">Silinmiş içerik</span> — kaynak korunuyor</span>
        </>
      )}
    </div>
  );
}
