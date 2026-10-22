/**
 * Spaces panosunun SAF geometrisi (docs/history/213-*): görünüm (kaydırma + yakınlaştırma), dünya ↔ ekran dönüşümü, yerleştirme,
 * hizalama/dağıtma/düzenleme, seçim kutusu, grup çerçeveleri ve geri al / yinele yığını. Konumlar DÜNYA birimindedir (piksel değil):
 * aynı pano her ekran boyutunda ve yakınlaştırmada aynı yerleşimle açılır. Çerçeveden bağımsız; `space-board.test.ts`.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardGeom extends Rect {
  id: string;
  z: number;
  groupId: string | null;
}

/** Ekran = dünya × zoom + (x, y). */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;
export const MIN_ITEM_SIZE = 40;
export const MAX_ITEM_SIZE = 4000;
export const WORLD_LIMIT = 100000;
export const GRID = 8;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampZoom(zoom: number): number {
  return clamp(Number.isFinite(zoom) ? zoom : 1, MIN_ZOOM, MAX_ZOOM);
}

export function screenToWorld(vp: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - vp.x) / vp.zoom, y: (sy - vp.y) / vp.zoom };
}

export function worldToScreen(vp: Viewport, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * vp.zoom + vp.x, y: wy * vp.zoom + vp.y };
}

/** Ekrandaki (sx, sy) noktası yerinde kalacak şekilde yakınlaştırır (fare tekerleği / iki parmak). */
export function zoomAt(vp: Viewport, nextZoom: number, sx: number, sy: number): Viewport {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(vp, sx, sy);
  return { zoom, x: sx - world.x * zoom, y: sy - world.y * zoom };
}

export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Tüm içeriği görünüm alanına sığdırır (en çok %100 — küçük pano büyütülmez). Boş pano: başlangıç noktası ortada. */
export function fitViewport(rects: readonly Rect[], viewW: number, viewH: number, padding = 48): Viewport {
  const b = boundsOf(rects);
  if (!b || viewW <= 0 || viewH <= 0) return { x: viewW / 2, y: viewH / 2, zoom: 1 };
  const zoom = clampZoom(Math.min(1, (viewW - padding * 2) / Math.max(b.w, 1), (viewH - padding * 2) / Math.max(b.h, 1)));
  return { zoom, x: (viewW - b.w * zoom) / 2 - b.x * zoom, y: (viewH - b.h * zoom) / 2 - b.y * zoom };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** İki köşeden (sürükleme başlangıcı/sonu) normalize dikdörtgen. */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Seçim kutusuna değen öğeler. */
export function itemsInRect(items: readonly BoardGeom[], marquee: Rect): string[] {
  return items.filter((item) => rectsIntersect(item, marquee)).map((item) => item.id);
}

/**
 * Yeni öğe için boş yer: `near` (genelde görünümün ortası) etrafında, 24 birim aralıklı bir ızgarada sarmal arar; çakışmayan
 * ilk hücreyi verir. Pano çok doluysa en alta koyar. Deterministiktir (aynı girdi → aynı yer).
 */
export function findFreeSpot(existing: readonly Rect[], size: { w: number; h: number }, near: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  const gap = 24;
  const stepX = size.w + gap;
  const stepY = size.h + gap;
  const originX = Math.round(near.x - size.w / 2);
  const originY = Math.round(near.y - size.h / 2);
  const free = (x: number, y: number) => {
    const candidate = { x: x - gap / 2, y: y - gap / 2, w: size.w + gap, h: size.h + gap };
    return existing.every((r) => !rectsIntersect(candidate, r));
  };
  if (free(originX, originY)) return { x: originX, y: originY };
  for (let ring = 1; ring <= 12; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = originX + dx * stepX;
        const y = originY + dy * stepY;
        if (free(x, y)) return { x, y };
      }
    }
  }
  const b = boundsOf(existing);
  return { x: b ? b.x : originX, y: b ? Math.round(b.y + b.h + gap) : originY };
}

/** Birden çok öğeyi art arda yerleştirir (her yeni öğe sonrakiler için engel olur). */
export function placeMany(existing: readonly Rect[], sizes: readonly { w: number; h: number }[], near?: { x: number; y: number }): { x: number; y: number }[] {
  const taken: Rect[] = [...existing];
  return sizes.map((size) => {
    const spot = findFreeSpot(taken, size, near);
    taken.push({ ...spot, ...size });
    return spot;
  });
}

export function snap(value: number, grid = GRID): number {
  return Math.round(value / grid) * grid;
}

export function clampPosition(value: number): number {
  return clamp(Math.round(value), -WORLD_LIMIT, WORLD_LIMIT);
}

export function clampSize(value: number): number {
  return clamp(Math.round(value), MIN_ITEM_SIZE, MAX_ITEM_SIZE);
}

/** Sağ alt tutamaçla boyutlandırma; `keepRatio` (görsel) en-boy oranını korur. */
export function resizeFromCorner(rect: Rect, dx: number, dy: number, keepRatio = false): Rect {
  let w = clampSize(rect.w + dx);
  let h = clampSize(rect.h + dy);
  if (keepRatio && rect.w > 0 && rect.h > 0) {
    const ratio = rect.w / rect.h;
    // Daha çok sürüklenen kenar yönetir.
    if (Math.abs(dx) >= Math.abs(dy * ratio)) h = clampSize(w / ratio);
    else w = clampSize(h * ratio);
  }
  return { ...rect, w, h };
}

export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

