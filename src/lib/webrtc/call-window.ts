/**
 * Arama penceresi geometrisi (docs/history/450-*): küçük pencerenin (kendi görüntün ya da küçültülmüş arama) bir kapsayıcı içinde
 * köşelere yapışması, sınırlanması ve klavye ile taşınması. Çerçeveden bağımsız saf fonksiyonlar (`npm test`); sürükleme olayları
 * `features/calls/use-corner-drag.ts`'tedir.
 */
export type Corner = "tl" | "tr" | "bl" | "br";

export interface Size {
  w: number;
  h: number;
}

export interface Insets {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

/** Köşenin sol-üst koordinatı. `margin` kenar boşluğu; `insets` üst/alt/yan ek boşluk (ör. üst çubuk, alt gezinme). */
export function cornerPosition(container: Size, item: Size, corner: Corner, margin = 14, insets: Insets = {}): { x: number; y: number } {
  const left = margin + (insets.left ?? 0);
  const right = margin + (insets.right ?? 0);
  const top = margin + (insets.top ?? 0);
  const bottom = margin + (insets.bottom ?? 0);
  const x = corner[1] === "l" ? left : container.w - item.w - right;
  const y = corner[0] === "t" ? top : container.h - item.h - bottom;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/** Öğenin merkezi hangi çeyrekteyse o köşe. */
export function nearestCorner(container: Size, item: Size, pos: { x: number; y: number }): Corner {
  const cx = pos.x + item.w / 2;
  const cy = pos.y + item.h / 2;
  return ((cy < container.h / 2 ? "t" : "b") + (cx < container.w / 2 ? "l" : "r")) as Corner;
}

/** Sürüklerken öğe kapsayıcının dışına çıkmaz (`pad` kadar içeride kalır). */
export function clampPosition(container: Size, item: Size, pos: { x: number; y: number }, pad = 4): { x: number; y: number } {
  const maxX = Math.max(pad, container.w - item.w - pad);
  const maxY = Math.max(pad, container.h - item.h - pad);
  return { x: Math.min(maxX, Math.max(pad, pos.x)), y: Math.min(maxY, Math.max(pad, pos.y)) };
}

/** Ok tuşu ile köşe değiştirme (klavyeyle taşıma). Ok olmayan tuş null. */
export function cornerForKey(current: Corner, key: string): Corner | null {
  switch (key) {
    case "ArrowLeft":
      return (current[0] + "l") as Corner;
    case "ArrowRight":
      return (current[0] + "r") as Corner;
    case "ArrowUp":
      return ("t" + current[1]) as Corner;
    case "ArrowDown":
      return ("b" + current[1]) as Corner;
    default:
      return null;
  }
}

/** Ekran ölçeklenmişse (CSS transform) işaretçi farkı gerçek boyuta çevrilir. `scale` 0/NaN ise 1. */
export function toLocalDelta(delta: number, scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? delta / scale : delta;
}

/** Sürükleme mi dokunma mı? Hareket bu eşiğin altındaysa dokunmadır. */
export const DRAG_THRESHOLD_PX = 4;

export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}
