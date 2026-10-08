"use client";

import { useState } from "react";
import { AlertTriangle, RotateCw, X } from "lucide-react";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { MessageAttachment } from "@/types";
import { MessageImageGrid, SendStateOverlay } from "./message-image-grid";
import type { ComposerImage } from "./use-composer-images";

/**
 * A photo message that has left the composer but is not (yet) a real row: it
 * is uploading, or it failed. Its `id` is the id the real message will be
 * inserted with, so the moment the INSERT (or its Realtime echo) lands in
 * the thread this bubble disappears and the real one takes its place —
 * never both.
 */
export interface PendingSend {
  id: string;
  /** The finished `body` that will be stored (a share line may already be composed into it). */
  body: string | undefined;
  sharedPromptId?: string;
  sharedRequestId?: string;
  replyToMessageId?: string;
  images: ComposerImage[];
  /** Index-aligned with `images`; filled as each upload finishes so a retry never re-uploads a photo that already made it. */
  uploaded: (MessageAttachment | null)[];
  status: "sending" | "failed";
  error: string | null;
}

export function PendingMessageBubble({
  pending,
  onRetry,
  onDiscard,
}: {
  pending: PendingSend;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const displayBody = pending.body;

  return (
    <div data-pending-message={pending.id} data-status={pending.status} className="flex flex-col items-end">
      <div className="flex max-w-[75%] flex-col items-end gap-1.5">
        <MessageImageGrid
          images={pending.images.map((image) => ({ key: image.key, url: image.previewUrl, width: image.width, height: image.height }))}
          onOpen={setLightbox}
          overlay={<SendStateOverlay status={pending.status} onRetry={() => onRetry(pending.id)} />}
        />
        {displayBody && (
          <div
            className={cn(
              "w-fit self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm leading-relaxed text-primary-foreground shadow-xs",
              pending.status === "sending" && "opacity-70",
            )}
          >
            <p className="break-words">{displayBody}</p>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px] text-text-muted">
        {pending.status === "sending" ? (
          <span>{t("messages.sendingEllipsis")}</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-danger">
              <AlertTriangle size={12} aria-hidden />
              {pending.error ?? t("messages.sendFailedShort")}
            </span>
            <button
              type="button"
              onClick={() => onRetry(pending.id)}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <RotateCw size={11} aria-hidden />
              {t("common.retry")}
            </button>
            <button
              type="button"
              onClick={() => onDiscard(pending.id)}
              aria-label={t("messages.discardUnsent")}
              className="inline-flex items-center gap-1 hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X size={11} aria-hidden />
              {t("common.delete")}
            </button>
          </>
        )}
      </div>
      {lightbox !== null && (
        <ImageLightbox
          images={pending.images.map((image) => ({ url: image.previewUrl }))}
          initialIndex={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
