"use client";

import { useContext } from "react";
import Link from "next/link";
import { MessageCircle } from "@/components/icons/message-circle";
import { Reply } from "@/components/icons/reply";
import { Volume2 } from "@/components/icons/volume-2";
import { VolumeX } from "@/components/icons/volume-x";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { useCommentCountDelta } from "@/features/prompts/comment-count-store";
import { ShareTriggerButton, type ShareModalTarget } from "@/features/prompts/share-modal";
import { contentActionClassName } from "@/features/content/action-styles";
import type { PostFeedItem } from "@/features/feed/types";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatCount, requestHref } from "@/lib/utils";
import { FocusPanelContext, FocusPlaybackContext } from "./focus-context";

/**
 * Odak's action icons (docs/history/436-*): the SAME database-backed Beğeni / Yorum / Kaydet / Paylaş buttons every card uses
 * (`LikeButton`'s reaction picker with its optimistic toggle + rollback, `SaveButton`'s collection picker, `ShareTriggerButton`'s
 * `ShareModal`), laid out three ways. Guests get each button's own login prompt. A request has no save (as everywhere): its replies link takes that slot.
 *   - `reel`: the bare column on a phone post's right edge — icon over count, light ink on the picture.
 *   - `panel`: the same four in one quiet row at the head of the desktop side panel (icon + count beside it).
 *   - `bar`: only Beğeni + Kaydet as round outlined buttons, beside the card's big action (count for screen readers only).
 */
export type FocusRailLayout = "reel" | "panel" | "bar";

const ACTION: Record<FocusRailLayout, string> = {
  reel: "h-auto min-w-12 flex-col gap-0.5 rounded-lg bg-transparent px-1 py-0.5 text-caption font-semibold text-on-art hover:bg-transparent hover:text-on-art [&>:first-child]:box-content [&>:first-child]:p-1.5",
  panel: "h-11 min-w-11 flex-row gap-2 rounded-full bg-transparent px-3 text-label font-semibold text-text hover:bg-surface-soft",
  // Only the COUNT is for screen readers: the reaction emoji is itself a `<span>` (first child) and must stay visible.
  bar: "h-12 w-12 min-w-12 shrink-0 rounded-full border border-border bg-transparent px-0 text-text hover:bg-surface-soft [&>span:not(:first-child)]:sr-only",
};

const ICON: Record<FocusRailLayout, number> = { reel: 24, panel: 20, bar: 20 };

/** The comment button: same look and live count as `CommentCountLink`, but it opens Odak's card on the Yorumlar tab. */
export function FocusCommentButton({ item, size, className }: { item: PostFeedItem; size: number; className?: string }) {
  const { t } = useTranslation();
  const { openSheet } = useContext(FocusPanelContext);
  const delta = useCommentCountDelta(item.data.id);
  const count = Math.max(0, item.data.commentCount + delta);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openSheet(item, "comments");
      }}
      aria-haspopup="dialog"
      aria-label={t("focusComments.open", { count: formatCount(count) })}
      title={t("comments.title")}
      className={contentActionClassName(false, className)}
    >
      <MessageCircle size={size} />
      <span aria-hidden>{formatCount(count)}</span>
    </button>
  );
}

/** The sound switch at the top of a playing post's rail: Odak has ONE switch (the ⋮ menu has it too); this is its quick twin. */
function SoundButton() {
  const { t } = useTranslation();
  const { muted, setMuted } = useContext(FocusPlaybackContext);
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-pressed={!muted}
      aria-label={muted ? t("focusFeed.soundOn") : t("focusFeed.soundOff")}
      title={muted ? t("focusFeed.soundOn") : t("focusFeed.soundOff")}
      data-focus-sound=""
      className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-art-chip text-on-art transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {muted ? <VolumeX size={24} aria-hidden /> : <Volume2 size={24} aria-hidden />}
    </button>
  );
}

export function shareTargetOf(item: PostFeedItem): ShareModalTarget {
  switch (item.kind) {
    case "prompt":
      return { contentType: "prompt", prompt: item.data };
    case "workflow":
      return { contentType: "workflow", workflow: item.data };
    case "preset":
      return { contentType: "preset", preset: item.data };
    case "skill":
      return { contentType: "skill", skill: item.data };
    case "request":
      return { contentType: "request", request: item.data };
  }
}

export function FocusFeedRail({ item, layout, playable = false }: { item: PostFeedItem; layout: FocusRailLayout; playable?: boolean }) {
  const { t } = useTranslation();
  const action = ACTION[layout];
  const size = ICON[layout];
  const bar = layout === "bar";
  return (
    <div
      className={cn(
        layout === "reel" ? "flex flex-col items-center gap-3" : layout === "panel" ? "flex items-center gap-1" : "flex items-center gap-2",
      )}
    >
      {layout === "reel" && playable && <SoundButton />}
      <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType={item.kind} size={size} className={action} />
      {!bar && <FocusCommentButton item={item} size={size} className={action} />}
      {item.kind === "prompt" ? (
        <SaveButton promptId={item.data.id} saveCount={item.data.saveCount} size={size} className={action} />
      ) : item.kind === "workflow" ? (
        <SaveButton workflowId={item.data.id} saveCount={item.data.saveCount} size={size} className={action} />
      ) : item.kind === "preset" ? (
        <SaveButton presetId={item.data.id} saveCount={item.data.saveCount} size={size} className={action} />
      ) : item.kind === "skill" ? (
        <SaveButton skillId={item.data.id} saveCount={item.data.saveCount} size={size} className={action} />
      ) : !bar ? (
        <Link
          href={`${requestHref(item.data)}#request-responses`}
          className={contentActionClassName(false, action)}
          title={t("request.replies")}
          aria-label={`${t("request.replies")} (${formatCount(item.data.responseCount)})`}
        >
          <Reply size={size} />
          <span aria-hidden>{formatCount(item.data.responseCount)}</span>
        </Link>
      ) : null}
      {!bar && <ShareTriggerButton target={shareTargetOf(item)} size={size} className={action} />}
    </div>
  );
}
