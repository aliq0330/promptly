"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Code } from "@/components/icons/code";
import { FileText } from "@/components/icons/file-text";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Plus } from "@/components/icons/plus";
import { StorageImage } from "@/components/ui/storage-media";
import { textArtTone } from "@/features/content/text-art";
import { useNearViewportOnce } from "@/features/feed/use-near-viewport";
import { requestResponseThumbs, skillPackageArtLoader, workflowArtLoader } from "@/lib/supabase/card-art";
import type { BatchedLoader, SkillPackageArt, WorkflowArt } from "@/lib/supabase/card-art";
import { NODE_H, NODE_W, workflowGraphLayout } from "@/lib/supabase/card-art-core";
import type { PresetArtBar } from "@/lib/preset-utils";
import { cn } from "@/lib/utils";

/**
 * The "rich" art of the feed cards (docs/history/479-*, the mockup's art): a request's response pictures, a workflow's step graph,
 * a Skill's package box, a preset's parameter box. Every piece is drawn on top of (or instead of) the card's plain art and sized in
 * container units (`cqw`) so the same drawing fits the wide feed card and the 104 px row square. The data arrives lazily
 * (`useCardArt`: only once the card is near the viewport, one batched query per kind) — until it does, or when there is none, the card
 * simply keeps its plain art.
 */

/** Loads `key` through `loader` once the returned ref's element is near the viewport. */
export function useCardArt<V>(loader: BatchedLoader<V>, key: string | null): [(element: HTMLElement | null) => void, V | null] {
  const [ref, near] = useNearViewportOnce<HTMLElement>("400px");
  const [state, setState] = useState<{ key: string; value: V | null } | null>(null);
  useEffect(() => {
    if (!near || !key) return;
    let alive = true;
    void loader.load(key).then((value) => alive && setState({ key, value }));
    return () => {
      alive = false;
    };
  }, [near, key, loader]);
  return [ref, key && state?.key === key ? state.value : null];
}

/** The picture container: `relative`, a container-query root, the clipped surface of every rich art. */
function ArtFrame({ innerRef, className, style, children }: { innerRef?: (element: HTMLElement | null) => void; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <figure ref={innerRef} style={style} className={cn("@container relative w-full overflow-hidden bg-surface-soft", className)}>
      {children}
    </figure>
  );
}

// ------------------------------------------------------------------ request

/**
 * A request's picture with its state chip at the bottom left and the real response pictures at the bottom right (newest on the left, overlapping,
 * white edge) followed by the dashed "+" tile that invites a response. In the row square there is no room: only the chip's place is kept for the kicker.
 */
export function RequestArt({ requestId, aspectRatio, picture, chip, open }: { requestId: string; aspectRatio: number; picture: ReactNode; chip: ReactNode; open: boolean }) {
  const [ref, thumbs] = useCardArt(requestResponseThumbs, requestId);
  return (
    <ArtFrame innerRef={ref} style={{ aspectRatio }}>
      {picture}
      <span className="absolute bottom-[max(8px,3cqw)] left-[max(8px,3cqw)] z-2 rounded-xs bg-surface @max-[140px]:hidden" data-request-chip="">
        {chip}
      </span>
      {(thumbs?.length || open) && (
        <span className="absolute bottom-[max(8px,3cqw)] right-[max(8px,3cqw)] z-2 flex @max-[140px]:hidden" data-request-thumbs="">
          {(thumbs ?? []).map((url, index) => (
            <span
              key={url}
              className={cn("relative block aspect-square w-[max(26px,13cqw)] overflow-hidden rounded-[max(7px,2.6cqw)] border-[max(2px,0.7cqw)] border-surface bg-surface-soft", index > 0 && "-ml-[max(10px,3.2cqw)]")}
            >
              <StorageImage src={url} alt="" fill sizes="64px" className="object-cover" />
            </span>
          ))}
          {open && (
            <span
              aria-hidden
              className={cn(
                "grid aspect-square w-[max(26px,13cqw)] place-items-center rounded-[max(7px,2.6cqw)] border-[max(2px,0.7cqw)] border-dashed border-primary bg-surface text-primary-text",
                thumbs?.length ? "-ml-[max(10px,3.2cqw)]" : "",
              )}
            >
              <Plus size={16} />
            </span>
          )}
        </span>
      )}
    </ArtFrame>
  );
}

// ----------------------------------------------------------------- workflow

