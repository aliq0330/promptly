"use client";

import Link from "next/link";
import { ArrowUpRight, Loader2, Lock, Shapes, SlidersHorizontal, Sparkles, SquareTerminal, Workflow as WorkflowIcon, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StorageImage } from "@/components/ui/storage-media";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { SpaceCoverArt } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { AttachmentCard } from "@/lib/supabase/comment-attachments";
import { spaceHref } from "@/lib/spaces";
import { presetHref, promptHref, requestHref, workflowHref, cn } from "@/lib/utils";
import type { CommentAttachment, CommentAttachmentType } from "@/types";

export const ATTACHMENT_ICONS: Record<CommentAttachmentType, LucideIcon> = {
  prompt: SquareTerminal,
  request: Sparkles,
  workflow: WorkflowIcon,
  preset: SlidersHorizontal,
  space: Shapes,
};

export function attachmentHref(type: CommentAttachmentType, id: string): string {
  switch (type) {
    case "prompt": return promptHref({ id });
    case "request": return requestHref({ id });
    case "workflow": return workflowHref({ id });
    case "preset": return presetHref({ id });
    default: return spaceHref(id);
  }
}

/** Kartın hâli: yükleniyor · okuyucu göremiyor/kaldırıldı · yüklenemedi · hazır. */
export type AttachmentState = { status: "loading" } | { status: "hidden" } | { status: "error" } | { status: "ready"; card: AttachmentCard };

const SHELL = "relative flex w-full max-w-xs items-center gap-2.5 rounded-2xl bg-surface-soft p-2 text-left";

/**
 * Yorum ekinin KÜÇÜK önizleme kartı (docs/history/307-*): mesajdaki büyük paylaşım kartının (`SharedCard`) tek satırlık hâli — kapak, tür etiketi,
 * başlık, sahip. Tamamı içeriğin sayfasına bağlantıdır. Okuyucunun göremediği içerik başlık/kapak SIZDIRMADAN "gizli veya kaldırılmış" der.
 * `onRemove` verilirse (yazma çubuğundaki taslak) kart bağlantı değil, sağ üstte ✕ olan bir önizlemedir.
 */
export function CompactContentCard({
  attachment,
  state,
  onRemove,
  className,
}: {
  attachment: CommentAttachment;
  state: AttachmentState;
  onRemove?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = ATTACHMENT_ICONS[attachment.type];
  const typeLabel = t(`communities.feed.type.${attachment.type}`);

  if (state.status === "loading") {
    return (
      <div className={cn(SHELL, "h-[4.5rem]", className)} role="status" aria-label={t("commentExtras.attachmentLoading")} data-comment-attachment-state="loading">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary/60">
          <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 space-y-1.5" aria-hidden>
          <span className="block h-2.5 w-16 rounded bg-border-soft" />
          <span className="block h-3.5 w-3/4 rounded bg-border-soft" />
        </span>
      </div>
    );
  }

  if (state.status !== "ready") {
    return (
      <div className={cn(SHELL, "min-h-[4.5rem]", className)} data-comment-attachment-state={state.status}>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-border-soft text-text-muted">
          <Lock size={20} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-semibold text-text-muted">{typeLabel}</span>
          <span className="block text-small text-text-secondary">{state.status === "error" ? t("commentExtras.attachmentFailed") : t("messages.contentHidden")}</span>
        </span>
        {onRemove && <RemoveButton onRemove={onRemove} />}
      </div>
    );
  }

  const { card } = state;
  const body = (
    <>
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-soft text-primary">
        {attachment.type === "space" ? (
          <SpaceCoverArt urls={card.thumbnailUrl ? [card.thumbnailUrl] : []} className="h-full w-full" iconSize={22} />
        ) : card.thumbnailUrl ? (
          <StorageImage src={card.thumbnailUrl} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <Icon size={22} strokeWidth={1.75} aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-text-muted">
          <Icon size={12} aria-hidden />
          {typeLabel}
          {card.stepCount ? <span className="font-normal">· {t("commentExtras.stepCount", { count: card.stepCount })}</span> : null}
          {card.requestStatus && (
            <Badge variant={STATUS_VARIANTS[card.requestStatus]} className="ml-0.5">
              {t(STATUS_LABELS[card.requestStatus])}
            </Badge>
          )}
        </span>
        <span className="block truncate font-display text-body font-bold leading-tight text-text">{card.title || t("communities.feed.untitled")}</span>
        {card.ownerName && <span className="block truncate text-caption text-text-muted">{card.ownerName}</span>}
      </span>
      {!onRemove && <ArrowUpRight size={16} className="shrink-0 text-text-muted" aria-hidden />}
    </>
  );

  if (onRemove) {
    return (
      <div className={cn(SHELL, className)} data-comment-attachment-state="ready" data-comment-attachment={attachment.type}>
        {body}
        <RemoveButton onRemove={onRemove} />
      </div>
    );
  }
  return (
    <Link
      href={attachmentHref(attachment.type, attachment.id)}
      aria-label={t("commentExtras.attachmentOpen", { type: typeLabel, title: card.title })}
      data-comment-attachment={attachment.type}
      data-comment-attachment-state="ready"
      className={cn(SHELL, "transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", className)}
    >
      {body}
    </Link>
  );
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t("commentExtras.removeContent")}
      data-comment-extra-remove="attachment"
      className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-text text-background shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <X size={14} strokeWidth={2.5} aria-hidden />
    </button>
  );
}
