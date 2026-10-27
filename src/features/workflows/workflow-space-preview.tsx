"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Globe, Lock, Shapes } from "lucide-react";
import { BoardItem } from "@/features/spaces/board/board-item";
import { BoardConnectors } from "@/features/spaces/board/board-connectors";
import { resolveSource } from "@/features/spaces/space-items";
import { DetailSection } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { boundsOf, groupFrames, rectsIntersect, type Rect } from "@/lib/space-board";
import { spaceHref } from "@/lib/spaces";
import { emptySources, fetchSpaceConnections, fetchSpaceGroups, fetchSpaceItems, fetchSpacePalettes, fetchSpaceSources, type SpaceConnection, type SpaceGroup, type SpaceItem, type SpacePalette, type SpaceSources } from "@/lib/supabase/spaces";
import { fetchWorkflowSpaceLinks, type WorkflowSpaceLink } from "@/lib/supabase/workflow-flow";
import { cn } from "@/lib/utils";
import { SPACE_COLOR_CLASS } from "@/features/spaces/space-visuals";

/** Panodaki öğe `lowDetail` eşiğiyle aynı (space-board.tsx `LOW_DETAIL_ZOOM`): çok küçülünce metin yerine sade bloklar. */
const LOW_DETAIL_SCALE = 0.4;
const MAX_PREVIEW_HEIGHT = 520;
const PAD = 40;

interface MiniBoardData {
  items: SpaceItem[];
  palettes: SpacePalette[];
  sources: SpaceSources;
  connections: SpaceConnection[];
  groups: SpaceGroup[];
}

/** Önizlemenin bakacağı yer: bu workflow'un nesneleri (ya da eski çerçeve öğesi) ve çevresi; hiçbiri yoksa panonun tamamı. */
function focusRect(items: readonly SpaceItem[], workflowId: string): Rect | null {
  const own = items.filter((item) => item.sourceWorkflowId === workflowId || (item.kind === "content" && item.contentType === "workflow" && item.contentId === workflowId));
  const bounds = boundsOf(own.length > 0 ? own : items);
  return bounds ? { x: bounds.x - PAD, y: bounds.y - PAD, w: bounds.w + PAD * 2, h: bounds.h + PAD * 2 } : null;
}

/**
 * Salt okunur pano önizlemesi: panonun KENDİ öğe bileşeni (`BoardItem`) gerçek konumlarında, görünür alana ölçeklenmiş olarak çizilir.
 * Okuma okuyucunun yetkisiyle (RLS) gelir: göremediği Space/öğe/kaynak hiç gelmez ya da "erişilemiyor" çizilir. Gizli notlar hiçbir
 * durumda önizlemeye girmez (Space üyesi bile olsa: sayfa herkesin önünde durur).
 */
function MiniBoard({ spaceId, workflowId }: { spaceId: string; workflowId: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ spaceId: string; value: MiniBoardData | null } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rawItems, palettes, connections, groups] = await Promise.all([fetchSpaceItems(spaceId), fetchSpacePalettes(spaceId), fetchSpaceConnections(spaceId), fetchSpaceGroups(spaceId).catch(() => [])]);
      const items = rawItems.filter((item) => !item.isPrivate);
      const sources = await fetchSpaceSources(items).catch(() => emptySources());
      return { items, palettes, sources, connections, groups };
    })().then(
      (value) => !cancelled && setData({ spaceId, value }),
      () => !cancelled && setData({ spaceId, value: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const board = data && data.spaceId === spaceId ? data.value : null;
  const loading = !data || data.spaceId !== spaceId;
  const view = useMemo(() => (board ? focusRect(board.items, workflowId) : null), [board, workflowId]);
  const visibleItems = useMemo(() => (board && view ? board.items.filter((item) => rectsIntersect(item, view)) : []), [board, view]);
  const boxes = useMemo(() => Object.fromEntries((board?.items ?? []).map((item) => [item.id, { x: item.x - (view?.x ?? 0), y: item.y - (view?.y ?? 0), w: item.w, h: item.h }])), [board, view]);
  const frames = useMemo(() => (board ? groupFrames(board.items.map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h, z: item.z, groupId: item.groupId }))) : []), [board]);
  const readable = useMemo(() => {
    const sources = board?.sources ?? emptySources();
    return (id: string) => sources.prompts.has(id) || sources.requests.has(id) || sources.workflows.has(id) || sources.presets.has(id);
  }, [board]);

  const scale = view && width > 0 ? Math.min(1, width / view.w, MAX_PREVIEW_HEIGHT / view.h) : 1;
  const offsetX = view ? Math.max(0, (width - view.w * scale) / 2) : 0;

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={t("wfSpace.preview.boardAria")}
      className={cn("relative w-full overflow-hidden rounded-b-xl bg-surface-soft", loading && "skeleton-shimmer")}
      style={{
        height: view ? Math.round(view.h * scale) : 160,
        backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
        backgroundSize: `${24 * scale}px ${24 * scale}px`,
      }}
    >
      {board && view && (
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left select-none" style={{ transform: `translate(${offsetX}px, 0) scale(${scale})` }}>
          {frames
            .filter((frame) => rectsIntersect(frame.rect, view))
            .map((frame) => {
              const group = board.groups.find((entry) => entry.id === frame.groupId);
              if (!group) return null;
              const colors = SPACE_COLOR_CLASS[group.color];
              return (
                <div key={frame.groupId} className={cn("absolute rounded-xl border-2 border-dashed", colors.border)} style={{ left: frame.rect.x - view.x, top: frame.rect.y - view.y, width: frame.rect.w, height: frame.rect.h, zIndex: 0 }}>
                  <span className={cn("absolute left-2 top-1.5 inline-flex max-w-[calc(100%-1rem)] items-center truncate rounded-full px-2.5 py-1 text-caption font-semibold", colors.surface, colors.text)}>{group.name}</span>
                </div>
              );
            })}
          <BoardConnectors connections={board.connections} boxes={boxes} zoom={scale} selectedId={null} interactive={false} lowDetail={scale < LOW_DETAIL_SCALE} />
          {visibleItems.map((item) => (
            <BoardItem
              key={item.id}
              item={item}
              x={item.x - view.x}
              y={item.y - view.y}
              w={item.w}
              h={item.h}
              z={item.z}
              selected={false}
              showHandle={false}
              resolved={resolveSource(item, board.sources, readable)}
              palette={item.paletteId ? (board.palettes.find((palette) => palette.id === item.paletteId) ?? null) : null}
              attachedTitle={null}
              lowDetail={scale < LOW_DETAIL_SCALE}
            />
          ))}
        </div>
      )}
      {!loading && !board && <p className="absolute inset-0 grid place-items-center text-small text-text-muted">{t("wfSpace.preview.failed")}</p>}
    </div>
  );
}

