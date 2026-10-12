"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dna, Network, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { DnaSection } from "@/lib/prompt-dna/types";
import { DNA_ICONS, dnaSectionLabel } from "./dna-section-meta";

const NODE = 44;
const COMPACT_WIDTH = 520;
const COMPACT_COUNT = 8;
/** Beyond this many nodes the labels would collide, so only the lit node is named. */
const LABELLED_MAX = 12;
const STAGGER_MS = 40;

/**
 * `count` points spaced equally along the ellipse's *arc* (not equally in
 * angle — that bunches nodes together near the flat left/right ends of a wide
 * ellipse), starting at the top.
 */
function evenEllipsePoints(count: number, rx: number, ry: number): { x: number; y: number }[] {
  const SAMPLES = 720;
  const start = -Math.PI / 2;
  const pts: { x: number; y: number }[] = [];
  const cumulative = [0];
  for (let i = 0; i <= SAMPLES; i++) {
    const a = start + (i / SAMPLES) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
    if (i > 0) cumulative.push(cumulative[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cumulative[SAMPLES];
  const out: { x: number; y: number }[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (j < SAMPLES && cumulative[j] < target) j++;
    out.push(pts[j]);
  }
  return out;
}

/**
 * The prompt's DNA drawn as a small constellation: the prompt at the center,
 * one node per section the author accepted (real data, nothing invented),
 * hairline links that draw in and light up when a node is hovered, focused or
 * tapped. Nodes are real buttons; selecting one reads its content out below.
 * On a phone only the first few show until asked ("N daha"), and the full
 * list stays right underneath in `PromptDnaDisplay`.
 */
export function DnaConstellation({ sections, centerTitle, mapHref }: { sections: DnaSection[]; centerTitle: string; mapHref?: string }) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const compact = width > 0 && width < COMPACT_WIDTH;
  const hidden = compact && !showAll ? Math.max(0, sections.length - COMPACT_COUNT) : 0;
  const shown = hidden > 0 ? sections.slice(0, COMPACT_COUNT) : sections;
  const labelled = shown.length <= LABELLED_MAX;
  const height = compact ? Math.round(width * (labelled ? 0.95 : 0.8)) : Math.round(Math.min(380, width * 0.46));

  const layout = useMemo(() => {
    if (!width || !height) return [];
    const cx = width / 2;
    const cy = height / 2;
    const rx = Math.max(60, width / 2 - NODE / 2 - (labelled ? 52 : 14));
    const ry = Math.max(60, height / 2 - NODE / 2 - (labelled ? 26 : 14));
    const points = evenEllipsePoints(shown.length, rx, ry);
    return shown.map((section, i) => ({ section, x: cx + points[i].x, y: cy + points[i].y }));
  }, [shown, width, height, labelled]);

  const focusId = hoverId ?? selectedId;
  const selected = sections.find((section) => section.id === selectedId) ?? null;
  const cx = width / 2;
  const cy = height / 2;

  return (
    <div className="space-y-3">
      <div
        ref={stageRef}
        className="relative w-full overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card"
        style={{ height: height || 280 }}
        data-dna-constellation
      >
        {width > 0 && (
          <>
            <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
              {layout.map(({ section, x, y }, i) => {
                const active = focusId === section.id;
                return (
                  <line
                    key={section.id}
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeLinecap="round"
                    strokeWidth={active ? 2 : 1}
                    opacity={focusId === null || active ? 1 : 0.3}
                    className={cn(
                      "animate-edge-draw stroke-current transition-[opacity,stroke-width,color] duration-200 ease-soft",
                      active ? "text-primary" : "text-border-strong",
                    )}
                    style={{ animationDelay: `${120 + i * STAGGER_MS}ms` }}
                    data-dna-edge={section.type}
                  />
                );
              })}
            </svg>

            <div
              className="absolute z-10 flex max-w-[11rem] -translate-x-1/2 -translate-y-1/2 animate-pop-in items-center gap-1.5 rounded-full border border-primary bg-primary-soft px-3 py-2 text-label font-semibold text-primary shadow-card"
              style={{ left: cx, top: cy }}
              data-dna-center
            >
              <Dna size={14} className="shrink-0" aria-hidden />
              <span className="truncate">{centerTitle}</span>
            </div>

            {layout.map(({ section, x, y }, i) => {
              const Icon = DNA_ICONS[section.type];
              const isSelected = selectedId === section.id;
              const isLit = focusId === section.id;
              const label = dnaSectionLabel(section, t);
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={label}
                  title={label}
                  data-dna-node={section.type}
                  onClick={() => setSelectedId(isSelected ? null : section.id)}
                  onPointerEnter={(event) => event.pointerType === "mouse" && setHoverId(section.id)}
                  onPointerLeave={() => setHoverId(null)}
                  onFocus={() => setHoverId(section.id)}
                  onBlur={() => setHoverId(null)}
                  className="group absolute z-10 flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none"
                  style={{ left: x, top: y }}
                >
                  <span
                    className={cn(
                      "grid place-items-center rounded-full border bg-surface text-text-secondary shadow-card animate-node-emerge",
                      "transition-[border-color,color,box-shadow,background-color,opacity] duration-200 ease-soft",
                      "group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface",
                      isSelected ? "border-primary bg-primary-soft text-primary ring-2 ring-primary/40" : isLit ? "border-primary text-primary" : "border-border-soft",
                      focusId !== null && !isLit && !isSelected && "opacity-60",
                    )}
                    style={{
                      width: NODE,
                      height: NODE,
                      ["--ex" as string]: `${cx - x}px`,
                      ["--ey" as string]: `${cy - y}px`,
                      animationDelay: `${i * STAGGER_MS}ms`,
                    }}
                  >
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                  </span>
                  {(labelled || isLit || isSelected) && (
                    <span
                      className={cn(
                        "max-w-full truncate rounded-xs px-1 text-caption font-medium animate-fade-in",
                        isLit || isSelected ? "bg-surface text-text" : "text-text-muted",
                      )}
                    >
                      {label}
                    </span>
                  )}
                </button>
              );
            })}

          </>
        )}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          data-dna-show-all
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-label font-medium text-text shadow-xs transition-colors hover:border-border-strong"
        >
          <Plus size={14} aria-hidden />
          {t("dna.constellationMore", { count: hidden })}
        </button>
      )}

      <div aria-live="polite" className="min-h-[3.25rem] rounded-lg border border-border-soft bg-surface-soft px-3 py-2.5" data-dna-readout>
        {selected ? (
          <div key={selected.id} className="animate-fade-in">
            <p className="text-label font-semibold text-text">{dnaSectionLabel(selected, t)}</p>
            <p className="mt-0.5 break-words text-small text-text-secondary">{selected.content}</p>
          </div>
        ) : (
          <p className="text-small text-text-muted">{t("dna.constellationHint")}</p>
        )}
      </div>

      {mapHref && (
        <Link href={mapHref} className="inline-flex items-center gap-1.5 text-label font-medium text-primary hover:underline">
          <Network size={14} aria-hidden />
          {t("dna.constellationOpenMap")}
        </Link>
      )}
    </div>
  );
}
