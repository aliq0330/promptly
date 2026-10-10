"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Info, Network, PanelBottomOpen, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { NotFoundBlock } from "@/components/ui/detail-skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { Eyebrow } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { deleteManualRelation, fetchRelationGraph, type RelationGraph } from "@/lib/supabase/relations";
import {
  availableFilters,
  edgeMatchesFilter,
  isRelatableKind,
  type RelatableKind,
  type RelationFilter,
  type RelationNode,
} from "@/lib/relations/types";
import { cn, relationMapHref } from "@/lib/utils";
import { AddRelationModal } from "./add-relation-modal";
import { RelationDetailPanel } from "./relation-detail-panel";
import { RelationGraph as RelationCanvas } from "./relation-graph";
import { RelationList } from "./relation-list";
import { KIND_ICON, useRelationText } from "./relation-text";

type ViewMode = "map" | "list";

/**
 * İlişki Haritası page: `/relations?type=prompt|generator|workflow|request&id=…`.
 * One center, its relations from every source, filters for the sources that
 * actually have data, a detail panel (side column on desktop, bottom drawer
 * on small screens), re-centering and manual relation creation.
 */
export function RelationMapView() {
  const { t } = useTranslation();
  const { kindLabel } = useRelationText();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const typeParam = searchParams.get("type");
  const id = searchParams.get("id");
  const kind: RelatableKind | null = typeParam && isRelatableKind(typeParam) ? typeParam : null;
  const viewerId = user?.id ?? null;

  const [graph, setGraph] = useState<RelationGraph | null | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<RelationFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [fitSignal, setFitSignal] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!kind || !id) return;
    let cancelled = false;
    // Keep the previous graph on screen while a new center loads (no flash); only the very first load shows the skeleton.
    fetchRelationGraph(kind, id, viewerId).then((result) => {
      if (!cancelled) setGraph(result);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, id, viewerId, reloadKey]);

  const filters = useMemo(() => (graph ? availableFilters(graph.edges) : []), [graph]);
  // A filter chosen on the previous center may not exist on this one; fall back instead of showing an empty map.
  const effectiveFilter: RelationFilter = filter === "all" || filters.includes(filter) ? filter : "all";

  const visibleEdges = useMemo(() => (graph ? graph.edges.filter((e) => edgeMatchesFilter(e, effectiveFilter)) : []), [graph, effectiveFilter]);
  const visibleNodes = useMemo(() => {
    if (!graph) return [];
    const keys = new Set<string>([graph.center.key]);
    for (const e of visibleEdges) {
      keys.add(e.from);
      keys.add(e.to);
    }
    return graph.nodes.filter((n) => keys.has(n.key));
  }, [graph, visibleEdges]);

  const nodeByKey = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.key, n])), [graph]);
  const selectedNode = selectedKey ? (nodeByKey.get(selectedKey) ?? null) : null;
  // The selection stays when its node is filtered out of view only if it is the center; otherwise drop it.
  const selectionVisible = !selectedKey || visibleNodes.some((n) => n.key === selectedKey);
  const panelNode = selectionVisible ? selectedNode : null;

  const select = useCallback((key: string) => {
    setSelectedKey(key);
    setDrawerOpen(true);
  }, []);

  const recenter = (node: RelationNode) => {
    if (!isRelatableKind(node.kind)) return;
    setSelectedKey(node.key);
    setDrawerOpen(false);
    router.push(relationMapHref({ kind: node.kind, id: node.id }));
  };

  const reset = () => {
    setFilter("all");
    setSelectedKey(null);
    setDrawerOpen(false);
    setFitSignal((n) => n + 1);
  };

  const openAdd = () => {
    if (!requireAuth("generic")) return;
    setShowAdd(true);
  };

  if (!kind || !id) return <div className="mx-auto max-w-3xl px-4 py-10"><NotFoundBlock title={t("relations.title")} description={t("relations.noContent")} /></div>;
  if (graph === undefined) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-5 lg:px-8" aria-busy="true">
        <div className="h-8 w-56 skeleton-shimmer rounded-md" />
        <div className="mt-5 h-[60dvh] skeleton-shimmer rounded-xl" />
        <span className="sr-only">{t("relations.loading")}</span>
      </div>
    );
  }
  if (graph === null) return <div className="mx-auto max-w-3xl px-4 py-10"><NotFoundBlock title={t("relations.title")} description={t("relations.notFound")} /></div>;

  const { center } = graph;
  const titleOf = (key: string) => nodeByKey.get(key)?.title ?? "";
  const CenterIcon = KIND_ICON[center.kind];
  const hasDnaEdges = graph.edges.some((e) => e.type === "dna_similar");
  const dnaNotice: TranslationKey | null = graph.dna === "analyzed" ? "relations.dnaStatus.analyzed" : graph.dna === "none" ? "relations.dnaStatus.none" : graph.dna === "unavailable" ? "relations.dnaStatus.unavailable" : null;

  const onRemove = async (edge: { relationId?: string }) => {
    if (!edge.relationId) return;
    await deleteManualRelation(edge.relationId);
    setReloadKey((n) => n + 1);
  };

  const panel = (extra?: { onClose?: () => void; className?: string }) => (
    <RelationDetailPanel
      node={panelNode}
      center={center}
      edges={graph.edges}
      titleOf={titleOf}
      onRecenter={recenter}
      onRemove={onRemove}
      onClose={extra?.onClose}
      className={extra?.className}
    />
  );

  return (
    <div className="mx-auto w-full max-w-6xl animate-rise-in px-3 py-5 sm:px-5 sm:py-7 lg:px-8" data-relation-map>
      <header className="space-y-3">
        <Link href={center.href} className="inline-flex min-h-[36px] items-center gap-1.5 text-small font-medium text-text-secondary hover:text-text">
          <ArrowLeft size={16} aria-hidden />
          {t("relations.backToContent")}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Eyebrow icon={Network}>{t("relations.title")}</Eyebrow>
            <h1 className="break-words font-serif text-h1 text-text">{t("relations.title")}</h1>
            <p className="flex min-w-0 items-center gap-1.5 text-small text-text-secondary">
              <CenterIcon size={14} className="shrink-0 text-text-muted" aria-hidden />
              <span className="shrink-0 text-text-muted">{kindLabel(center.kind)}:</span>
              <span className="truncate font-medium text-text">{center.title}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={openAdd} data-action="add-relation">
              <Plus size={16} />
              {t("relations.add")}
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              <RotateCcw size={15} />
              {t("relations.reset")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {filters.length > 0 ? (
          <ChipRow scroll aria-label={t("relations.filterAria")} className="min-w-0 flex-1">
            <Chip selected={effectiveFilter === "all"} onClick={() => setFilter("all")}>
              {t("relations.filter.all")} ({graph.edges.length})
            </Chip>
            {filters.map((f) => (
              <Chip key={f} selected={effectiveFilter === f} onClick={() => setFilter(f)}>
                {t(`relations.filter.${f}` as TranslationKey)} ({graph.edges.filter((e) => edgeMatchesFilter(e, f)).length})
              </Chip>
            ))}
          </ChipRow>
        ) : (
          <span />
        )}
        {graph.edges.length > 0 && (
          <Tabs
            variant="segmented"
            ariaLabel={t("relations.viewAria")}
            active={viewMode}
            onChange={setViewMode}
            items={[
              { key: "map" as const, label: t("relations.viewMap") },
              { key: "list" as const, label: t("relations.viewList") },
            ]}
          />
        )}
      </div>

      {(dnaNotice || hasDnaEdges || graph.capped.length > 0) && (
        <ul className="mt-3 space-y-1 text-caption text-text-muted">
          {dnaNotice && (
            <li className="flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
              {t(dnaNotice)}
            </li>
          )}
          {hasDnaEdges && (
            <li className="flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
              {t("relations.dnaNote")}
            </li>
          )}
          {graph.capped.length > 0 && (
            <li className="flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
              {t("relations.capped")}
            </li>
          )}
        </ul>
      )}

      {graph.edges.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Network}
            title={t("relations.empty.title")}
            description={t("relations.empty.body")}
            action={{ label: t("relations.add"), onClick: openAdd }}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-2">
            <div className="relative overflow-hidden rounded-xl border border-border-soft bg-surface-soft shadow-card" data-relation-stage>
              {viewMode === "map" ? (
                <div className="h-[68dvh] min-h-[420px] lg:h-[640px]">
                  {visibleEdges.length === 0 ? (
                    <p className="grid h-full place-items-center px-6 text-center text-small text-text-muted">{t("relations.emptyFiltered")}</p>
                  ) : (
                    <RelationCanvas center={center} nodes={visibleNodes} edges={visibleEdges} selectedKey={selectedKey} onSelect={select} fitSignal={fitSignal} />
                  )}
                </div>
              ) : (
                <div className="max-h-[68dvh] overflow-y-auto bg-surface">
                  <RelationList center={center} nodes={visibleNodes} edges={visibleEdges} selectedKey={selectedKey} onSelect={select} />
                </div>
              )}

              {/* Small screens: the detail panel is a bottom drawer over the map; closing keeps the selection. */}
              {drawerOpen && panelNode && (
                <div className="absolute inset-x-0 bottom-0 z-10 max-h-[62%] p-2 lg:hidden" data-relation-drawer>
                  {panel({ onClose: () => setDrawerOpen(false), className: "max-h-full shadow-pop" })}
                </div>
              )}
              {!drawerOpen && panelNode && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="absolute bottom-3 left-3 z-10 inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-label font-medium text-text shadow-card lg:hidden"
                >
                  <PanelBottomOpen size={16} aria-hidden />
                  {t("relations.openDetails")}
                </button>
              )}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-muted" aria-label={t("relations.legend.title")}>
              <li>{t("relations.legend.solid")}</li>
              <li>{t("relations.legend.dashed")}</li>
              <li>{t("relations.legend.arrow")}</li>
            </ul>
          </div>

          <aside className={cn("hidden lg:block")}>{panel({ className: "lg:sticky lg:top-24 lg:max-h-[640px]" })}</aside>
        </div>
      )}

      {showAdd && viewerId && (
        <AddRelationModal
          center={center}
          viewerId={viewerId}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            setReloadKey((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
