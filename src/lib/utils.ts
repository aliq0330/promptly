import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });

export function formatRelativeTime(isoDate: string): string {
  const diffSeconds = (new Date(isoDate).getTime() - Date.now()) / 1000;
  for (const [unit, secondsInUnit] of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return relativeTimeFormatter.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return relativeTimeFormatter.format(Math.round(diffSeconds), "second");
}

export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}B`;
  return String(count);
}

/** Must match `basePath` in next.config.ts — this static export is always served from this subpath. */
const BASE_PATH = "/promptly";

/**
 * Builds a real, working shareable URL for an app-relative path (e.g.
 * `/prompts/p1`). `window.location.origin` alone is missing the GitHub
 * Pages basePath the app is actually served under, so a bare
 * `origin + path` link 404s — this adds it back.
 */
export function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${BASE_PATH}${path}`;
}

/**
 * Resizes an uploaded image file down to a small square JPEG data URL —
 * used for the avatar editor (features/profile) so a real, working photo
 * upload can be persisted to localStorage (a full-resolution image would be
 * far too large for that). Center-crops to a square first so avatars don't
 * come out stretched.
 */
export function resizeImageToDataUrl(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("2D canvas context unavailable"));
        return;
      }
      const cropSize = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - cropSize) / 2;
      const sy = (img.naturalHeight - cropSize) / 2;
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Görsel yüklenemedi"));
    };
    img.src = objectUrl;
  });
}
