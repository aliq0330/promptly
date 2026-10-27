/**
 * Workflow akış diyagramının SAF yerleşimi (docs/history/261-*): adımlar satır satır dizilir, ardışık adımlar okla bağlanır, her adımın
 * altında kullandığı içerik kartı ve kartlar arasındaki ilişki yayları durur. React yok, ağ yok — birim testlidir.
 *
 * Koordinatlar "doğal" birimdedir (px gibi); çizen bileşen bütün tuvali ölçekler (pano öğesi kutusuna ya da sayfa genişliğine sığdırır).
 */

export interface FlowStepLike {
  id: string;
  inputs: { source: { stepId: string; outputId: string } | null }[];
  outputs: { id: string; label: string }[];
}

export interface FlowOptions {
  showIo: boolean;
  showLinks: boolean;
  showRelations: boolean;
  /** Bir satırdaki en çok adım (kalanı alt satıra sarar). */
  perRow?: number;
}

export interface FlowRelationLike {
  /** İlişkinin iki ucu: adım sırası (0 tabanlı). */
  a: number;
  b: number;
}

export const FLOW_DEFAULT_PER_ROW = 4;
export const FLOW_NODE_W = 200;
export const FLOW_NODE_H = 176;
export const FLOW_GAP_X = 64;
export const FLOW_PAD_X = 36;
/** Üst şerit (çerçeve başlığı). */
export const FLOW_HEADER_H = 60;
export const FLOW_LINK_GAP = 28;
export const FLOW_LINK_H = 112;
/** İlişki yaylarının altında ayrılan yükseklik. */
export const FLOW_REL_H = 64;
export const FLOW_ROW_GAP = 56;
export const FLOW_PAD_BOTTOM = 28;

export interface FlowBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlowNode extends FlowBox {
  index: number;
  row: number;
}

export interface FlowArrow {
  from: number;
  to: number;
  /** SVG yolu (okun ucu `to` düğümünde). */
  path: string;
  label: string | null;
  labelX: number;
  labelY: number;
}

export interface FlowRelationPath {
  a: number;
  b: number;
  path: string;
  labelX: number;
  labelY: number;
}

export interface FlowLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  nodes: FlowNode[];
  /** Adımın altındaki içerik kartı (yalnız `showLinks`). */
  links: FlowBox[];
  arrows: FlowArrow[];
  /** Aynı satırdaki iki adımın içerikleri arasındaki ilişki yayları. */
  relations: FlowRelationPath[];
  /** Satırlar arasında kalan ilişkiler (yay çizilmez; kartın altında yazı olarak gösterilir). */
  crossRowRelations: FlowRelationPath[];
}

/** Oku taşıyan çıktı: sonraki adımın bir girdisine bağlı çıktının adı; yoksa adımın ilk çıktısı. */
export function arrowLabel(from: FlowStepLike, to: FlowStepLike): string | null {
  const wired = to.inputs.find((input) => input.source?.stepId === from.id);
  const output = wired ? from.outputs.find((o) => o.id === wired.source!.outputId) : from.outputs[0];
  const label = output?.label.trim();
  return label ? label : null;
}

function rowStride(options: FlowOptions): number {
  let h = FLOW_NODE_H;
  if (options.showLinks) h += FLOW_LINK_GAP + FLOW_LINK_H;
  if (options.showRelations) h += FLOW_REL_H;
  return h + FLOW_ROW_GAP;
}