/**
 * A workflow: its steps (first · middle · last, each with the picture the step's prompt produces, its number and its title) joined by arrows on a
 * dotted board. `fallback` is the plain art; it stays until the steps are known. In the wide card the board is 16:9, in the row square it is 1:1.
 */
export function WorkflowGraphArt({ workflowId, fallback, square }: { workflowId: string; fallback: ReactNode; square: boolean }) {
  const [ref, art] = useCardArt<WorkflowArt>(workflowArtLoader, workflowId);
  if (!art || art.nodes.length < 2) {
    return (
      <div ref={ref as (element: HTMLDivElement | null) => void} className="w-full">
        {fallback}
      </div>
    );
  }
  const height = square ? 100 : 56.25;
  const { nodes, arrows } = workflowGraphLayout(art.nodes.length, height);
  return (
    <ArtFrame innerRef={ref} className={cn("bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1.2px)] bg-size-[14px_14px]", square ? "aspect-square" : "aspect-video")}>
      <svg aria-hidden viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="absolute inset-0 z-1 h-full w-full overflow-visible">
        {arrows.map((arrow, index) => (
          <g key={index}>
            <path d={arrow.d} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-primary" strokeWidth={2} />
            <polygon points={arrow.head} className="fill-primary" />
          </g>
        ))}
      </svg>
      {art.nodes.map((node, index) => (
        <span
          key={node.number}
          data-workflow-node=""
          className="absolute z-2 overflow-hidden rounded-[max(6px,2.4cqw)] bg-surface shadow-card ring-1 ring-border-soft"
          style={{ left: `${nodes[index].x}%`, top: `${(nodes[index].y / height) * 100}%`, width: `${NODE_W}%`, height: `${(NODE_H / height) * 100}%` }}
        >
          {node.image ? (
            <StorageImage src={node.image} alt="" fill sizes="120px" className="object-cover" />
          ) : (
            <span aria-hidden className="absolute inset-0 bg-primary-soft" />
          )}
          <span aria-hidden className="absolute left-[max(3px,1.4cqw)] top-[max(3px,1.4cqw)] grid h-[max(15px,5.4cqw)] w-[max(15px,5.4cqw)] place-items-center rounded-full bg-text text-caption font-semibold leading-none text-background">
            {node.number}
          </span>
          {node.title && <span className="art-scrim absolute inset-x-0 bottom-0 truncate px-[max(4px,1.6cqw)] pb-[max(2px,0.8cqw)] pt-[max(10px,3cqw)] text-caption font-semibold text-on-art @max-[230px]:hidden">{node.title}</span>}
        </span>
      ))}
    </ArtFrame>
  );
}

// -------------------------------------------------------------------- skill

