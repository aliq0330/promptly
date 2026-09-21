import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Conversation, Prompt, PromptRequest, Tag, UserProfile } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every id Supabase generates (`gen_random_uuid()` — prompts, profiles,
 * everything) is a real UUID; every mock id ("p1", "u3", "me"), local id
 * ("local-…"), and mock request-response id ("rr1") never is. Used to
 * decide, per prompt/profile, whether an interaction (like/save/comment/
 * follow — CLAUDE.md Bölüm 21 Faz 3) should write to the real database or
 * fall back to the existing localStorage providers.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
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
 * Resizes an uploaded image file to fit within a max dimension, preserving
 * aspect ratio — used for the request-creation reference image
 * (features/requests) and for remix/duplicate live previews.
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
 * Center-crops an uploaded image file to a square and resolves a real
 * `Blob` — for uploading a profile avatar to the Supabase Storage
 * `avatars` bucket (CLAUDE.md Bölüm 20/21).
 */
export function resizeImageToSquareBlob(
  file: File,
  size = 320,
): Promise<{ blob: Blob; contentType: string }> {
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
      const contentType = "image/jpeg";
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Görsel işlenemedi"));
            return;
          }
          resolve({ blob, contentType });
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
 * Every prompt is a real Supabase row now (CLAUDE.md's mock-data removal) —
 * none of its ids are known at build time, so a static, parameter-free
 * route (`/prompts/local`, a real file after `next build`) always looks it
 * up client-side by a `?id=` query param instead (query strings don't need
 * pre-rendering, unlike a dynamic path segment a GitHub Pages static export
 * can't serve for an id it didn't know about at build time). Every place
 * that links to a prompt must use this helper instead of hardcoding
 * `/prompts/${id}`.
 */
export function promptHref(prompt: Pick<Prompt, "id">): string {
  return `/prompts/local?id=${prompt.id}`;
}

/** Same idea as `promptHref`, for requests — every request is a real Supabase row. */
export function requestHref(request: Pick<PromptRequest, "id">): string {
  return `/requests/local?id=${request.id}`;
}

/** Same idea as `promptHref`, for a user's profile — looked up client-side by a `?username=` query param. */
export function profileHref(user: Pick<UserProfile, "username">): string {
  return `/profile/real?username=${user.username}`;
}

/** Same idea as `promptHref`/`requestHref`, for a conversation — every conversation is a real Supabase row. */
export function messageHref(conversation: Pick<Conversation, "id">): string {
  return `/messages/local?id=${conversation.id}`;
}

/**
 * Same idea as `promptHref`, for a tag — tags are seeded rows (see
 * `supabase/migrations/20260919120600_seed_tags.sql`), not known at build
 * time either, so `/tags/local` looks one up client-side by a `?tag=` slug.
 */
export function tagHref(tag: Pick<Tag, "slug">): string {
  return `/tags/local?tag=${tag.slug}`;
}