export function computeFlowLayout(steps: FlowStepLike[], options: FlowOptions, relations: FlowRelationLike[] = []): FlowLayout {
  const perRow = Math.max(1, options.perRow ?? FLOW_DEFAULT_PER_ROW);
  const count = steps.length;
  const columns = Math.max(1, Math.min(count, perRow));
  const rows = Math.max(1, Math.ceil(count / columns));
  const width = FLOW_PAD_X * 2 + columns * FLOW_NODE_W + (columns - 1) * FLOW_GAP_X;
  const stride = rowStride(options);
  const height = FLOW_HEADER_H + rows * stride - FLOW_ROW_GAP + FLOW_PAD_BOTTOM;

  const nodes: FlowNode[] = steps.map((_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return { index, row, x: FLOW_PAD_X + col * (FLOW_NODE_W + FLOW_GAP_X), y: FLOW_HEADER_H + row * stride, w: FLOW_NODE_W, h: FLOW_NODE_H };
  });

  const links: FlowBox[] = options.showLinks
    ? nodes.map((node) => ({ x: node.x, y: node.y + FLOW_NODE_H + FLOW_LINK_GAP, w: FLOW_NODE_W, h: FLOW_LINK_H }))
    : [];

  const arrows: FlowArrow[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const label = arrowLabel(steps[i], steps[i + 1]);
    const midA = a.y + FLOW_NODE_H / 2;
    if (a.row === b.row) {
      arrows.push({ from: i, to: i + 1, path: `M${a.x + a.w + 4} ${midA}H${b.x - 6}`, label, labelX: a.x + a.w + FLOW_GAP_X / 2, labelY: midA - 16 });
    } else {
      // Satır sonundan sonraki satırın başına: sağ kenar boşluğundan aşağı, satır arasından sola, sol kenar boşluğundan düğüme.
      const rightX = a.x + a.w + 18;
      const leftX = FLOW_PAD_X - 18;
      const betweenY = b.y - FLOW_ROW_GAP / 2;
      const midB = b.y + FLOW_NODE_H / 2;
      arrows.push({
        from: i,
        to: i + 1,
        path: `M${a.x + a.w + 4} ${midA}H${rightX}V${betweenY}H${leftX}V${midB}H${b.x - 6}`,
        label,
        labelX: width / 2,
        labelY: betweenY - 12,
      });
    }
  }

  const anchor = (index: number): FlowBox => (options.showLinks ? links[index] : nodes[index]);
  const relPaths: FlowRelationPath[] = [];
  const crossRowRelations: FlowRelationPath[] = [];
  if (options.showRelations) {
    const seen = new Set<string>();
    for (const rel of relations) {
      const lo = Math.min(rel.a, rel.b);
      const hi = Math.max(rel.a, rel.b);
      const key = `${lo}:${hi}`;
      if (lo === hi || lo < 0 || hi >= count || seen.has(key)) continue;
      seen.add(key);
      const from = anchor(lo);
      const to = anchor(hi);
      const ax = from.x + from.w / 2;
      const bx = to.x + to.w / 2;
      const baseY = from.y + from.h + 4;
      if (nodes[lo].row === nodes[hi].row) {
        // Yayın derinliği uzaklıkla artar: komşu olmayan adımların yayları üst üste binmesin.
        const depth = Math.min(FLOW_REL_H - 12, 30 + (hi - lo - 1) * 12);
        relPaths.push({ a: lo, b: hi, path: `M${ax} ${baseY}C${ax} ${baseY + depth * 1.35} ${bx} ${baseY + depth * 1.35} ${bx} ${baseY}`, labelX: (ax + bx) / 2, labelY: baseY + depth });
      } else {
        crossRowRelations.push({ a: lo, b: hi, path: "", labelX: ax, labelY: baseY });
      }
    }
  }

  return { width, height, columns, rows, nodes, links, arrows, relations: relPaths, crossRowRelations };
}

/** Pano öğesinin ilk boyutu: doğal boyutun yarısı kadar (okunur ama panoyu kaplamaz), makul sınırlarla. */
export function flowItemSize(layout: Pick<FlowLayout, "width" | "height">): { w: number; h: number } {
  const scale = 0.85;
  return { w: Math.round(Math.min(4000, Math.max(320, layout.width * scale))), h: Math.round(Math.min(4000, Math.max(200, layout.height * scale))) };
}

/** Kutuya (w × h) sığan ölçek: oran korunur, büyütme yok. */
export function fitScale(layout: Pick<FlowLayout, "width" | "height">, box: { w: number; h: number } | { w: number }, allowUpscale = false): number {
  const byWidth = box.w / layout.width;
  const byHeight = "h" in box ? box.h / layout.height : Number.POSITIVE_INFINITY;
  const scale = Math.min(byWidth, byHeight);
  return allowUpscale ? scale : Math.min(1, scale);
}
