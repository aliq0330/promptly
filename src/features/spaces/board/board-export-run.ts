import type { TranslationKey } from "@/lib/i18n/translations";
import { boardToJson, buildPdf, exportFileName } from "@/lib/board-export";
import { presentationFrames } from "@/lib/team-board";
import type { SpaceConnection, SpaceItem, SpacePalette } from "@/lib/supabase/spaces";
import { canvasToBlob, downloadBlob, renderBoard } from "@/features/teams/board/board-export-render";

/**
 * Panoyu tarayıcıda PNG / PDF / JSON olarak indirir (docs/history/367-*; kişisel Space'e açıldı, docs/history/460-*). Ekip panosunun
 * Paylaş penceresi ve kişisel Space'in araç çubuğu AYNI işlevi kullanır; hiçbir şey sunucuya yazılmaz.
 */
export interface BoardExportData {
  title: string;
  items: SpaceItem[];
  connections: SpaceConnection[];
  palettes: SpacePalette[];
  describe: (item: SpaceItem) => { title: string; body: string };
}

export type BoardExportKind = "png" | "pdf" | "json";

/** Başarısızlıkta kullanıcıya gösterilecek metinle `Error` fırlatır (boş pano dahil). */
export async function runBoardExport(kind: BoardExportKind, data: BoardExportData, t: (key: TranslationKey) => string): Promise<void> {
  if (kind === "json") {
    const json = boardToJson({ title: data.title, items: data.items, connections: data.connections, palettes: data.palettes });
    downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), exportFileName(data.title, "json"));
    return;
  }
  if (kind === "png") {
    const rendered = await renderBoard({ items: data.items, connections: data.connections, palettes: data.palettes, describe: data.describe });
    if (!rendered) throw new Error(t("tb.share.emptyBoard"));
    downloadBlob(await canvasToBlob(rendered.canvas, "image/png"), exportFileName(data.title, "png"));
    return;
  }
  const frames = presentationFrames(data.items);
  const regions = frames.length > 0 ? frames.map((frame) => ({ x: frame.x, y: frame.y, w: frame.w, h: frame.h })) : [undefined];
  const pages = [];
  for (const region of regions) {
    const rendered = await renderBoard({ items: data.items, connections: data.connections, palettes: data.palettes, describe: data.describe, region, maxSide: 3000 });
    if (!rendered) throw new Error(t("tb.share.emptyBoard"));
    const jpeg = new Uint8Array(await (await canvasToBlob(rendered.canvas, "image/jpeg", 0.9)).arrayBuffer());
    pages.push({ jpeg, width: rendered.width, height: rendered.height });
  }
  downloadBlob(new Blob([buildPdf(pages) as BlobPart], { type: "application/pdf" }), exportFileName(data.title, "pdf"));
}