/** The SKILL.md header + the package's files, drawn as a small surface box over the cover. */
function PackageBox({ pkg }: { pkg: SkillPackageArt }) {
  const rows = pkg.files.filter((file) => !/^skill\.md$/i.test(file.path.split("/").pop() ?? "")).slice(0, 5);
  return (
    <span
      data-skill-package=""
      className="absolute bottom-[max(8px,4cqw)] left-[max(8px,4cqw)] z-2 block w-[min(62cqw,260px)] rounded-md bg-surface px-[max(8px,3cqw)] py-[max(6px,2.4cqw)] font-mono text-[max(11px,3.4cqw)] leading-snug text-text-secondary shadow-card ring-1 ring-border-soft @max-[240px]:w-[68cqw] @max-[140px]:hidden"
    >
      <span className="mb-[max(2px,0.8cqw)] flex items-center gap-[6px] font-semibold text-text">
        <FileText aria-hidden size={12} className="shrink-0" />
        <span className="truncate">SKILL.md</span>
        <em className="ml-auto rounded-xs bg-primary-soft px-[5px] text-[0.85em] not-italic text-primary-text">v{pkg.version}</em>
      </span>
      {rows.length > 0 && (
        <ul className="grid list-none gap-[max(2px,0.8cqw)] p-0">
          {rows.map((file, index) => (
            <li key={file.path} className={cn("flex items-center gap-[6px] overflow-hidden whitespace-nowrap", index >= 2 && "@max-[240px]:hidden")}>
              <Code aria-hidden size={12} className="shrink-0" />
              <span className="truncate">{file.path}</span>
              {file.script && <s className="ml-auto rounded-xs bg-primary-soft px-[5px] text-[0.85em] text-primary-text no-underline @max-[240px]:hidden">script</s>}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/**
 * A Skill: its cover (or a soft tinted surface with the Skill mark) with the latest package's file list in a box at the bottom left.
 * Without a published package there is no box: `plain` (the card's existing art) is drawn as it was.
 */
export function SkillPackageArt({ skillId, cover, plain }: { skillId: string; cover: ReactNode | null; plain: ReactNode }) {
  const [ref, pkg] = useCardArt<SkillPackageArt>(skillPackageArtLoader, skillId);
  if (!pkg) {
    return (
      <div ref={ref as (element: HTMLDivElement | null) => void} className="w-full">
        {plain}
      </div>
    );
  }
  return (
    <ArtFrame innerRef={ref} className={cn(!cover && textArtTone(skillId), "aspect-[4/3]")}>
      {cover ?? (
        <span aria-hidden className="absolute right-[max(8px,4cqw)] top-[max(8px,4cqw)] grid h-[max(32px,12cqw)] w-[max(32px,12cqw)] place-items-center rounded-md bg-primary text-primary-foreground">
          <GraduationCap size={24} />
        </span>
      )}
      <PackageBox pkg={pkg} />
    </ArtFrame>
  );
}

// ------------------------------------------------------------------- preset

/**
 * A preset's cover with its parameters in a surface box at the bottom left — REAL values only: sliders as bars filled to their value, colour
 * fields as swatches, everything else as label/value rows. (The mockup's before/after slider is not drawn: a preset has no "before" picture.)
 * Without a cover the card keeps its text surface (`TextArt`, drawn by the card).
 */
export function PresetParamsArt({ cover, entries, bars, swatches, count }: { cover: string; entries: { fieldId: string; fieldLabel: string; valueLabel: string }[]; bars: PresetArtBar[]; swatches: string[]; count: number }) {
  const barIds = new Set(bars.map((bar) => bar.fieldId));
  const shownBars = bars.slice(0, 3);
  const rows = entries.filter((entry) => !barIds.has(entry.fieldId) && entry.valueLabel).slice(0, Math.max(0, 3 - shownBars.length));
  const colors = swatches.slice(0, 5);
  const hasBox = shownBars.length > 0 || rows.length > 0 || colors.length > 0;
  return (
    <ArtFrame className="aspect-[4/3]">
      <StorageImage src={cover} alt="" fill sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" className="object-cover" />
      {hasBox && (
        <span
          data-preset-params=""
          className="absolute bottom-[max(8px,4cqw)] left-[max(8px,4cqw)] z-2 block w-[min(62cqw,260px)] rounded-md bg-surface px-[max(8px,3cqw)] py-[max(6px,2.4cqw)] text-[max(11px,3.4cqw)] leading-snug text-text-secondary shadow-card ring-1 ring-border-soft @max-[240px]:w-[68cqw] @max-[140px]:hidden"
        >
          <ul className="grid list-none gap-[max(3px,1cqw)] p-0">
            {shownBars.map((bar) => (
              <li key={bar.fieldId} data-preset-bar="" className="grid gap-[2px]">
                <span className="flex items-baseline justify-between gap-2 overflow-hidden whitespace-nowrap">
                  <span className="truncate">{bar.fieldLabel}</span>
                  <span className="font-semibold text-text">{bar.valueLabel}</span>
                </span>
                <span className="block h-[max(3px,0.9cqw)] overflow-hidden rounded-full bg-surface-soft">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(bar.fraction * 100)}%` }} />
                </span>
              </li>
            ))}
            {rows.map((entry) => (
              <li key={entry.fieldId} className="flex items-baseline justify-between gap-2 overflow-hidden whitespace-nowrap @max-[240px]:hidden">
                <span className="truncate">{entry.fieldLabel}</span>
                <span className="truncate font-semibold text-text">{entry.valueLabel}</span>
              </li>
            ))}
          </ul>
          {colors.length > 0 && (
            <span data-preset-swatches="" className="mt-[max(4px,1.4cqw)] flex items-center gap-[max(4px,1.4cqw)]">
              {colors.map((color) => (
                // The swatch IS the user's chosen colour (user data, a validated hex), not a theme colour.
                <span key={color} aria-hidden className="block h-[max(12px,4.4cqw)] w-[max(12px,4.4cqw)] rounded-full ring-1 ring-border-strong" style={{ backgroundColor: color }} />
              ))}
              {count > shownBars.length + rows.length + colors.length && <span className="ml-auto text-primary-text">+{count - shownBars.length - rows.length - colors.length}</span>}
            </span>
          )}
        </span>
      )}
    </ArtFrame>
  );
}
