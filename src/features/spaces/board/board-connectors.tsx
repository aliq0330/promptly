"use client";

import { memo, useMemo } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { arrowHeadPoints, connectorGeometry, dashArray, hasArrowAtEnd, hasArrowAtStart, borderPoint, type Box } from "@/lib/space-connectors";
import type { SpaceConnection } from "@/lib/supabase/spaces";
import type { SpaceColor } from "@/lib/spaces";
import { cn } from "@/lib/utils";

/**
 * Panodaki oklar (docs/history/262-*): öğelerin ARKASINDA, grup çerçevelerinin önünde bir SVG katmanı. Uçlar her çizimde öğelerin o anki
 * (sürükleme sırasında canlı) kutusundan hesaplanır, yani öğe taşınınca ok da gelir. Çizgi kalınlığı ve ok başı ekranda sabit boyutta kalır
 * (yakınlaştırmadan bağımsız); etiket küçük bir hap olarak çizginin ortasında durur. `interactive` değilken (workflow sayfası önizlemesi)
 * hiçbir işaretçi olayı yakalanmaz; panoda tıklama/dokunma `data-board-connector` ile pano kökünde yakalanır.
 */

const STROKE: Record<SpaceColor, { line: string; fill: string; pill: string }> = {
  primary: { line: "stroke-primary", fill: "fill-primary", pill: "border-primary/50 text-primary" },
  secondary: { line: "stroke-secondary", fill: "fill-secondary", pill: "border-secondary/50 text-secondary" },
  success: { line: "stroke-success", fill: "fill-success", pill: "border-success/50 text-success" },
  warning: { line: "stroke-warning", fill: "fill-warning", pill: "border-warning/60 text-warning" },
  danger: { line: "stroke-danger", fill: "fill-danger", pill: "border-danger/50 text-danger" },
  neutral: { line: "stroke-text-muted", fill: "fill-text-muted", pill: "border-border-strong text-text-secondary" },
};

const LINE_PX = 2;
const HEAD_PX = 11;

export interface ConnectorDraft {
  fromId: string;
  /** Dünya koordinatında imleç. */
  x: number;
  y: number;
}

export const BoardConnectors = memo(function BoardConnectors({
  connections,
  boxes,
  zoom,
  selectedId,
  draft,
  interactive,
  lowDetail,
  titleOf,
}: {
  connections: readonly SpaceConnection[];
  boxes: Readonly<Record<string, Box>>;
  zoom: number;
  selectedId: string | null;
  draft?: ConnectorDraft | null;
  interactive: boolean;
  lowDetail: boolean;
  titleOf?: (itemId: string) => string;
}) {
  const { t } = useTranslation();
  const head = HEAD_PX / zoom;

  const drawn = useMemo(
    () =>
      connections
        .map((connection) => {
          const from = boxes[connection.fromItemId];
          const to = boxes[connection.toItemId];
          if (!from || !to) return null;
          return { connection, geometry: connectorGeometry(from, to, connection.route) };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [connections, boxes],
  );

  const draftLine = useMemo(() => {
    if (!draft) return null;
    const from = boxes[draft.fromId];
    if (!from) return null;
    const start = borderPoint(from, { x: draft.x, y: draft.y });
    return `M${start.x} ${start.y}L${draft.x} ${draft.y}`;
  }, [draft, boxes]);

  if (drawn.length === 0 && !draftLine) return null;

  return (
    <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 1 }} aria-hidden={!interactive}>
      <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1} role="presentation">
        {drawn.map(({ connection, geometry }) => {
          const colors = STROKE[connection.color];
          const selected = connection.id === selectedId;
          const dash = dashArray(connection.lineStyle, LINE_PX);
          return (
            <g key={connection.id} data-connector={connection.id} data-selected={selected ? "" : undefined}>
              {selected && <path d={geometry.d} fill="none" className="stroke-primary/25" strokeWidth={LINE_PX + 8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
              <path
                d={geometry.d}
                fill="none"
                className={colors.line}
                strokeWidth={selected ? LINE_PX + 1 : LINE_PX}
                strokeDasharray={dash}
                strokeLinecap={connection.lineStyle === "dotted" ? "round" : "butt"}
                vectorEffect="non-scaling-stroke"
              />
              {hasArrowAtEnd(connection.arrow) && <polygon points={arrowHeadPoints(geometry.end, geometry.endAngle, head)} className={colors.fill} />}
              {hasArrowAtStart(connection.arrow) && <polygon points={arrowHeadPoints(geometry.start, geometry.startAngle, head)} className={colors.fill} />}
              {interactive && (
                <path
                  d={geometry.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  vectorEffect="non-scaling-stroke"
                  data-board-connector={connection.id}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  aria-label={t("spaces.connect.aria", { from: titleOf?.(connection.fromItemId) ?? "", to: titleOf?.(connection.toItemId) ?? "" })}
                />
              )}
            </g>
          );
        })}
        {draftLine && <path d={draftLine} fill="none" className="stroke-primary" strokeWidth={LINE_PX} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
      </svg>
      {!lowDetail &&
        drawn
          .filter(({ connection }) => connection.label)
          .map(({ connection, geometry }) => {
            const colors = STROKE[connection.color];
            const selected = connection.id === selectedId;
            return (
              <span
                key={`label-${connection.id}`}
                data-connector-label={connection.id}
                data-board-connector={interactive ? connection.id : undefined}
                className={cn(
                  "absolute left-0 top-0 max-w-[180px] truncate whitespace-nowrap rounded-full border bg-surface px-2 py-0.5 text-[11px] font-semibold leading-4 shadow-xs",
                  colors.pill,
                  selected && "ring-2 ring-primary",
                  interactive ? "pointer-events-auto cursor-pointer" : "",
                )}
                style={{ transform: `translate(${geometry.label.x}px, ${geometry.label.y}px) scale(${1 / zoom}) translate(-50%, -50%)`, transformOrigin: "0 0" }}
              >
                {connection.label}
              </span>
            );
          })}
    </div>
  );
});
