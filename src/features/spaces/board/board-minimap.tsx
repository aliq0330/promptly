"use client";

import { useRef } from "react";
import { boundsOf, type BoardGeom, type Rect, type Viewport } from "@/lib/space-board";
import { useTranslation } from "@/lib/i18n/language-provider";

const W = 168;
const H = 112;
const PAD = 6;

/**
 * Mini harita (docs/history/263-*): bütün panonun küçük özeti ve şu an görünen alan; haritaya dokunup sürükleyerek gezilir.
 * Pano büyüdükçe (yüzlerce nesne, workflow akışları) yolunu kaybetmemek içindir; yalnız görünümü değiştirir, veri yazmaz.
 */
export function BoardMinimap({
  geoms,
  vp,
  view,
  onNavigate,
}: {
  geoms: readonly BoardGeom[];
  vp: Viewport;
  view: { w: number; h: number };
  onNavigate: (worldX: number, worldY: number) => void;
}) {
  const { t } = useTranslation();
  const dragging = useRef(false);
  if (geoms.length === 0) return null;

  const visible: Rect = { x: -vp.x / vp.zoom, y: -vp.y / vp.zoom, w: view.w / vp.zoom, h: view.h / vp.zoom };
  const bounds = boundsOf([...geoms, visible])!;
  const scale = Math.min((W - PAD * 2) / bounds.w, (H - PAD * 2) / bounds.h);
  const ox = (W - bounds.w * scale) / 2 - bounds.x * scale;
  const oy = (H - bounds.h * scale) / 2 - bounds.y * scale;

  const navigate = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = ((event.clientX - rect.left) / rect.width) * W;
    const sy = ((event.clientY - rect.top) / rect.height) * H;
    onNavigate((sx - ox) / scale, (sy - oy) / scale);
  };

  return (
    <div data-board-minimap="" className="pointer-events-auto absolute bottom-3 right-3 z-20 hidden overflow-hidden rounded-xl border border-border-soft bg-surface/95 shadow-card sm:block" onPointerDown={(event) => event.stopPropagation()}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t("spaces.board.minimap")}
        className="block cursor-pointer touch-none"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          navigate(event);
        }}
        onPointerMove={(event) => dragging.current && navigate(event)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {geoms.map((geom) => (
          <rect key={geom.id} x={geom.x * scale + ox} y={geom.y * scale + oy} width={Math.max(2, geom.w * scale)} height={Math.max(2, geom.h * scale)} rx={1.5} className="fill-primary/35" />
        ))}
        <rect data-minimap-view="" x={visible.x * scale + ox} y={visible.y * scale + oy} width={visible.w * scale} height={visible.h * scale} rx={2} className="fill-primary/10 stroke-primary" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
