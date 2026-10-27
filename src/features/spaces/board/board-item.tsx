"use client";

import { Component, memo, type ReactNode } from "react";
import { AlertTriangle, EyeOff, Lock, Palette, SlidersHorizontal, Sparkles, SquareTerminal, StickyNote, Workflow } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { SpaceItem, SpacePalette } from "@/lib/supabase/spaces";
import type { ResolvedSource } from "../space-items";
import { sourceReasonKey } from "../space-items";
import { SPACE_COLOR_CLASS, SpaceImage } from "../space-visuals";
import { WorkflowFlowDiagram, useWorkflowFlow } from "@/features/workflows/workflow-flow-diagram";

/**
 * Panodaki tek öğe (docs/history/213-*). Konum/boyut DÜNYA birimindedir; pano dönüşümü (kaydırma + yakınlaştırma) üst katmandadır.
 * Olay işleyicisi yoktur: pano kökü `data-board-item` / `data-resize-handle` ile yakalar (yüzlerce öğede tek dinleyici).
 * `memo` + ilkel konum özellikleri: sürüklenmeyen öğe sürükleme boyunca yeniden çizilmez.
 */
export const BoardItem = memo(function BoardItem({
  item,
  x,
  y,
  w,
  h,
  z,
  selected,
  showHandle,
  resolved,
  palette,
  attachedTitle,
  lowDetail,
}: {
  item: SpaceItem;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  selected: boolean;
  showHandle: boolean;
  resolved: ResolvedSource;
  palette: SpacePalette | null;
  attachedTitle: string | null;
  /** Çok uzaklaştırılınca metin yerine sade bloklar (hız + okunurluk). */
  lowDetail: boolean;
}) {
  return (
    <div
      data-board-item={item.id}
      data-kind={item.kind}
      data-selected={selected ? "" : undefined}
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      aria-label={resolved.title || item.kind}
      className={cn(
        "absolute select-none touch-none rounded-lg",
        selected ? "outline outline-2 outline-offset-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-offset-1 hover:outline-border-strong",
      )}
      style={{ left: x, top: y, width: w, height: h, zIndex: z + 10 }}
    >
      <ItemBoundary>
        <ItemBody item={item} resolved={resolved} palette={palette} attachedTitle={attachedTitle} lowDetail={lowDetail} />
      </ItemBoundary>
      {showHandle && (
        <span
          data-resize-handle={item.id}
          aria-hidden
          className="absolute -bottom-3 -right-3 flex h-7 w-7 cursor-nwse-resize items-center justify-center touch-none"
        >
          <span className="h-3.5 w-3.5 rounded-sm border-2 border-primary bg-surface shadow-sm" />
        </span>
      )}
    </div>
  );
});

