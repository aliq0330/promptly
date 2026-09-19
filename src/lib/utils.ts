import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { mockPrompts } from "@/mocks/prompts";
import { mockRequests } from "@/mocks/requests";
import { mockUsers } from "@/mocks/users";
import type { Prompt, PromptRequest, UserProfile } from "@/types";

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
 * Same center-crop-to-square logic as `resizeImageToDataUrl`, but resolves
 * a real `Blob` instead of a data URL — for uploading a real profile's
 * avatar to the Supabase Storage `avatars` bucket (CLAUDE.md Bölüm 20/21).
 * The data-URL version still backs the mock "me" persona's avatar edit
 * (ProfileOverridesProvider/localStorage), which has nothing to do with
 * Storage.
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

/**
 * Same idea as `promptHref`, for requests — covers both a request created
 * locally via `/requests/new` (`local-req-…` ids) and, since CLAUDE.md
 * Bölüm 21 Faz 5, a genuinely real request published to Supabase (a real
 * UUID). Neither is one of the fixed mock ids `/requests/[id]` was
 * pre-rendered for at build time.
 */
export function requestHref(request: Pick<PromptRequest, "id">): string {
  const isStaticMockRequest = mockRequests.some((mock) => mock.id === request.id);
  return isStaticMockRequest ? `/requests/${request.id}` : `/requests/local?id=${request.id}`;
}

/**
 * Same idea as `promptHref`, for a user's profile — a real, signed-up
 * Supabase account (CLAUDE.md Bölüm 21) has a real, auto-generated
 * username that was never one of the fixed usernames `/profile/[username]`
 * was pre-rendered for at build time, so it routes to `/profile/real`
 * instead, which looks the profile up client-side by a `?username=` query
 * param.
 */
export function profileHref(user: Pick<UserProfile, "username">): string {
  const isStaticMockUser = mockUsers.some((mock) => mock.username === user.username);
  return isStaticMockUser ? `/profile/${user.username}` : `/profile/real?username=${user.username}`;
}
