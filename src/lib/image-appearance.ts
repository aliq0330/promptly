/**
 * A picture's "appearance" for the speed feel (docs/history/209-*): its average colour (`#rrggbb`) and a tiny JPEG of
 * it (≈ 24px on the long side, a data URL well under 3 KB). Cards paint the colour at once and lay the tiny version over
 * it blurred, so a box never sits grey while the real picture is still on its way; the real picture then fades in on
 * top. Computed once, when the picture is uploaded (and by the moderators' backfill for older rows) — never while a
 * card renders. Best effort: any failure returns `null` and the upload goes on without it.
 */
export interface ImageAppearance {
  color: string;
  placeholder: string | null;
}

/** Long side of the stored preview; the matching DB check allows up to 3000 characters. */
const PREVIEW_SIZE = 24;
const PREVIEW_MAX_CHARS = 3000;

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function appearanceOf(source: CanvasImageSource, width: number, height: number): ImageAppearance | null {
  if (!width || !height) return null;
  const scale = PREVIEW_SIZE / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // White under a transparent PNG, like the upload shrinker, so the colour matches what the card shows.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const color = `#${toHex(r / pixels)}${toHex(g / pixels)}${toHex(b / pixels)}`;
  let placeholder: string | null = null;
  for (const quality of [0.6, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.startsWith("data:image/jpeg;base64,") && url.length <= PREVIEW_MAX_CHARS) {
      placeholder = url;
      break;
    }
  }
  return { color, placeholder };
}

/** From a picture file / blob (the upload path). */
export async function imageAppearanceFromBlob(blob: Blob): Promise<ImageAppearance | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      try {
        return appearanceOf(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return appearanceOf(img, img.naturalWidth, img.naturalHeight);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/** From a picture already in Storage (a signed URL; the moderators' backfill). */
export async function imageAppearanceFromUrl(url: string): Promise<ImageAppearance | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await imageAppearanceFromBlob(await response.blob());
  } catch {
    return null;
  }
}
