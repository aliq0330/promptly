/**
 * Pano dışa aktarma çekirdeği (docs/history/367-*): JSON zarfı + en küçük PDF yazıcısı (her sayfa bir JPEG). Saf ve bağımlılıksızdır; tuval çizimi
 * tarayıcıda (`features/teams/board/board-export-render.ts`). Dışa aktarma istemcide üretilir, sunucuya hiçbir şey yazılmaz.
 */

export const BOARD_EXPORT_FORMAT = "promptly.board";
export const BOARD_EXPORT_VERSION = 1;

interface ExportItem {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  title: string;
  body: string;
  note: string;
  color: string;
  mediaUrl: string | null;
  contentType: string | null;
  contentId: string | null;
  promptId: string | null;
  paletteId: string | null;
  locked?: boolean;
  data?: Record<string, unknown>;
}

interface ExportConnection {
  fromItemId: string;
  toItemId: string;
  label: string;
  arrow: string;
  lineStyle: string;
  color: string;
}

interface ExportPalette {
  id: string;
  name: string;
  colors: string[];
}

/**
 * Panonun taşınabilir JSON'u: öğeler (konum, tür, metin, renk, kaynak başvurusu), oklar, paletler. Kişi bilgisi, yorum ve yetki DOSYAYA GİRMEZ;
 * görseller adresle değil başvuruyla (`mediaUrl` kimliği) anılır — dosyanın kendisi indirilmez.
 */
export function boardToJson(input: { title: string; exportedAt?: string; items: readonly ExportItem[]; connections: readonly ExportConnection[]; palettes: readonly ExportPalette[] }) {
  return {
    format: BOARD_EXPORT_FORMAT,
    schemaVersion: BOARD_EXPORT_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    board: { title: input.title },
    items: input.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      z: item.z,
      title: item.title,
      body: item.body,
      note: item.note,
      color: item.color,
      locked: Boolean(item.locked),
      ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
      ...(item.contentType ? { contentType: item.contentType, contentId: item.contentId } : {}),
      ...(item.promptId ? { promptId: item.promptId } : {}),
      ...(item.paletteId ? { paletteId: item.paletteId } : {}),
      ...(item.data && Object.keys(item.data).length > 0 ? { data: item.data } : {}),
    })),
    connections: input.connections.map((c) => ({ from: c.fromItemId, to: c.toItemId, label: c.label, arrow: c.arrow, lineStyle: c.lineStyle, color: c.color })),
    palettes: input.palettes.map((p) => ({ id: p.id, name: p.name, colors: p.colors })),
  };
}

/** Dosya adı için güvenli (yalnız ASCII) bir kök ad. */
export function exportFileName(title: string, ext: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${base || "pano"}.${ext}`;
}

export interface PdfPage {
  jpeg: Uint8Array;
  /** Görselin piksel ölçüsü. */
  width: number;
  height: number;
}

const encoder = new TextEncoder();

/** Her sayfası tek bir JPEG olan PDF. Sayfa ölçüsü görselin ölçüsünün 0,75'i (96 dpi → pt), en çok 14400 pt. */
export function buildPdf(pages: readonly PdfPage[]): Uint8Array {
  if (pages.length === 0) throw new Error("pdf_empty");
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const text = (value: string) => push(encoder.encode(value));
  const beginObject = (id: number) => {
    offsets[id] = length;
    text(`${id} 0 obj\n`);
  };

  text("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  beginObject(1);
  text("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObject(2);
  text(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);
  pages.forEach((page, i) => {
    const pageId = 3 + i * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const pw = Math.min(14400, Math.max(1, Math.round(page.width * 0.75)));
    const ph = Math.min(14400, Math.max(1, Math.round(page.height * 0.75)));
    beginObject(pageId);
    text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    beginObject(imageId);
    text(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    push(page.jpeg);
    text("\nendstream\nendobj\n");
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    beginObject(contentId);
    text(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  text(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id += 1) text(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  text(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