function ItemBody({ item, resolved, palette, attachedTitle, lowDetail }: { item: SpaceItem; resolved: ResolvedSource; palette: SpacePalette | null; attachedTitle: string | null; lowDetail: boolean }) {
  const { t } = useTranslation();
  const reason = sourceReasonKey(resolved.state);

  if (item.kind === "image") {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg bg-surface-soft shadow-card">
        <SpaceImage url={item.mediaUrl} alt={resolved.title} available={!reason} reason={reason && !lowDetail ? t(reason) : undefined} className="absolute inset-0" />
        {!lowDetail && (resolved.title || item.note) && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6">
            {resolved.title && <p className="truncate text-caption font-semibold text-white">{resolved.title}</p>}
            {item.note && <p className="truncate text-caption text-white/80">{item.note}</p>}
          </div>
        )}
      </div>
    );
  }

  if (item.kind === "prompt") {
    const text = item.isDraft ? item.body : (resolved.prompt?.promptText ?? "");
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border-soft bg-surface p-3 shadow-card">
        <p className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-[0.08em] text-primary">
          <SquareTerminal size={12} aria-hidden />
          {item.isDraft ? t("spaces.prompts.sourceDraft") : t("spaces.item.prompt")}
        </p>
        {!lowDetail && (
          <>
            <p className="mt-1 truncate text-small font-semibold text-text">{resolved.title || t("spaces.notes.untitled")}</p>
            {reason ? (
              <p className="mt-2 flex items-center gap-1.5 text-caption text-text-muted">
                <EyeOff size={12} aria-hidden />
                {t(reason)}
              </p>
            ) : (
              <p className="prompt-text mt-2 min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words text-caption leading-relaxed text-text-secondary">{text}</p>
            )}
          </>
        )}
      </div>
    );
  }

  if (item.kind === "note") {
    const colors = SPACE_COLOR_CLASS[item.color];
    return (
      <div className={cn("flex h-full w-full flex-col overflow-hidden rounded-lg border p-3 shadow-card", colors.surface, colors.border)}>
        <p className="flex items-center gap-1.5 text-caption font-semibold text-text-secondary">
          <StickyNote size={12} aria-hidden />
          {item.isPrivate && <Lock size={11} aria-label={t("spaces.notes.privateBadge")} />}
          <span className="truncate">{item.title || t("spaces.item.note")}</span>
        </p>
        {!lowDetail && (
          <>
            {item.body && <p className="mt-1.5 min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words text-small text-text">{item.body}</p>}
            {attachedTitle && <p className="mt-1 truncate text-caption text-text-muted">↳ {attachedTitle}</p>}
          </>
        )}
      </div>
    );
  }

  if (item.kind === "palette") {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border-soft bg-surface p-2.5 shadow-card">
        <p className="flex items-center gap-1.5 truncate text-caption font-semibold text-text-secondary">
          <Palette size={12} aria-hidden />
          {palette?.name ?? t("spaces.item.palette")}
        </p>
        <div className="mt-2 flex min-h-0 flex-1 overflow-hidden rounded-md">
          {(palette?.colors ?? []).map((color, index) => (
            <span key={`${color}-${index}`} className="h-full flex-1" style={{ backgroundColor: color }} title={color} />
          ))}
        </div>
      </div>
    );
  }

  if (item.contentType === "workflow" && item.contentId && !reason) {
    return <WorkflowFlowItem item={item} fallback={<ContentCard item={item} resolved={resolved} reason={reason} lowDetail={lowDetail} />} lowDetail={lowDetail} />;
  }
  return <ContentCard item={item} resolved={resolved} reason={reason} lowDetail={lowDetail} />;
}

/** Workflow çerçevesi (docs/history/261-*): workflow'un akış diyagramı. Adımlar workflow'dan canlı okunur; okunamazsa sade kart. */
function WorkflowFlowItem({ item, fallback, lowDetail }: { item: SpaceItem; fallback: ReactNode; lowDetail: boolean }) {
  const { data, state } = useWorkflowFlow(item.contentId);
  if (state === "failed") return <>{fallback}</>;
  if (!data) return <div className="skeleton-shimmer h-full w-full rounded-xl border border-border-soft bg-surface-soft" aria-hidden />;
  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card">
      <WorkflowFlowDiagram data={data} options={{ showIo: item.flowShowIo, showLinks: item.flowShowLinks, showRelations: item.flowShowRelations }} fit={{ mode: "box" }} lowDetail={lowDetail} />
    </div>
  );
}

function ContentCard({ item, resolved, reason, lowDetail }: { item: SpaceItem; resolved: ResolvedSource; reason: ReturnType<typeof sourceReasonKey>; lowDetail: boolean }) {
  const { t } = useTranslation();
  const Icon = item.contentType === "workflow" ? Workflow : item.contentType === "preset" ? SlidersHorizontal : Sparkles;
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border-soft bg-surface p-3 shadow-card">
      <p className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-[0.08em] text-primary">
        <Icon size={12} aria-hidden />
        {t(item.contentType === "workflow" ? "spaces.content.workflow" : item.contentType === "preset" ? "spaces.content.preset" : "spaces.content.request")}
      </p>
      {!lowDetail && <p className="mt-1 line-clamp-3 break-words text-small font-semibold text-text">{reason ? t(reason) : resolved.title}</p>}
    </div>
  );
}

/** Bozuk bir öğe (beklenmedik veri) yalnız kendi kutusunda hata gösterir; pano çalışmaya devam eder. */
class ItemBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <BrokenItem />;
    return this.props.children;
  }
}

function BrokenItem() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-danger/50 bg-danger/5 p-2 text-center text-caption text-danger">
      <AlertTriangle size={16} aria-hidden />
      {t("spaces.board.brokenItem")}
    </div>
  );
}
