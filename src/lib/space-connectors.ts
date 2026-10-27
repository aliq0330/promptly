/**
 * Space panosundaki oklar / bağlantılar için SAF geometri (docs/history/262-*): iki öğenin kutusundan çizgi yolunu, ok başlarını ve
 * etiket yerini hesaplar. Konum saklanmaz; uçlar her çizimde öğelerin o anki (sürükleme sırasında canlı) kutusundan türetilir, bu yüzden
 * öğe taşınınca ok da gelir. React yok, ağ yok — `space-connectors.test.ts`.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type ConnectorRoute = "curve" | "straight" | "elbow";
export type ConnectorArrow = "end" | "start" | "both" | "none";
export type ConnectorStyle = "solid" | "dashed" | "dotted";

export const CONNECTOR_ROUTES: readonly ConnectorRoute[] = ["curve", "straight", "elbow"];
export const CONNECTOR_ARROWS: readonly ConnectorArrow[] = ["end", "start", "both", "none"];
export const CONNECTOR_STYLES: readonly ConnectorStyle[] = ["solid", "dashed", "dotted"];

/** Ok başı ile öğe kenarı arasındaki boşluk (dünya birimi). */
export const CONNECTOR_GAP = 4;

type Side = "left" | "right" | "top" | "bottom";

export function centerOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function sidePoint(box: Box, side: Side): Point {
  switch (side) {
    case "left":
      return { x: box.x, y: box.y + box.h / 2 };
    case "right":
      return { x: box.x + box.w, y: box.y + box.h / 2 };
    case "top":
      return { x: box.x + box.w / 2, y: box.y };
    default:
      return { x: box.x + box.w / 2, y: box.y + box.h };
  }
}

function sideNormal(side: Side): Point {
  switch (side) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    default:
      return { x: 0, y: 1 };
  }
}

/** İki kutu için hangi kenarlardan çıkılacağı: ağırlıklı olarak yatay ayrılıkta sağ/sol, dikeyde alt/üst. */
export function chooseSides(from: Box, to: Box): { from: Side; to: Side } {
  const a = centerOf(from);
  const b = centerOf(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Yatay ayrım kutuların yarı genişlikleri toplamından büyükse yan kenarlar; değilse dikey.
  const horizontal = Math.abs(dx) * (from.h + to.h) >= Math.abs(dy) * (from.w + to.w);
  if (horizontal) return dx >= 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
  return dy >= 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
}

/** Kutunun merkezinden `toward` noktasına çizilen doğrunun kutu kenarıyla kesişimi (kutu içindeki bir noktaya doğru). */
export function borderPoint(box: Box, toward: Point): Point {
  const c = centerOf(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export interface ConnectorGeometry {
  /** SVG yol verisi (çizgi). */
  d: string;
  start: Point;
  end: Point;
  /** Çizginin başlangıçta / sonda DIŞARI doğru yönü (radyan): ok başı bu yöne bakar. */
  startAngle: number;
  endAngle: number;
  /** Etiketin oturduğu nokta (çizginin ortası). */
  label: Point;
}

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (p: Point) => `${round(p.x)} ${round(p.y)}`;

/**
 * İki kutu arasındaki bağlantının yolu. `curve`: kenar ortalarından çıkan kübik eğri; `straight`: merkezden merkeze düz çizgi (kenarda
 * biter); `elbow`: dik açılı (yatay-dikey-yatay ya da dikey-yatay-dikey) yol.
 */
export function connectorGeometry(from: Box, to: Box, route: ConnectorRoute): ConnectorGeometry {
  if (route === "straight") {
    const a = borderPoint(from, centerOf(to));
    const b = borderPoint(to, centerOf(from));
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    return {
      d: `M${fmt(a)}L${fmt(b)}`,
      start: a,
      end: b,
      startAngle: angle + Math.PI,
      endAngle: angle,
      label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }
  const sides = chooseSides(from, to);
  const a = sidePoint(from, sides.from);
  const b = sidePoint(to, sides.to);
  const na = sideNormal(sides.from);
  const nb = sideNormal(sides.to);
  const startAngle = Math.atan2(na.y, na.x);
  const endAngle = Math.atan2(-nb.y, -nb.x);
  if (route === "elbow") {
    const horizontal = sides.from === "left" || sides.from === "right";
    if (horizontal) {
      const midX = (a.x + b.x) / 2;
      return { d: `M${fmt(a)}H${round(midX)}V${round(b.y)}H${round(b.x)}`, start: a, end: b, startAngle, endAngle, label: { x: midX, y: (a.y + b.y) / 2 } };
    }
    const midY = (a.y + b.y) / 2;
    return { d: `M${fmt(a)}V${round(midY)}H${round(b.x)}V${round(b.y)}`, start: a, end: b, startAngle, endAngle, label: { x: (a.x + b.x) / 2, y: midY } };
  }
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const reach = Math.max(48, distance * 0.4);
  const c1 = { x: a.x + na.x * reach, y: a.y + na.y * reach };
  const c2 = { x: b.x + nb.x * reach, y: b.y + nb.y * reach };
  const mid = { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 };
  return { d: `M${fmt(a)}C${fmt(c1)} ${fmt(c2)} ${fmt(b)}`, start: a, end: b, startAngle, endAngle, label: mid };
}

/** Ok başının (üçgen) üç köşesi: `tip` noktasında, `angle` yönüne bakar. */
export function arrowHead(tip: Point, angle: number, size: number): [Point, Point, Point] {
  const back = angle + Math.PI;
  const spread = Math.PI / 7;
  return [
    tip,
    { x: tip.x + Math.cos(back + spread) * size, y: tip.y + Math.sin(back + spread) * size },
    { x: tip.x + Math.cos(back - spread) * size, y: tip.y + Math.sin(back - spread) * size },
  ];
}

export function arrowHeadPoints(tip: Point, angle: number, size: number): string {
  return arrowHead(tip, angle, size)
    .map((p) => `${round(p.x)},${round(p.y)}`)
    .join(" ");
}

export function hasArrowAtEnd(arrow: ConnectorArrow): boolean {
  return arrow === "end" || arrow === "both";
}

export function hasArrowAtStart(arrow: ConnectorArrow): boolean {
  return arrow === "start" || arrow === "both";
}

/** SVG `stroke-dasharray` (dünya biriminde; çizgi kalınlığına göre ölçekli). */
export function dashArray(style: ConnectorStyle, width: number): string | undefined {
  if (style === "dashed") return `${width * 4} ${width * 3}`;
  if (style === "dotted") return `${width * 0.1} ${width * 2.4}`;
  return undefined;
}

/** Yeni bağlantı için bir çiftin zaten bağlı olup olmadığı (yönden bağımsız): ters yönde de aynı çift iki kez çizilmez. */
export function connectionExists(connections: readonly { fromItemId: string; toItemId: string }[], a: string, b: string): boolean {
  return connections.some((c) => (c.fromItemId === a && c.toItemId === b) || (c.fromItemId === b && c.toItemId === a));
}

/** Seçili öğeler arasında sırayla zincir kurulacak çiftler (A→B, B→C…), zaten bağlı olanlar atlanır. */
export function chainPairs(ids: readonly string[], existing: readonly { fromItemId: string; toItemId: string }[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length - 1; i += 1) {
    if (ids[i] === ids[i + 1] || connectionExists(existing, ids[i], ids[i + 1]) || out.some(([a, b]) => (a === ids[i] && b === ids[i + 1]) || (a === ids[i + 1] && b === ids[i]))) continue;
    out.push([ids[i], ids[i + 1]]);
  }
  return out;
}
