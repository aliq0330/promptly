"use client";

import { formatRelativeTime } from "@/lib/utils";
import { PostMenu } from "./post-menu";
import type { Preset, Prompt, Workflow } from "@/types";

type PostHeaderTarget =
  | { prompt: Prompt; workflow?: never; preset?: never }
  | { workflow: Workflow; prompt?: never; preset?: never }
  | { preset: Preset; prompt?: never; workflow?: never };

/**
 * The ⋮ menu of a prompt / workflow / preset card (Bağlantıyı kopyala, Düzenle, Sil, koleksiyondan kaldır…).
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
  if (target.preset) {
    return <PostMenu presetId={target.preset.id} communityId={target.preset.communityId} authorId={target.preset.creator.id} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />;
  }
  if (target.workflow) {
    return <PostMenu workflowId={target.workflow.id} communityId={target.workflow.communityId} authorId={target.workflow.creator.id} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />;
  }
  return <PostMenu promptId={target.prompt.id} communityId={target.prompt.communityId} authorId={target.prompt.author.id} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />;
}

/** "@carol · 3 gün önce" (+ " · Yanıt paylaştı") — the muted part of a card's identity line. */
export function postMeta(username: string, createdAt: string, language: Parameters<typeof formatRelativeTime>[1], subtitle?: string): string {
  return `@${username} · ${formatRelativeTime(createdAt, language)}${subtitle ? ` · ${subtitle}` : ""}`;
}
