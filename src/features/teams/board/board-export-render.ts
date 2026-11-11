import { exportGeometry, parseShape, parseText, TEXT_SIZE_PX } from "@/lib/team-board";
import type { SpaceConnection, SpaceItem, SpacePalette } from "@/lib/supabase/spaces";
import { resolveMediaUrl } from "@/lib/supabase/media-url";

/**
 * Panoyu tarayıcıda bir tuvale çizer (docs/history/367-*): PNG ve PDF dışa aktarma için. Tek çizim yolu: kartlar sade (başlık + metin), görseller kırpılarak,
 * şekiller ve oklar vektör. Dış bağımlılık yok. Görsel yüklenemezse (süre/ağ) yer tutucu çizilir; dışa aktarma yine tamamlanır.
 */

export interface RenderOptions {
  items: readonly SpaceItem[];
  connections: readonly SpaceConnection[];
  palettes: readonly SpacePalette[];
  /** Öğenin görünen başlığı/metni (kaynak içerik çözülmüş hâlde). */
  describe: (item: SpaceItem) => { title: string; body: string };
  /** Yalnız bu dikdörtgen çizilir (çerçeve sayfası); verilmezse tüm pano. */
  region?: { x: number; y: number; w: number; h: number };
  maxSide?: number;
}

export interface RenderedBoard {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.replace(/\r/g, "").split(/(\s+)/);
  let line = "";
  let row = 0;
  for (const word of words) {
    if (word.includes("\n")) {
      const parts = word.split("\n");
      for (let i = 0; i < parts.length - 1; i += 1) {
        ctx.fillText(line, x, y + row * lineHeight);
        line = "";
        row += 1;
        if (row >= maxLines) return;
      }
      continue;
    }
    const test = line + word;
    if (ctx.measureText(test).width > maxWidth && line.trim()) {
      ctx.fillText(line.trimEnd(), x, y + row * lineHeight);
      line = word.trimStart();
      row += 1;
      if (row >= maxLines) return;
    } else line = test;
  }
  if (line.trim() && row < maxLines) ctx.fillText(line.trimEnd(), x, y + row * lineHeight);
}

