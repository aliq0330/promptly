/**
 * Ekip panosunun SAF kuralları (docs/history/367-*): pano grubu (sayfalar), çizim öğeleri (çerçeve/metin/şekil), sunum sırası,
 * konumlu yorumlar. Çerçeveden bağımsızdır, `npm test` ile sınanır (`team-board.test.ts`). Yetki kararı sunucudadır.
 */
import { projectLink } from "./team-projects.ts";

// ---------------------------------------------------------------------------------------------
// Pano grubu
// ---------------------------------------------------------------------------------------------

/** Bir pano grubunun sayfası (docs/history/368-*: yalnız AYNI GRUPTAKİ panolar; bağımsız pano tek sayfadır). */
export interface BoardPageInfo {
  id: string;
  title: string;
  isMain: boolean;
  itemCount: number;
  updatedAt: string | null;
  pendingCount: number | null;
  openComments: number;
  groupId: string | null;
}

interface AreaLike {
  id: string;
  title: string;
  fileId: string | null;
  isMain?: boolean;
  position?: number;
  groupId?: string | null;
  itemCount: number;
  updatedAt?: string | null;
  pendingCount?: number | null;
  openComments?: number;
}

interface GroupLike {
  id: string;
  title: string;
  fileId: string | null;
}

interface DetailLike {
  mainAreaId: string | null;
  areas?: AreaLike[];
  groups?: GroupLike[];
  boards: { id: string; title: string; fileId: string | null; itemCount: number; position?: number; groupId?: string | null }[];
  files: { id: string; title: string; mainAreaId: string | null; itemCount: number }[];
}

function toPage(area: AreaLike, title: string): BoardPageInfo {
  return {
    id: area.id,
    title,
    isMain: Boolean(area.isMain),
    itemCount: area.itemCount,
    updatedAt: area.updatedAt ?? null,
    pendingCount: area.pendingCount ?? null,
    openComments: area.openComments ?? 0,
    groupId: area.groupId ?? null,
  };
}

/**
 * Açık panonun sayfaları = ONUN GRUBUNUN panoları (sıralı). Pano bir grupta değilse (bağımsız pano) tek sayfadır; eski ana alan (dosyanın öğe kabı)
 * de tek sayfadır. `areas` yoksa (eski sunucu) `boards`'tan türetilir.
 */
