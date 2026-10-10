import type { TranslationKey } from "@/lib/i18n/translations";
import type { AdminContentType } from "@/lib/supabase/admin";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ADMIN_CONTENT_TYPES: AdminContentType[] = ["image", "text", "audio", "video"];

export const CONTENT_TYPE_KEY: Record<AdminContentType, TranslationKey> = {
  image: "contentType.image",
  text: "contentType.text",
  audio: "contentType.audio",
  video: "contentType.video",
};

const KIND_KEYS: Record<string, TranslationKey> = {
  prompt: "admin.kind.prompt",
  request: "admin.kind.request",
  generator: "admin.kind.generator",
  workflow: "admin.kind.workflow",
  preset: "admin.kind.preset",
  comment: "admin.kind.comment",
  result: "admin.kind.result",
  following: "admin.kind.following",
  follower: "admin.kind.follower",
  user: "admin.kind.user",
  message: "admin.kind.message",
  other: "admin.kind.other",
};

export function kindKey(kind: string): TranslationKey {
  return KIND_KEYS[kind] ?? "admin.kind.other";
}

export function formatDateTime(iso: string, language: "tr" | "en"): string {
  return new Date(iso).toLocaleString(language === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}
