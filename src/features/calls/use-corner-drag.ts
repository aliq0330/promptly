"use client";

import { useCallback, useEffect, useRef } from "react";
import { clampPosition, cornerForKey, cornerPosition, isDrag, nearestCorner, type Corner, type Insets } from "@/lib/webrtc/call-window";

interface Options {
  /** Konum kapsayıcısı; verilmezse görünür alan (`position: fixed` öğeler). */
  containerRef?: React.RefObject<HTMLElement | null>;
  initialCorner: Corner;
  margin?: number;
  insets?: Insets;
  /** Dokunma (sürükleme olmadan bırakma ya da Enter/Boşluk). */
  onTap?: () => void;
  enabled?: boolean;
}

/**
 * Köşelere yapışan sürüklenebilir küçük pencere (docs/history/450-*): fare/parmak/kalem (Pointer Events), bırakınca en yakın köşeye kayar;
 * ok tuşları köşe değiştirir, Enter/Boşluk dokunmadır. Konum doğrudan `left/top` stiline yazılır (sürüklerken React yeniden çizmez).
 * Öğe `position: absolute|fixed` olmalı ve `touch-action: none` taşımalıdır. Öğenin İÇİNDEKİ düğmelerden başlayan basış sürükleme olmaz.
 * Geometri saf fonksiyonlardadır (`lib/webrtc/call-window.ts`).
 */
export function useCornerDrag<T extends HTMLElement>({ containerRef, initialCorner, margin = 14, insets, onTap, enabled = true }: Options) {
  const ref = useRef<T>(null);
  const cornerRef = useRef<Corner>(initialCorner);
  const latest = useRef({ margin, insets, onTap });
  useEffect(() => {
    latest.current = { margin, insets, onTap };
  });

  const boxSize = useCallback(() => {
    const box = containerRef?.current;
    return box ? { w: box.clientWidth, h: box.clientHeight } : { w: window.innerWidth, h: window.innerHeight };
  }, [containerRef]);

  const place = useCallback(
    (corner: Corner, animate = false) => {
      const el = ref.current;
      if (!el) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const pos = cornerPosition(boxSize(), { w: el.offsetWidth, h: el.offsetHeight }, corner, latest.current.margin, latest.current.insets);
      el.style.transition = animate && !reduce ? "left 180ms ease, top 180ms ease" : "none";
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
      cornerRef.current = corner;
    },
    [boxSize],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    place(cornerRef.current);
    const box = containerRef?.current;
    const onResize = () => place(cornerRef.current);
    const observer = box && typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    if (box) observer?.observe(box);
    else window.addEventListener("resize", onResize);

    let pointerId: number | null = null;
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let moved = false;

    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      const inner = (e.target as Element | null)?.closest("button, a, [data-no-drag]");
      if (inner && inner !== el) return;
      pointerId = e.pointerId;
      el.setPointerCapture(pointerId);
      sx = e.clientX;
      sy = e.clientY;
      ox = el.offsetLeft;
      oy = el.offsetTop;
      moved = false;
      el.style.transition = "none";
    };
    const move = (e: PointerEvent) => {
      if (pointerId === null) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved && !isDrag(dx, dy)) return;
      if (!moved) {
        moved = true;
        el.dataset.dragging = "";
      }
      const pos = clampPosition(boxSize(), { w: el.offsetWidth, h: el.offsetHeight }, { x: ox + dx, y: oy + dy });
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    };
    const up = () => {
      if (pointerId === null) return;
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* zaten bırakıldı */
      }
      pointerId = null;
      delete el.dataset.dragging;
      if (moved) {
        moved = false;
        place(nearestCorner(boxSize(), { w: el.offsetWidth, h: el.offsetHeight }, { x: el.offsetLeft, y: el.offsetTop }), true);
      } else latest.current.onTap?.();
    };
    const key = (e: KeyboardEvent) => {
      if (e.target !== el) return;
      if (e.key === "Enter" || e.key === " ") {
        if (!latest.current.onTap) return;
        e.preventDefault();
        latest.current.onTap();
        return;
      }
      const next = cornerForKey(cornerRef.current, e.key);
      if (!next) return;
      e.preventDefault();
      place(next, true);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("keydown", key);
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [enabled, containerRef, boxSize, place]);

  return { ref, place, cornerRef };
}
