import { translateForRuntime } from "@/lib/i18n/translations";
import { computeCrop, dimensionSteps } from "@/lib/image-geometry";

/**
 * ONE place for every photo field's limits and for the automatic shrinking (docs/history/191-*).
 *
 * A person may pick a photo of any weight — the app does not turn it away for being heavy; it redraws it smaller
 * (longest side capped, JPEG re-encoded, quality and then dimensions stepped down until the result fits the field's
 * byte budget). The only photo it refuses is one so large that decoding it could freeze the phone
 * (`IMAGE_SOURCE_MAX_BYTES`), and a file that is not a decodable picture. Re-encoding also drops the original's
 * metadata (camera, GPS position) — nothing of that reaches storage.
 */

/** Largest source file we are willing to even decode — keeps a 60 MB camera RAW from freezing a phone. */
export const IMAGE_SOURCE_MAX_BYTES = 40 * 1024 * 1024;

/** The encoded size every stored photo is brought under, per kind of field (all well below the storage buckets' own limits). */
export const IMAGE_BYTE_BUDGETS = {
  /** Profile / community picture (320px square). */
  avatar: 200 * 1024,
  /** Community cover (1600px wide strip). */
  cover: 900 * 1024,
  /** Post photos, outputs, request references, message photos. */
  media: 2 * 1024 * 1024,
} as const;

const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5] as const;

export class ImageProcessingError extends Error {
  readonly code: "tooLarge" | "decode";
  constructor(code: "tooLarge" | "decode", message: string) {
    super(message);
    this.code = code;
  }
}

/** Throws a friendly, translated error when a file is above the one shared source ceiling. */
export function assertImageSourceSize(file: Blob): void {
  if (file.size > IMAGE_SOURCE_MAX_BYTES) {
    throw new ImageProcessingError("tooLarge", translateForRuntime("image.sourceTooLarge", { max: String(Math.round(IMAGE_SOURCE_MAX_BYTES / (1024 * 1024))) }));
  }
}

/** For a picker: the translated message when a chosen file is above the shared source ceiling, else null (the photo is accepted and shrunk on upload). */
export function imageSourceProblem(file: Blob): string | null {
  try {
    assertImageSourceSize(file);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : translateForRuntime("image.processFailed");
  }
}

export interface ShrinkOptions {
  /** Longest side of the result (the picture is never enlarged). */
  maxDimension: number;
  /** Encoded size to stay under (see `IMAGE_BYTE_BUDGETS`). */
  maxBytes: number;
  /** Crop to the centered square first (avatars). */
  square?: boolean;
  /** Crop to the centered strip of this width / height first (covers). */
  aspect?: number;
}

export interface ShrunkImage {
  blob: Blob;
  width: number;
  height: number;
  contentType: "image/jpeg";
}

function loadImage(blob: Blob): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageProcessingError("decode", translateForRuntime("image.loadFailed")));
    };
    img.src = url;
  });
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Redraws a picture onto a white-backed canvas (so a transparent PNG does not turn black) at the requested size and saves it as
 * JPEG; while the result is still over `maxBytes` the quality and then the dimensions step down. Always resolves a picture that
 * fits the budget except for the pathological case of a still-too-large result at the smallest step (returned as is).
 */
export async function shrinkImage(file: Blob, options: ShrinkOptions): Promise<ShrunkImage> {
  assertImageSourceSize(file);
  const { img, revoke } = await loadImage(file);
  try {
    const crop = computeCrop(img.naturalWidth, img.naturalHeight, { square: options.square, aspect: options.aspect });
    const longest = Math.max(crop.sw, crop.sh);
    const start = Math.min(options.maxDimension, longest);
    let last: ShrunkImage | null = null;
    for (const dimension of dimensionSteps(start)) {
      const scale = dimension / longest;
      const width = Math.max(1, Math.round(crop.sw * scale));
      const height = Math.max(1, Math.round(crop.sh * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ImageProcessingError("decode", translateForRuntime("image.processFailed"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
      for (const quality of QUALITY_STEPS) {
        const blob = await encodeJpeg(canvas, quality);
        if (!blob) throw new ImageProcessingError("decode", translateForRuntime("image.processFailed"));
        last = { blob, width, height, contentType: "image/jpeg" };
        if (blob.size <= options.maxBytes) return last;
      }
    }
    if (!last) throw new ImageProcessingError("decode", translateForRuntime("image.processFailed"));
    return last;
  } finally {
    revoke();
  }
}
