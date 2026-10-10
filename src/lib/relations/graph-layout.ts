/**
 * Radial layout for the relationship map: the center node at the origin, its
 * neighbors on concentric ELLIPSES (nodes are wider than tall) around it.
 * Callers pass the neighbors already ordered (grouped by relation type), so
 * related nodes sit next to each other. A ring only holds as many nodes as
 * fit without overlap; the rest spill onto the next ring, which keeps even a
 * 40-node map readable. Pure and deterministic — no DOM, no React.
 */

export interface LayoutOptions {
  nodeW?: number;
  nodeH?: number;
  centerW?: number;
  centerH?: number;
  /**
   * Width / height of the ring ellipses — pass the stage's aspect so a tall, narrow stage gets
   * near-circular rings (uses the height) and a wide one gets flatter rings (uses the width).
   * Clamped to 0.9–2.2; default 1.6.
   */
  ratio?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutResult {
  /** Center of every node, relative to the center node at (0, 0). */
  positions: Record<string, Point>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export const NODE_W = 184;
export const NODE_H = 78;
export const CENTER_W = 208;
export const CENTER_H = 88;

/** Ramanujan's approximation of an ellipse perimeter. */
function ellipsePerimeter(rx: number, ry: number): number {
  const h = ((rx - ry) * (rx - ry)) / ((rx + ry) * (rx + ry));
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

export function layoutRadial(centerKey: string, neighborKeys: string[], options: LayoutOptions = {}): LayoutResult {
  const w = options.nodeW ?? NODE_W;
  const h = options.nodeH ?? NODE_H;
  const cw = options.centerW ?? CENTER_W;
  const ch = options.centerH ?? CENTER_H;

  const positions: Record<string, Point> = { [centerKey]: { x: 0, y: 0 } };

  const ratio = Math.min(2.2, Math.max(0.9, options.ratio ?? 1.6));
  const baseRx = cw / 2 + w / 2 + 64;
  const baseRy = Math.max(ch / 2 + h / 2 + 40, baseRx / ratio);
  const ringGapX = w * 1.15;
  // Two nodes on neighboring rings at the same angle must be clear on at least one axis for EVERY
  // angle; the worst case is where the horizontal gap just reaches the node width.
  const clearVertical = (h / Math.sqrt(1 - (w / ringGapX) ** 2)) * 1.04;
  const ringGapY = Math.max(h * 1.55, clearVertical, ringGapX / ratio);
  const spacing = w * 1.12 + 14;

  let placed = 0;
  let ring = 0;
  const total = neighborKeys.length;
  while (placed < total) {
    const rx = baseRx + ring * ringGapX;
    const ry = baseRy + ring * ringGapY;
    const capacity = Math.max(3, Math.floor(ellipsePerimeter(rx, ry) / spacing));
    const count = Math.min(capacity, total - placed);
    // Spread the ring's nodes evenly even when it is not full; stagger the start angle per ring.
    const offset = -Math.PI / 2 + (ring % 2 === 1 ? Math.PI / count : 0);
    for (let i = 0; i < count; i++) {
      const angle = offset + (2 * Math.PI * i) / count;
      positions[neighborKeys[placed + i]] = { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry };
    }
    placed += count;
    ring += 1;
  }

  let minX = -cw / 2;
  let maxX = cw / 2;
  let minY = -ch / 2;
  let maxY = ch / 2;
  for (const key of neighborKeys) {
    const p = positions[key];
    minX = Math.min(minX, p.x - w / 2);
    maxX = Math.max(maxX, p.x + w / 2);
    minY = Math.min(minY, p.y - h / 2);
    maxY = Math.max(maxY, p.y + h / 2);
  }
  return { positions, bounds: { minX, minY, maxX, maxY } };
}

/** Pan/zoom that frames `bounds` inside a viewport with `padding`; never zooms in past `maxZoom`. */
export function fitTransform(
  bounds: LayoutResult["bounds"],
  viewport: { width: number; height: number },
  padding = 32,
  maxZoom = 1,
  minZoom = 0.2,
): { x: number; y: number; zoom: number } {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const fitted = Math.min((viewport.width - padding * 2) / bw, (viewport.height - padding * 2) / bh);
  const zoom = Math.min(maxZoom, Math.max(minZoom, fitted));
  // When the whole map would have to shrink below `minZoom` to fit, stay readable instead and
  // frame the center node (the viewer pans for the rest); otherwise center the whole map.
  const cx = fitted < minZoom ? 0 : (bounds.minX + bounds.maxX) / 2;
  const cy = fitted < minZoom ? 0 : (bounds.minY + bounds.maxY) / 2;
  return { zoom, x: viewport.width / 2 - cx * zoom, y: viewport.height / 2 - cy * zoom };
}