async function loadImage(url: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const signed = await resolveMediaUrl(url);
    if (!signed) return null;
    const response = await fetch(signed);
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

/** Dikdörtgenin kenarında, merkezden `toward` noktasına doğru çıkış noktası (ok uçları için). */
function edgePoint(rect: { x: number; y: number; w: number; h: number }, toward: { x: number; y: number }) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(rect.w / 2 / Math.abs(dx || 1e-9), rect.h / 2 / Math.abs(dy || 1e-9));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

const COLORS: Record<string, [string, string]> = {
  neutral: ["--color-text-secondary", "#4b516a"],
  primary: ["--color-primary", "#3b5be2"],
  secondary: ["--color-secondary", "#b4530a"],
  success: ["--color-success", "#146c35"],
  warning: ["--color-warning", "#9a4507"],
  danger: ["--color-danger", "#c0392b"],
};

export async function renderBoard(options: RenderOptions): Promise<RenderedBoard | null> {
  const maxSide = options.maxSide ?? 4096;
  const geo = options.region
    ? (() => {
        const scale = Math.min(2, maxSide / Math.max(options.region.w, options.region.h));
        return { ...options.region, scale, pixelW: Math.max(1, Math.round(options.region.w * scale)), pixelH: Math.max(1, Math.round(options.region.h * scale)) };
      })()
    : exportGeometry(options.items, 48, maxSide);
  if (!geo) return null;
  const canvas = document.createElement("canvas");
  canvas.width = geo.pixelW;
  canvas.height = geo.pixelH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const bg = token("--color-background", "#ffffff");
  const surface = token("--color-surface", "#ffffff");
  const soft = token("--color-surface-soft", "#f0f2f8");
  const text = token("--color-text", "#14172a");
  const muted = token("--color-text-secondary", "#4b516a");
  const border = token("--color-border", "#cfd4e3");
  const primary = token("--color-primary", "#3b5be2");
  const color = (name: string) => token(COLORS[name]?.[0] ?? COLORS.neutral[0], COLORS[name]?.[1] ?? COLORS.neutral[1]);
  const font = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const mono = "ui-monospace, 'JetBrains Mono', Menlo, monospace";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(geo.scale, geo.scale);
  ctx.translate(-geo.x, -geo.y);
  ctx.textBaseline = "top";

  const ordered = [...options.items].sort((a, b) => a.z - b.z || a.createdAt.localeCompare(b.createdAt));
  const bitmaps = new Map<string, ImageBitmap | null>();
  await Promise.all(
    ordered
      .filter((item) => item.kind === "image" && item.mediaUrl)
      .map(async (item) => {
        bitmaps.set(item.id, await loadImage(item.mediaUrl));
      }),
  );
  const paletteById = new Map(options.palettes.map((palette) => [palette.id, palette]));

  const fillShape = (stroke: string) => {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = stroke;
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  const draw = (item: SpaceItem) => {
    const { x, y, w, h } = item;
    const info = options.describe(item);
    if (item.kind === "frame") {
      ctx.fillStyle = surface;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, w, h, 6);
      ctx.fill();
      ctx.stroke();
      if (!options.region && info.title) {
        ctx.fillStyle = muted;
        ctx.font = `600 14px ${font}`;
        ctx.fillText(info.title, x, y - 22, w);
      }
      return;
    }
    if (item.kind === "text") {
      const data = parseText(item.data);
      const size = TEXT_SIZE_PX[data.size];
      ctx.fillStyle = item.color === "neutral" ? text : color(item.color);
      ctx.font = `${data.bold ? "700" : "400"} ${size}px ${font}`;
      wrapText(ctx, item.body, x, y, w, size * 1.3, Math.max(1, Math.floor(h / (size * 1.3))));
      return;
    }
    if (item.kind === "shape") {
      const data = parseShape(item.data);
      const stroke = color(item.color);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = data.sw;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (data.shape === "rect") {
        roundRect(ctx, x + data.sw / 2, y + data.sw / 2, w - data.sw, h - data.sw, Math.min(10, w / 6));
        if (data.fill) fillShape(stroke);
        ctx.stroke();
      } else if (data.shape === "oval") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, (w - data.sw) / 2), Math.max(1, (h - data.sw) / 2), 0, 0, Math.PI * 2);
        if (data.fill) fillShape(stroke);
        ctx.stroke();
      } else if (data.points.length >= 2) {
        ctx.beginPath();
        data.points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(x + px * w, y + py * h) : ctx.lineTo(x + px * w, y + py * h)));
        ctx.stroke();
        if (data.shape === "arrow") {
          const last = data.points[data.points.length - 1];
          const prev = data.points[data.points.length - 2];
          const bx = x + last[0] * w;
          const by = y + last[1] * h;
          const angle = Math.atan2((last[1] - prev[1]) * h, (last[0] - prev[0]) * w);
          const head = 8 + data.sw * 2.5;
          ctx.beginPath();
          ctx.moveTo(bx + Math.cos(angle + Math.PI * 0.85) * head, by + Math.sin(angle + Math.PI * 0.85) * head);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + Math.cos(angle - Math.PI * 0.85) * head, by + Math.sin(angle - Math.PI * 0.85) * head);
          ctx.stroke();
        }
      }
      return;
    }
    if (item.kind === "image") {
      ctx.save();
      roundRect(ctx, x, y, w, h, 12);
      ctx.clip();
      const bitmap = bitmaps.get(item.id) ?? null;
      if (bitmap) {
        const scale = Math.max(w / bitmap.width, h / bitmap.height);
        const dw = bitmap.width * scale;
        const dh = bitmap.height * scale;
        ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = soft;
        ctx.fillRect(x, y, w, h);
      }
      if (info.title) {
        const bar = Math.min(48, h);
        const grad = ctx.createLinearGradient(0, y + h - bar, 0, y + h);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.6)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y + h - bar, w, bar);
        ctx.fillStyle = "#fff";
        ctx.font = `700 13px ${font}`;
        ctx.fillText(info.title, x + 10, y + h - 22, w - 20);
      }
      ctx.restore();
      return;
    }
    // Kart: not / prompt / palet / içerik
    const isNote = item.kind === "note";
    ctx.fillStyle = isNote ? soft : surface;
    ctx.strokeStyle = isNote ? color(item.color) : border;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    roundRect(ctx, x, y, w, h, 10);
    ctx.clip();
    ctx.fillStyle = item.kind === "prompt" || item.kind === "content" ? primary : muted;
    ctx.font = `700 11px ${font}`;
    const label = item.kind === "prompt" ? "PROMPT" : item.kind === "note" ? "NOT" : item.kind === "palette" ? "PALET" : (item.contentType ?? "İÇERİK").toUpperCase();
    ctx.fillText(label, x + 12, y + 10);
    if (item.kind === "palette") {
      const palette = paletteById.get(item.paletteId ?? "");
      const colors = palette?.colors ?? [];
      const top = y + 30;
      const height = Math.max(10, h - 56);
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(x + 12 + ((w - 24) / Math.max(1, colors.length)) * i, top, (w - 24) / Math.max(1, colors.length) + 0.5, height);
      });
      ctx.fillStyle = text;
      ctx.font = `600 12px ${font}`;
      ctx.fillText(palette?.name ?? info.title, x + 12, y + h - 22, w - 24);
    } else {
      ctx.fillStyle = text;
      ctx.font = `700 13px ${font}`;
      ctx.fillText(info.title, x + 12, y + 28, w - 24);
      ctx.fillStyle = muted;
      ctx.font = item.kind === "prompt" ? `400 11px ${mono}` : `400 12px ${font}`;
      wrapText(ctx, info.body, x + 12, y + 50, w - 24, 16, Math.max(1, Math.floor((h - 60) / 16)));
    }
    ctx.restore();
  };

  // Çerçeveler en altta; sonra oklar; sonra öbür öğeler.
  for (const item of ordered) if (item.kind === "frame") draw(item);
  const rects = new Map(ordered.map((item) => [item.id, { x: item.x, y: item.y, w: item.w, h: item.h }]));
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const connection of options.connections) {
    const a = rects.get(connection.fromItemId);
    const b = rects.get(connection.toItemId);
    if (!a || !b) continue;
    const from = edgePoint(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const to = edgePoint(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
    ctx.strokeStyle = color(connection.color);
    ctx.setLineDash(connection.lineStyle === "dashed" ? [10, 6] : connection.lineStyle === "dotted" ? [2, 6] : []);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const heads: [typeof from, typeof to][] = [];
    if (connection.arrow === "end" || connection.arrow === "both") heads.push([from, to]);
    if (connection.arrow === "start" || connection.arrow === "both") heads.push([to, from]);
    for (const [start, end] of heads) {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      ctx.beginPath();
      ctx.moveTo(end.x + Math.cos(angle + Math.PI * 0.85) * 12, end.y + Math.sin(angle + Math.PI * 0.85) * 12);
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(end.x + Math.cos(angle - Math.PI * 0.85) * 12, end.y + Math.sin(angle - Math.PI * 0.85) * 12);
      ctx.stroke();
    }
  }
  for (const item of ordered) if (item.kind !== "frame") draw(item);
  for (const bitmap of bitmaps.values()) bitmap?.close();
  return { canvas, width: canvas.width, height: canvas.height };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("export_failed"))), type, quality));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
