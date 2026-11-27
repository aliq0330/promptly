"use client";

import { formatRelativeTime } from "@/lib/utils";
import { PostMenu } from "./post-menu";
import type { Preset, Prompt, Workflow } from "@/types";

type PostHeaderTarget =
  | { prompt: Prompt; workflow?: never; preset?: never }
  | { workflow: Workflow; prompt?: never; preset?: never }
  | { preset: Preset; prompt?: never; workflow?: never };

/**
 * The ⋮ menu of a prompt / workflow / preset card (Paylaş, Space'e ekle, Düzenle, Sil, koleksiyondan kaldır… — docs/history/480-*).
 * Since Meydan (docs/history/190-*) the identity row itself is drawn by `ContentCardPost`; this only picks the
 * right `PostMenu` for the target.
 */
export function PostTargetMenu({
  onDeleted,
  collectionRemoval,
  ...target
}: PostHeaderTarget & {
  onDeleted?: () => void;
  collectionRemoval?: { onRemove: () => Promise<void> };
}) {
  if (target.preset) return <PostMenu target={{ kind: "preset", preset: target.preset }} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />;
  if (target.workflow) return <PostMenu target={{ kind: "workflow", workflow: target.workflow }} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />;
  return <PostMenu target={{ kind: "prompt", prompt: target.prompt }} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />;
}

/** "@carol · 3 gün önce" (+ " · Yanıt paylaştı") — the muted part of a card's identity line. */
export function postMeta(username: string, createdAt: string, language: Parameters<typeof formatRelativeTime>[1], subtitle?: string): string {
  return `@${username} · ${formatRelativeTime(createdAt, language)}${subtitle ? ` · ${subtitle}` : ""}`;
}
