import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { mockPrompts } from "@/mocks/prompts";
import type { Prompt, PromptRequest } from "@/types";

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

/**
 * Same idea as `resizeImageToDataUrl`, but fits within a max dimension
 * instead of center-cropping to a square — used for the request-creation
 * reference image (features/requests), where preserving the original
 * aspect ratio matters more than a fixed frame.
 */
export function resizeImageToDataUrlFit(file: File, maxDimension = 480): Promise<{
  url: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.round(img.naturalWidth * scale);
      const height = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("2D canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve({ url: canvas.toDataURL("image/jpeg", 0.85), width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Görsel yüklenemedi"));
    };
    img.src = objectUrl;
  });
}

/**
 * Same resize/scale logic as `resizeImageToDataUrlFit`, but resolves a real
 * `Blob` (plus its content type) instead of a data URL — for uploading to
 * Supabase Storage (CLAUDE.md Bölüm 20/21), where a data URL would just
 * mean re-decoding base64 back into bytes for no reason. Kept as a
 * separate function rather than a shared parameter: the data-URL version
 * still backs every localStorage-persisted upload (avatar edit, request
 * reference image, remix/duplicate previews), which have nothing to do
 * with Storage.
 */
export function resizeImageToBlob(
  file: File,
  maxDimension = 1600,
): Promise<{ blob: Blob; width: number; height: number; contentType: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.round(img.naturalWidth * scale);
      const height = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("2D canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const contentType = "image/jpeg";
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Görsel işlenemedi"));
            return;
          }
          resolve({ blob, width, height, contentType });
        },
        contentType,
        0.9,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Görsel yüklenemedi"));
    };
    img.src = objectUrl;
  });
}

/**
 * Any prompt that isn't one of the fixed mock ids baked into the static
 * export at build time (`generateStaticParams` on `/prompts/[id]`) has no
 * pre-rendered page there — a GitHub Pages static export can't serve a
 * path that didn't exist at build time. That covers two real cases: a
 * prompt created locally in this browser (see local-prompts-provider.tsx,
 * `local-…` ids) and, since CLAUDE.md Bölüm 21, a genuinely real prompt
 * published to Supabase (a real UUID). Both instead get a real detail view
 * at the static `/prompts/local` route, identified by a query param
 * instead of a path segment (query strings don't need pre-rendering,
 * unlike path segments) — see local-prompt-view.tsx for how it decides
 * which of the two sources (or neither) actually has the id. Every place
 * that links to a prompt must use this helper instead of hardcoding
 * `/prompts/${id}` so both cases work end to end (feed, profile, share,
 * etc.).
 */
export function promptHref(prompt: Pick<Prompt, "id">): string {
  const isStaticMockPrompt = mockPrompts.some((mock) => mock.id === prompt.id);
  return isStaticMockPrompt ? `/prompts/${prompt.id}` : `/prompts/local?id=${prompt.id}`;
}

/** Same idea as `promptHref`, for requests created locally via `/requests/new`. */
export function requestHref(request: Pick<PromptRequest, "id">): string {
  return request.id.startsWith("local-req-")
    ? `/requests/local?id=${request.id}`
    : `/requests/${request.id}`;
}
