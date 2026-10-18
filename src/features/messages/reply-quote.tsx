"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { StorageImage } from "@/components/ui/storage-media";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useMessageImageUrls } from "./message-image-grid";
import { parseWorkflowShareBody } from "./workflow-share-format";
import { parsePresetShareBody } from "./preset-share-format";
import { parseCommunityPostShareBody } from "./community-post-share-format";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Message, PromptMedia } from "@/types";

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/**
 * What a replied-to message "is", in one short line — its text, else the shared item (prompt / request / workflow /
 * preset / community post: the plain-text share blocks are recognised, their raw block never shown), else "a photo".
 */
export function describeReplied(message: Message, t: T): string {
  if (message.deletedAt) return t("messages.deletedMessage");
  const shared = !message.sharedPromptId && !message.sharedRequestId;
  const workflow = shared ? parseWorkflowShareBody(message.body) : null;
  if (workflow) return workflow.note ?? t("messages.aWorkflow");
  const preset = shared && !workflow ? parsePresetShareBody(message.body) : null;
  if (preset) return preset.note ?? t("messages.aPreset");
  const post = shared && !workflow && !preset ? parseCommunityPostShareBody(message.body) : null;
  if (post) return post.note ?? t("messages.aCommunityPost");
  if (message.body) return message.body;
  if (message.sharedPromptId) return t("messages.aPrompt");
  if (message.sharedRequestId) return t("request.aRequest");
  if (message.attachments.length > 0) return t("messages.aPhoto");
  return "";
}

type Thumb = { kind: "photo"; url: string } | { kind: "media"; media: PromptMedia };

/** A small picture for a replied-to message when it has one: its first photo, or the first image of the prompt / request it shares. */
function useReplyThumb(message: Message | null): Thumb | null {
  const attachments = message && !message.deletedAt ? message.attachments.slice(0, 1) : [];
  const photoUrls = useMessageImageUrls(attachments);
  const { getCached: getPrompt, fetchById: fetchPrompt } = useRealPrompts();
  const { getCached: getRequest, fetchById: fetchRequest } = useRealRequests();
  const promptId = message && !message.deletedAt ? message.sharedPromptId : null;
  const requestId = message && !message.deletedAt ? message.sharedRequestId : null;
  const [fetched, setFetched] = useState<{ id: string; media: PromptMedia | null } | null>(null);

  useEffect(() => {
    const id = promptId ?? requestId;
    if (!id) return;
    if (promptId ? getPrompt(promptId) : requestId ? getRequest(requestId) : null) return;
    let cancelled = false;
    (promptId ? fetchPrompt(promptId) : fetchRequest(id))
      .then((item) => {
        if (!cancelled) setFetched({ id, media: item?.media[0] ?? null });
      })
      .catch(() => {
        if (!cancelled) setFetched({ id, media: null });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the shared item's identity matters
  }, [promptId, requestId]);

  if (attachments[0]) {
    const url = photoUrls.get(attachments[0].path);
    return url ? { kind: "photo", url } : null;
  }
  const id = promptId ?? requestId;
  if (!id) return null;
  const media = (promptId ? getPrompt(promptId)?.media[0] : getRequest(requestId as string)?.media[0]) ?? (fetched?.id === id ? fetched.media : null);
  return media ? { kind: "media", media } : null;
}

/** The small square picture of a replied-to message (nothing when it has none). */
export function ReplyThumb({ message, size }: { message: Message; size: number }) {
  const thumb = useReplyThumb(message);
  if (!thumb) return null;
  return (
    <span
      data-reply-thumb
      className="relative block shrink-0 overflow-hidden rounded-md border border-border-soft bg-background"
      style={{ width: size, height: size }}
    >
      {thumb.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
        <img src={thumb.url} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <StorageImage src={thumb.media.url} alt="" fill sizes={`${size}px`} className="object-cover" />
      )}
    </span>
  );
}

/**
 * The bar above the composer while replying (Instagram-style): who is being replied to, a one-line summary of the message,
 * and — when it has one — its picture, small, on the right.
 */
export function ComposerReplyBar({
  message,
  isMine,
  senderName,
  onCancel,
}: {
  message: Message;
  isMine: boolean;
  senderName: string;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div data-reply-bar className="mb-2 flex items-center gap-3 rounded-xl border border-border-soft bg-surface-soft px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-semibold text-text">
          {isMine ? t("messages.replyingToSelf") : t("messages.replyingToName", { name: senderName })}
        </p>
        <p className="truncate text-caption text-text-muted">{describeReplied(message, t)}</p>
      </div>
      <ReplyThumb message={message} size={40} />
      <button
        type="button"
        onClick={onCancel}
        aria-label={t("messages.cancelReplyAriaLabel")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text"
      >
        <X size={16} />
      </button>
    </div>
  );
}