/** Seçili öğeleri ortak kenara/eksene hizalar (yalnız konum değişir). */
export function alignItems(items: readonly BoardGeom[], mode: AlignMode): Record<string, { x: number; y: number }> {
  const b = boundsOf(items);
  const out: Record<string, { x: number; y: number }> = {};
  if (!b || items.length < 2) return out;
  for (const item of items) {
    let { x, y } = item;
    if (mode === "left") x = b.x;
    else if (mode === "right") x = b.x + b.w - item.w;
    else if (mode === "centerX") x = b.x + (b.w - item.w) / 2;
    else if (mode === "top") y = b.y;
    else if (mode === "bottom") y = b.y + b.h - item.h;
    else y = b.y + (b.h - item.h) / 2;
    out[item.id] = { x: Math.round(x), y: Math.round(y) };
  }
  return out;
}

/** Eşit aralıkla dağıtır (en az 3 öğe; uçtakiler yerinde kalır). */
export function distributeItems(items: readonly BoardGeom[], axis: "x" | "y"): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (items.length < 3) return out;
  const size = axis === "x" ? "w" : "h";
  const sorted = [...items].sort((a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[axis] + last[size] - first[axis];
  const occupied = sorted.reduce((sum, item) => sum + item[size], 0);
  const gap = (span - occupied) / (sorted.length - 1);
  let cursor = first[axis];
  for (const item of sorted) {
    out[item.id] = axis === "x" ? { x: Math.round(cursor), y: item.y } : { x: item.x, y: Math.round(cursor) };
    cursor += item[size] + gap;
  }
  return out;
}

/** "Düzenle": öğeleri okuma sırasına (yukarıdan aşağı, soldan sağa) göre düzgün bir ızgaraya dizer; sol üst köşe sabit kalır. */
export function tidyItems(items: readonly BoardGeom[], columns?: number, gap = 24): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  const b = boundsOf(items);
  if (!b) return out;
  const cols = Math.max(1, columns ?? Math.ceil(Math.sqrt(items.length)));
  const sorted = [...items].sort((a, c) => (Math.abs(a.y - c.y) > 40 ? a.y - c.y : a.x - c.x) || a.id.localeCompare(c.id));
  const colWidth: number[] = Array(cols).fill(0);
  const rows: BoardGeom[][] = [];
  sorted.forEach((item, index) => {
    const row = Math.floor(index / cols);
    (rows[row] ??= []).push(item);
    colWidth[index % cols] = Math.max(colWidth[index % cols], item.w);
  });
  let y = b.y;
  for (const row of rows) {
    let x = b.x;
    row.forEach((item, col) => {
      out[item.id] = { x: Math.round(x), y: Math.round(y) };
      x += colWidth[col] + gap;
    });
    y += Math.max(...row.map((item) => item.h)) + gap;
  }
  return out;
}

/** Öne getir / arkaya gönder: seçilenler mevcut en üst/alt z'nin ötesine, kendi sıraları korunarak. */
export function restack(items: readonly BoardGeom[], ids: readonly string[], to: "front" | "back"): Record<string, number> {
  const chosen = new Set(ids);
  const picked = items.filter((item) => chosen.has(item.id)).sort((a, b) => a.z - b.z);
  const others = items.filter((item) => !chosen.has(item.id));
  const out: Record<string, number> = {};
  if (picked.length === 0) return out;
  if (to === "front") {
    const top = others.length ? Math.max(...others.map((i) => i.z)) : 0;
    picked.forEach((item, index) => (out[item.id] = top + 1 + index));
  } else {
    const bottom = others.length ? Math.min(...others.map((i) => i.z)) : 0;
    picked.forEach((item, index) => (out[item.id] = bottom - picked.length + index));
  }
  return out;
}

export function topZ(items: readonly { z: number }[]): number {
  return items.length ? Math.max(...items.map((i) => i.z)) : 0;
}

/** Panodaki grup çerçeveleri: üyelerinin sınırı + kenar boşluğu (saklanmaz, her çizimde hesaplanır). */
export function groupFrames(items: readonly BoardGeom[], padding = 20, labelSpace = 28): { groupId: string; rect: Rect; count: number }[] {
  const byGroup = new Map<string, BoardGeom[]>();
  for (const item of items) {
    if (!item.groupId) continue;
    byGroup.set(item.groupId, [...(byGroup.get(item.groupId) ?? []), item]);
  }
  return [...byGroup.entries()].map(([groupId, members]) => {
    const b = boundsOf(members)!;
    return { groupId, count: members.length, rect: { x: b.x - padding, y: b.y - padding - labelSpace, w: b.w + padding * 2, h: b.h + padding * 2 + labelSpace } };
  });
}

/** Klavye ok tuşuyla kaydırma adımı (Shift = büyük adım). */
export function nudgeStep(shift: boolean): number {
  return shift ? 40 : 8;
}

// ---------------------------------------------------------------------------------------------
// Geri al / yinele
// ---------------------------------------------------------------------------------------------

export interface History<E> {
  past: E[];
  future: E[];
}

export const HISTORY_LIMIT = 100;

export function emptyHistory<E>(): History<E> {
  return { past: [], future: [] };
}

/** Yeni işlem: geçmişe eklenir, "yinele" dalı silinir; en eski kayıtlar sınırın ötesinde düşer. */
export function pushHistory<E>(history: History<E>, entry: E, limit = HISTORY_LIMIT): History<E> {
  const past = [...history.past, entry];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

export function undoHistory<E>(history: History<E>): { history: History<E>; entry: E | null } {
  if (history.past.length === 0) return { history, entry: null };
  const entry = history.past[history.past.length - 1];
  return { history: { past: history.past.slice(0, -1), future: [entry, ...history.future] }, entry };
}

export function redoHistory<E>(history: History<E>): { history: History<E>; entry: E | null } {
  if (history.future.length === 0) return { history, entry: null };
  const [entry, ...future] = history.future;
  return { history: { past: [...history.past, entry], future }, entry };
}
