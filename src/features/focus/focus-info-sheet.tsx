"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, PenLine, SquareTerminal } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import type { PostFeedItem } from "@/features/feed/types";
import { focusFeedExtraImages } from "@/lib/focus-feed";
import { useTranslation } from "@/lib/i18n/language-provider";
import { FocusAddToSpace, modelOf, PromptDialog, RequestStatus, StructureBlock } from "./focus-feed-slide";
import { FocusSheetFrame } from "./focus-sheet-frame";

/**
 * "Bilgi" (docs/history/239-*): everything a slide keeps off its face — the full description, the post's structure
 * (workflow steps, preset parameters, request brief, prompt text), "Promptu incele", "Ayrıntıları aç" and "Space'e ekle".
 * It opens the way the comments do: from the bottom on a phone while the post shrinks above it, a side panel from `md`.
 */
export function FocusInfoSheet({ item, onClose }: { item: PostFeedItem; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const { user } = useAuth();
  const [promptOpen, setPromptOpen] = useState(false);
  const model = modelOf(item, t);
  const Icon = model.icon;
  const prompt = item.kind === "prompt" ? item.data : null;
  const extra = focusFeedExtraImages(item);
  // The slide's face carries no big button any more (docs/history/240-*): "Yanıtla" for an open request lives here, next to
  // "Ayrıntıları aç"; a prompt's "Kopyala" is in its prompt block below and in "Promptu incele".
  const canReply = item.kind === "request" && item.data.status === "open" && user?.id !== item.data.author.id;
  const chip =
    "inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-soft px-3.5 text-label font-semibold text-text transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  // Esc closes the sheet, unless a dialog opened from inside it ("Promptu incele", "Space'e ekle") is on top.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <FocusSheetFrame kind="info" titleId={titleId} title={t("focusFeed.info")} closeLabel={t("focusFeed.infoClose")} onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t border-border-soft px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-caption font-bold uppercase tracking-[0.1em] text-text-secondary">
            <Icon size={13} strokeWidth={2.25} aria-hidden className="shrink-0" />
            <span className="truncate">
              {model.typeLabel}
              {model.tool && <> · {model.tool}</>}
            </span>
          </p>
          {item.kind === "request" && <RequestStatus request={item.data} />}
          {extra > 0 && <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-semibold text-text-secondary">{t("focusFeed.moreImages", { count: extra })}</span>}
        </div>
        <h3 className="break-words font-display text-h3 font-bold leading-tight text-text">{model.title}</h3>
        {model.description && <p className="whitespace-pre-line break-words text-body leading-relaxed text-text-secondary">{model.description}</p>}
        <StructureBlock item={item} near onImage={false} />
        <div className="flex flex-wrap items-center gap-2">
          {canReply && item.kind === "request" && (
            <Link
              href={`/create?answerRequest=${item.data.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-label font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <PenLine size={15} aria-hidden />
              {t("request.reply")}
            </Link>
          )}
          {prompt && prompt.promptText.trim() && (
            <button type="button" onClick={() => setPromptOpen(true)} aria-haspopup="dialog" className={chip}>
              <SquareTerminal size={15} aria-hidden />
              {t("focusFeed.viewPrompt")}
            </button>
          )}
          <Link href={model.href} className={chip}>
            {t("focusFeed.openDetail")}
            <ArrowUpRight size={15} aria-hidden />
          </Link>
          <FocusAddToSpace item={item} className={chip} />
        </div>
      </div>
      {promptOpen && prompt && <PromptDialog prompt={prompt} onClose={() => setPromptOpen(false)} />}
    </FocusSheetFrame>
  );
}