/**
 * Workflow sayfasındaki "Space panosu" bölümü (docs/history/261-*). Yalnız okuyucunun OKUYABİLDİĞİ Space'ler gelir; hiçbiri yoksa bölüm
 * hiç çizilmez (özel bir Space'in varlığı ziyaretçiye sızmaz). Varsayılan önizleme: en yeni herkese açık Space; sahibi/üyesi kendi özel
 * Space'ini çipten seçebilir.
 */
export function WorkflowSpacePreview({ workflowId }: { workflowId: string }) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<WorkflowSpaceLink[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorkflowSpaceLinks(workflowId).then((result) => !cancelled && setLinks(result));
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  if (!links || links.length === 0) return null;
  const current = links.find((link) => link.spaceId === pickedId) ?? links[0];
  const isPublic = current.visibility === "public" && !current.archived;

  return (
    <DetailSection id="workflow-space" title={t("wfSpace.preview.heading")}>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="space-y-2 border-b border-border-soft bg-surface-soft px-3 py-2.5">
          {links.length > 1 && (
            <div role="group" aria-label={t("wfSpace.preview.spacesAria")} className="flex flex-wrap gap-1.5">
              {links.map((link) => (
                <button
                  key={link.spaceId}
                  type="button"
                  aria-pressed={link.spaceId === current.spaceId}
                  onClick={() => setPickedId(link.spaceId)}
                  className={cn(
                    "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-small font-semibold transition-colors",
                    link.spaceId === current.spaceId ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text-secondary hover:bg-surface-soft",
                  )}
                >
                  {link.visibility === "public" && !link.archived ? <Globe size={13} aria-hidden /> : <Lock size={13} aria-hidden />}
                  <span className="truncate">{link.spaceTitle}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="flex min-w-0 items-center gap-1.5 text-small font-semibold text-text">
              <Shapes size={15} className="shrink-0 text-primary" aria-hidden />
              <span className="truncate">{current.spaceTitle}</span>
            </p>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold", isPublic ? "bg-primary-soft text-primary" : "bg-surface text-text-secondary")}>
              {isPublic ? <Globe size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
              {isPublic ? t("wfSpace.preview.public") : t("wfSpace.preview.private")}
            </span>
            <span className="text-caption text-text-muted">{t("wfSpace.preview.readOnly")}</span>
            <Link
              href={`${spaceHref(current.spaceId, "board")}&focus=${encodeURIComponent(current.itemId)}`}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-small font-semibold text-text hover:bg-surface-soft"
            >
              {t("wfSpace.preview.open")}
              <ExternalLink size={13} aria-hidden />
            </Link>
          </div>
        </div>
        <MiniBoard key={current.spaceId} spaceId={current.spaceId} workflowId={workflowId} />
      </div>
    </DetailSection>
  );
}