export function boardGroupPagesOf(detail: DetailLike, areaId: string, mainTitle: string): BoardPageInfo[] {
  const areas: AreaLike[] = detail.areas ?? [
    ...(detail.mainAreaId ? [{ id: detail.mainAreaId, title: mainTitle, fileId: null, isMain: true, itemCount: 0 }] : []),
    ...detail.files.filter((file) => file.mainAreaId).map((file) => ({ id: file.mainAreaId as string, title: file.title, fileId: file.id, isMain: true, itemCount: file.itemCount })),
    ...detail.boards.map((board) => ({ id: board.id, title: board.title, fileId: board.fileId, isMain: false, position: board.position, groupId: board.groupId ?? null, itemCount: board.itemCount })),
  ];
  const current = areas.find((area) => area.id === areaId);
  if (!current) return [];
  if (current.isMain || !current.groupId) return [toPage(current, current.isMain ? mainTitle : current.title)];
  return areas
    .filter((area) => !area.isMain && area.groupId === current.groupId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((area) => toPage(area, area.title));
}

/** Dosya ekranındaki pano satırı: bağımsız pano ya da bir pano GRUBU (grup tek satırdır; açınca ilk panoya gider). */
export interface FileBoardEntry {
  kind: "board" | "group";
  /** Pano kimliği ya da grup kimliği. */
  id: string;
  title: string;
  itemCount: number;
  boardCount: number;
  /** Satıra dokununca açılacak pano (grupta sıradaki ilk pano). */
  openBoardId: string;
}

export function fileBoardEntries(detail: Pick<DetailLike, "boards" | "groups">, fileId: string): FileBoardEntry[] {
  const boards = detail.boards.filter((board) => board.fileId === fileId).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const entries: FileBoardEntry[] = [];
  const seen = new Set<string>();
  for (const board of boards) {
    if (!board.groupId) {
      entries.push({ kind: "board", id: board.id, title: board.title, itemCount: board.itemCount, boardCount: 1, openBoardId: board.id });
      continue;
    }
    if (seen.has(board.groupId)) continue;
    seen.add(board.groupId);
    const members = boards.filter((other) => other.groupId === board.groupId);
    const title = detail.groups?.find((group) => group.id === board.groupId)?.title ?? board.title;
    entries.push({ kind: "group", id: board.groupId, title, itemCount: members.reduce((sum, member) => sum + member.itemCount, 0), boardCount: members.length, openBoardId: members[0].id });
  }
  return entries;
}

/** Bir panonun adresi: her pano (dosya ana alanı dahil) `?board=<alan>&sub=board` ile açılır. */
export function boardPageHref(teamId: string, projectId: string, areaId: string, extra: { comment?: string | null } = {}): string {
  return projectLink(teamId, projectId, { board: areaId, sub: "board", comment: extra.comment ?? null });
}

/** Ek panoyu bir basamak yukarı/aşağı alır (ana pano sabit, listede yoktur). Sınırdaysa aynı sırayı döner. */
export function moveBoardId(extraIds: readonly string[], id: string, delta: -1 | 1): string[] {
  const index = extraIds.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= extraIds.length) return [...extraIds];
  const next = [...extraIds];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** "Taslaklar (kopya)" gibi bir ad; 80 karakter sınırı içinde kalır. */
export function copyTitle(title: string, suffix: string): string {
  const base = `${title} ${suffix}`;
  return base.length <= 80 ? base : `${title.slice(0, 80 - suffix.length - 2).trimEnd()}… ${suffix}`;
}

// ---------------------------------------------------------------------------------------------
// Çizim öğeleri (frame / text / shape)
// ---------------------------------------------------------------------------------------------

export const DRAWING_KINDS = ["frame", "text", "shape"] as const;
export function isDrawingKind(kind: string): boolean {
  return (DRAWING_KINDS as readonly string[]).includes(kind);
}

export type ShapeKind = "rect" | "oval" | "line" | "arrow" | "draw";
export const SHAPE_KINDS: readonly ShapeKind[] = ["rect", "oval", "line", "arrow", "draw"];
export type StrokeWidth = 2 | 4 | 8;
export const STROKE_WIDTHS: readonly StrokeWidth[] = [2, 4, 8];

export interface ShapeData {
  shape: ShapeKind;
  /** Dikdörtgen/oval içi dolu mu. */
  fill: boolean;
  sw: StrokeWidth;
  /** Çizgi/ok/serbest çizim noktaları: kutu içinde 0..1 normalleştirilmiş. */
  points: [number, number][];
}

export type TextSize = "sm" | "md" | "lg" | "xl";
export const TEXT_SIZES: readonly TextSize[] = ["sm", "md", "lg", "xl"];
export const TEXT_SIZE_PX: Record<TextSize, number> = { sm: 14, md: 20, lg: 32, xl: 52 };
export interface TextData {
  size: TextSize;
  bold: boolean;
}

export const MAX_DRAW_POINTS = 400;
export const MIN_BOX = 40;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Sunucudan gelen `data` bozuk olabilir: her zaman güvenli bir şekil döner. */
export function parseShape(data: unknown): ShapeData {
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const shape = SHAPE_KINDS.includes(raw.shape as ShapeKind) ? (raw.shape as ShapeKind) : "rect";
  const sw = STROKE_WIDTHS.includes(raw.sw as StrokeWidth) ? (raw.sw as StrokeWidth) : 4;
  const points: [number, number][] = [];
  if (Array.isArray(raw.points)) {
    for (const point of raw.points.slice(0, MAX_DRAW_POINTS)) {
      if (Array.isArray(point) && isNumber(point[0]) && isNumber(point[1])) points.push([Math.min(1, Math.max(0, point[0])), Math.min(1, Math.max(0, point[1]))]);
    }
  }
  return { shape, fill: raw.fill === true, sw, points };
}

export function parseText(data: unknown): TextData {
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return { size: TEXT_SIZES.includes(raw.size as TextSize) ? (raw.size as TextSize) : "md", bold: raw.bold === true };
}

/** Ramer–Douglas–Peucker: serbest çizimin nokta sayısını azaltır (veri küçük kalsın). */
export function simplifyPath(points: readonly [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points.map((p) => [p[0], p[1]]);
  const first = points[0];
  const last = points[points.length - 1];
  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = distanceToSegment(points[i], first, last);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= epsilon) return [[first[0], first[1]], [last[0], last[1]]];
  const left = simplifyPath(points.slice(0, index + 1), epsilon);
  const right = simplifyPath(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function distanceToSegment(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export interface NormalizedShape {
  box: { x: number; y: number; w: number; h: number };
  points: [number, number][];
}

/**
 * Dünya noktalarından kutu + kutuya göre 0..1 noktalar. Kutu en az `MIN_BOX` olur (düz yatay/dikey çizgi de sunucunun alt sınırını geçsin);
 * kısa kenar noktalarla birlikte ortalanır. En çok `MAX_DRAW_POINTS` nokta tutulur.
 */
export function normalizePoints(world: readonly [number, number][], pad = 0): NormalizedShape {
  let simplified = simplifyPath(world, 1.5);
  for (let eps = 3; simplified.length > MAX_DRAW_POINTS; eps *= 1.6) simplified = simplifyPath(simplified, eps);
  const xs = simplified.map((p) => p[0]);
  const ys = simplified.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  let w = maxX - minX;
  let h = maxY - minY;
  let x = minX;
  let y = minY;
  if (w < MIN_BOX) {
    x -= (MIN_BOX - w) / 2;
    w = MIN_BOX;
  }
  if (h < MIN_BOX) {
    y -= (MIN_BOX - h) / 2;
    h = MIN_BOX;
  }
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { box: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, points: simplified.map((p) => [round((p[0] - x) / w), round((p[1] - y) / h)]) };
}

/** İki uç noktalı çizgi/ok. */
export function lineShape(ax: number, ay: number, bx: number, by: number): NormalizedShape {
  return normalizePoints([[ax, ay], [bx, by]]);
}

/** Dikdörtgen/oval/çerçeve için sürükleme kutusu (ters yönde de çalışır; en az `MIN_BOX`). */
export function dragBox(ax: number, ay: number, bx: number, by: number): { x: number; y: number; w: number; h: number } {
  const w = Math.max(MIN_BOX, Math.abs(bx - ax));
  const h = Math.max(MIN_BOX, Math.abs(by - ay));
  return { x: Math.round(Math.min(ax, bx)), y: Math.round(Math.min(ay, by)), w: Math.round(w), h: Math.round(h) };
}

interface BoxLike {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked?: boolean;
}

/** Çerçeve taşınınca birlikte giden öğeler: merkezi çerçevenin içinde olanlar (başka çerçeveler ve kilitliler hariç). */
export function frameMemberIds(frame: BoxLike, items: readonly BoxLike[]): string[] {
  return items
    .filter((item) => item.id !== frame.id && item.kind !== "frame" && !item.locked)
    .filter((item) => {
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
    })
    .map((item) => item.id);
}

/** Sunum sırası: çerçeveler okuma sırasıyla (üstten alta satırlar, satır içinde soldan sağa). */
export function presentationFrames<T extends BoxLike>(items: readonly T[]): T[] {
  const frames = items.filter((item) => item.kind === "frame");
  if (frames.length <= 1) return [...frames];
  const rowHeight = Math.max(80, Math.min(...frames.map((frame) => frame.h)) / 2);
  return [...frames].sort((a, b) => {
    const rowA = Math.round(a.y / rowHeight);
    const rowB = Math.round(b.y / rowHeight);
    return rowA - rowB || a.x - b.x;
  });
}

// ---------------------------------------------------------------------------------------------
// Konumlu yorumlar
// ---------------------------------------------------------------------------------------------

export interface PinLike {
  id: string;
  parentId: string | null;
  x: number | null;
  y: number | null;
  itemId: string | null;
  offX: number | null;
  offY: number | null;
}

/** Pinin dünya konumu: öğeye bağlı ve öğe hâlâ varsa öğenin sol üstü + ofset (pin öğeyle birlikte gider); yoksa kayıtlı konum. */
export function pinWorldPosition(pin: PinLike, items: ReadonlyMap<string, { x: number; y: number }>): { x: number; y: number } | null {
  if (pin.parentId) return null;
  if (pin.itemId && pin.offX !== null && pin.offY !== null) {
    const item = items.get(pin.itemId);
    if (item) return { x: item.x + pin.offX, y: item.y + pin.offY };
  }
  return pin.x === null || pin.y === null ? null : { x: pin.x, y: pin.y };
}

export interface CommentLike {
  id: string;
  parentId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface Thread<T extends CommentLike> {
  root: T;
  replies: T[];
}

/** Kök yorumlar + yanıtları (kök: en yeni önce; yanıtlar: eskiden yeniye). Kökü olmayan (görünmeyen) yanıt atılır. */
export function groupThreads<T extends CommentLike>(comments: readonly T[]): Thread<T>[] {
  const replies = new Map<string, T[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const list = replies.get(comment.parentId) ?? [];
    list.push(comment);
    replies.set(comment.parentId, list);
  }
  return comments
    .filter((comment) => !comment.parentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((root) => ({ root, replies: (replies.get(root.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }));
}

export type CommentFilter = "open" | "resolved";
export function filterThreads<T extends CommentLike>(threads: readonly Thread<T>[], filter: CommentFilter): Thread<T>[] {
  return threads.filter((thread) => (filter === "resolved" ? thread.root.resolvedAt !== null : thread.root.resolvedAt === null));
}

/** `@kullanıcı` bahsetmelerinin küçük harfli adları (sunucu aynı kalıpla bildirim yazar). */
export function mentionedUsernames(body: string): string[] {
  const out = new Set<string>();
  for (const match of body.matchAll(/@([A-Za-z0-9_]{2,30})/g)) out.add(match[1].toLowerCase());
  return [...out];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toLocaleUpperCase();
}

// ---------------------------------------------------------------------------------------------
// Dışa aktarma ölçüsü
// ---------------------------------------------------------------------------------------------

/** Dışa aktarılacak tuvalin ölçüsü: öğelerin sınırı + kenar boşluğu; uzun kenar `maxSide`'ı geçmez (ölçek ≤ 2). */
export function exportGeometry(items: readonly { x: number; y: number; w: number; h: number }[], padding = 48, maxSide = 4096): { x: number; y: number; w: number; h: number; scale: number; pixelW: number; pixelH: number } | null {
  if (items.length === 0) return null;
  const minX = Math.min(...items.map((i) => i.x)) - padding;
  const minY = Math.min(...items.map((i) => i.y)) - padding;
  const maxX = Math.max(...items.map((i) => i.x + i.w)) + padding;
  const maxY = Math.max(...items.map((i) => i.y + i.h)) + padding;
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = Math.min(2, maxSide / Math.max(w, h));
  return { x: minX, y: minY, w, h, scale, pixelW: Math.max(1, Math.round(w * scale)), pixelH: Math.max(1, Math.round(h * scale)) };
}
