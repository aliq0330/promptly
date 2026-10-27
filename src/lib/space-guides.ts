import type { Rect } from "./space-board.ts";

/**
 * Akıllı kılavuzlar (docs/history/263-*): sürüklenen nesne(ler) diğer nesnelerin kenarına / ortasına yaklaşınca oraya yakalanır ve
 * hizayı gösteren çizgi çıkar. Saf hesaptır (arayüzden bağımsız, birim testli); eşik dünya birimindedir (ekranda sabit px / yakınlaştırma).
 */
export interface Guide {
  /** `x`: dikey çizgi (x konumunda), `y`: yatay çizgi (y konumunda). */
  axis: "x" | "y";
  pos: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

const MATCH = 0.5;

const anchors = (start: number, size: number) => [start, start + size / 2, start + size];

function bestShift(moving: readonly number[], others: readonly number[], threshold: number): number | null {
  let best: number | null = null;
  for (const m of moving) {
    for (const o of others) {
      const diff = o - m;
      if (Math.abs(diff) <= threshold && (best === null || Math.abs(diff) < Math.abs(best))) best = diff;
    }
  }
  return best;
}

/** `moving`: taşınan nesnelerin birleşik kutusu (sürükleme sonrası ham konum); `others`: taşınmayan nesneler. */
export function smartSnap(moving: Rect, others: readonly Rect[], threshold: number): SnapResult {
  if (others.length === 0) return { dx: 0, dy: 0, guides: [] };
  const dx = bestShift(anchors(moving.x, moving.w), others.flatMap((o) => anchors(o.x, o.w)), threshold) ?? 0;
  const dy = bestShift(anchors(moving.y, moving.h), others.flatMap((o) => anchors(o.y, o.h)), threshold) ?? 0;
  const moved: Rect = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h };

  const lines = new Map<string, Guide>();
  const add = (axis: "x" | "y", pos: number, from: number, to: number) => {
    const key = `${axis}:${Math.round(pos * 2)}`;
    const found = lines.get(key);
    if (found) {
      found.from = Math.min(found.from, from);
      found.to = Math.max(found.to, to);
    } else lines.set(key, { axis, pos, from, to });
  };
  for (const o of others) {
    for (const m of anchors(moved.x, moved.w)) {
      for (const c of anchors(o.x, o.w)) if (Math.abs(m - c) < MATCH) add("x", c, Math.min(moved.y, o.y), Math.max(moved.y + moved.h, o.y + o.h));
    }
    for (const m of anchors(moved.y, moved.h)) {
      for (const c of anchors(o.y, o.h)) if (Math.abs(m - c) < MATCH) add("y", c, Math.min(moved.x, o.x), Math.max(moved.x + moved.w, o.x + o.w));
    }
  }
  return { dx, dy, guides: [...lines.values()] };
}
