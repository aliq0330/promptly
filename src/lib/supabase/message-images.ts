import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";
import type { MessageAttachment } from "@/types";

/** Private bucket created by `20260919650000_message_attachments.sql` — members of the conversation read it through signed URLs only. */
export const MESSAGE_IMAGES_BUCKET = "message-images";

/** Photos per message (the database CHECK allows up to 10; the composer is stricter on purpose). */
export const MAX_MESSAGE_IMAGES = 6;
/** Largest source file we are willing to even decode — keeps a 60 MB camera RAW from freezing a phone. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** Mirrors the bucket's own `file_size_limit` (5 MB); anything above is re-encoded smaller first. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
/** Files at or under this size and dimension are uploaded untouched. */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

const EXTENSION: Record<AllowedImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export class MessageImageError extends Error {
  constructor(
    readonly code: "type" | "tooLarge" | "decode" | "upload",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Detects the real image type from the file's first bytes. The file name and
 * the browser-reported `file.type` are both user-controlled, so neither is
 * trusted — only these magic numbers decide whether a file is a JPEG, PNG,
 * GIF or WebP. Returns null for anything else (including HEIC, SVG, HTML
 * renamed to .jpg ...).
 */
export async function sniffImageMime(file: Blob): Promise<AllowedImageMime | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length >= 6 && ascii(0, 4) === "GIF8") return "image/gif";
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export interface PreparedMessageImage {
  blob: Blob;
  mime: AllowedImageMime;
  width: number;
  height: number;
}

function loadImage(blob: Blob): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new MessageImageError("decode", translateForRuntime("image.loadFailed")));
    };
    img.src = url;
  });
}

/**
 * Validates (real type + size) and, if needed, shrinks an image for upload.
 * GIFs are never re-encoded (that would flatten the animation); everything
 * else that is large in bytes or pixels is redrawn onto a white-backed
 * canvas and saved as JPEG.
 */
export async function prepareMessageImage(file: File): Promise<PreparedMessageImage> {
  if (file.size > MAX_SOURCE_BYTES) throw new MessageImageError("tooLarge", translateForRuntime("messages.imageTooLarge"));
  const mime = await sniffImageMime(file);
  if (!mime) throw new MessageImageError("type", translateForRuntime("messages.imageTypeNotAllowed"));

  const { img, revoke } = await loadImage(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  try {
    const needsShrink = Math.max(width, height) > MAX_DIMENSION || file.size > KEEP_AS_IS_BYTES;
    if (mime === "image/gif" || !needsShrink) {
      if (file.size > MAX_UPLOAD_BYTES) throw new MessageImageError("tooLarge", translateForRuntime("messages.imageTooLarge"));
      return { blob: file.slice(0, file.size, mime), mime, width, height };
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new MessageImageError("decode", translateForRuntime("image.processFailed"));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new MessageImageError("decode", translateForRuntime("image.processFailed"));
    if (blob.size > MAX_UPLOAD_BYTES) throw new MessageImageError("tooLarge", translateForRuntime("messages.imageTooLarge"));
    return { blob, mime: "image/jpeg", width: outW, height: outH };
  } finally {
    revoke();
  }
}

/**
 * Uploads one prepared image into the sender's own folder of this
 * conversation. The object key is built only from the conversation id, the
 * signed-in user id and a fresh random UUID plus a fixed extension — the
 * original file name never reaches storage.
 */
export async function uploadMessageImage(
  conversationId: string,
  userId: string,
  image: PreparedMessageImage,
): Promise<MessageAttachment> {
  const path = `${conversationId}/${userId}/${crypto.randomUUID()}.${EXTENSION[image.mime]}`;
  const { error } = await supabase.storage.from(MESSAGE_IMAGES_BUCKET).upload(path, image.blob, {
    contentType: image.mime,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new MessageImageError("upload", translateForRuntime("messages.imageUploadFailed"));
  return { path, width: image.width, height: image.height, mime: image.mime };
}

/** Best-effort cleanup (message deleted for everyone) — never throws. */
export async function removeMessageImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(MESSAGE_IMAGES_BUCKET).remove(paths);
  } catch (err) {
    console.error("removeMessageImages", err);
  }
}

// --- signed URLs ------------------------------------------------------------

const SIGNED_URL_TTL_SECONDS = 60 * 60;
/** Re-sign a little before the real expiry so a long-open thread never shows a broken image. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const urlCache = new Map<string, { url: string; expiresAt: number }>();

export function getCachedSignedUrl(path: string): string | null {
  const hit = urlCache.get(path);
  return hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now() ? hit.url : null;
}

/** One batched request for every path not already cached; failures leave a path unresolved (the UI shows a placeholder). */
export async function resolveSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const path of paths) {
    const cached = getCachedSignedUrl(path);
    if (cached) result.set(path, cached);
    else missing.push(path);
  }
  if (missing.length > 0) {
    try {
      const { data, error } = await supabase.storage.from(MESSAGE_IMAGES_BUCKET).createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);
      if (!error && data) {
        for (const item of data) {
          if (item.path && item.signedUrl) {
            urlCache.set(item.path, { url: item.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
            result.set(item.path, item.signedUrl);
          }
        }
      }
    } catch (err) {
      console.error("resolveSignedUrls", err);
    }
  }
  return result;
}
