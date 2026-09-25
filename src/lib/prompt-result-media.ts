import { placeholderArt } from "@/lib/placeholder-image";
import { resizeImageToBlob } from "@/lib/utils";
import type { PromptResultMediaType } from "@/types";

/** Turkish label for a result's media type — shared by the card, the share preview badge, and the detail page. */
export const RESULT_MEDIA_TYPE_LABELS: Record<PromptResultMediaType, string> = {
  image: "Görsel",
  video: "Video",
  audio: "Ses",
  text: "Metin",
  other: "Diğer",
};

/**
 * Auto-detects a Kullanıcı Sonucu's media type from an uploaded file's real
 * MIME type (CLAUDE.md §2 — "sistem dosya tipinden otomatik olarak
 * algılamalı"). Returns `null` for anything that isn't image/video/audio —
 * the Storage bucket's own `allowed_mime_types` (see the migration) would
 * reject it anyway, so the upload UI refuses it up front with an honest
 * message instead of a raw storage error.
 */
export function detectMediaTypeFromFile(file: File): Extract<PromptResultMediaType, "image" | "video" | "audio"> | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

interface ResizedBlob {
  blob: Blob;
  width: number;
  height: number;
  contentType: string;
}

/**
 * An image result needs two real uploads, never one — a small thumbnail for
 * the compact card grid (CLAUDE.md §16's lazy-loading rule: a grid of 6+
 * cards must never each load a full-size image) and a larger "full" copy
 * for the detail viewer. Reuses the exact same `resizeImageToBlob` this app
 * already uses for prompt/generator/avatar images — just called twice, at
 * two different target sizes.
 */
export async function prepareImageResultUploads(file: File): Promise<{ full: ResizedBlob; thumb: ResizedBlob }> {
  const [full, thumb] = await Promise.all([resizeImageToBlob(file, 1600), resizeImageToBlob(file, 480)]);
  return { full, thumb };
}

/**
 * Captures a single frame from an uploaded video file as a real poster
 * thumbnail — plain `<video>` + `<canvas>`, no external library (this
 * project's standing "no new dependency for something the browser already
 * does" rule, same reasoning as the field-catalog icons/placeholder art).
 * Seeks a fraction of a second in rather than frame 0, which is very often
 * a black/blank frame for real video files.
 */
export function captureVideoPosterBlob(file: File): Promise<ResizedBlob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = objectUrl;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    video.onloadedmetadata = () => {
      // A tiny offset into the clip, capped to its own duration — avoids a
      // black frame at t=0 without assuming any particular clip length.
      video.currentTime = Math.min(0.3, Math.max(0, video.duration / 4 || 0));
    };
    video.onseeked = () => {
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("2D canvas context unavailable"));
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          if (!blob) {
            reject(new Error("Video kapak görseli oluşturulamadı."));
            return;
          }
          resolve({ blob, width, height, contentType: "image/jpeg" });
        },
        "image/jpeg",
        0.85,
      );
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Video dosyası okunamadı."));
    };
  });
}

/**
 * A deterministic, offline placeholder "cover" for an audio result — this
 * app has no audio-processing dependency to compute a real waveform, so it
 * honestly reuses the same seeded abstract art already used for prompt/
 * generator placeholders (never presented as a real waveform, just a
 * visual "this is an audio result" cue).
 */
export function audioPlaceholderCover(seed: string): string {
  return placeholderArt(seed, 480, 480);
}
