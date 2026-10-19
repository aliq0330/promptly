"use client";

import Link from "next/link";
import { Reply } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { ShareTriggerButton, type ShareModalTarget } from "@/features/prompts/share-modal";
import { contentActionClassName } from "@/features/content/action-styles";
import type { FeedItem } from "@/features/feed/types";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatCount, profileHref, requestHref } from "@/lib/utils";
import type { UserProfile } from "@/types";

const ICON_SIZE = 20;

/**
 * Odak Akışı's vertical action rail: the creator's avatar on top, then the SAME
 * database-backed Beğeni / Yorum / Kaydet / Paylaş buttons every card uses
 * (`LikeButton` with its optimistic toggle + rollback, `CommentCountLink` to the
 * detail page's `#comments`, `SaveButton`'s collection picker, `ShareTriggerButton`'s
 * `ShareModal`) — only re-laid out as a column: the icon gets a round frame, the count
 * sits under it. Guests get each button's own login prompt. A request has no save
 * (as everywhere); its replies link takes that slot.
 */
const RAIL_ACTION = cn(
  "h-auto min-w-0 flex-col gap-1 rounded-none bg-transparent px-0 py-0 text-caption font-semibold",
  "hover:bg-transparent active:scale-100",
  // The first child is the icon (or LikeToggle's icon wrapper): framed as the round button.
  "[&>:first-child]:box-content [&>:first-child]:rounded-full [&>:first-child]:border [&>:first-child]:border-border-soft",
  "[&>:first-child]:bg-surface/85 [&>:first-child]:p-3 [&>:first-child]:shadow-sm [&>:first-child]:backdrop-blur-md",
  "[&>:first-child]:transition-[background-color,border-color,transform] [&>:first-child]:duration-200 [&>:first-child]:ease-soft",
  "hover:[&>:first-child]:border-border hover:[&>:first-child]:bg-surface active:[&>:first-child]:scale-[0.94]",
  "max-sm:[&>:first-child]:p-2.5",
);

export function FocusFeedRail({ item, author }: { item: FeedItem; author: UserProfile }) {
  const { t } = useTranslation();
  const share: ShareModalTarget =
    item.kind === "prompt"
      ? { contentType: "prompt", prompt: item.data }
      : item.kind === "workflow"
        ? { contentType: "workflow", workflow: item.data }
        : item.kind === "preset"
          ? { contentType: "preset", preset: item.data }
          : { contentType: "request", request: item.data };

  return (
    <div className="flex w-12 flex-col items-center gap-3.5 sm:w-14 sm:gap-4">
      <Link
        href={profileHref(author)}
        aria-label={author.displayName}
        title={author.displayName}
        className="rounded-full ring-2 ring-primary ring-offset-2 ring-offset-background transition-transform duration-200 ease-soft hover:scale-105"
      >
        <Avatar src={author.avatarUrl} alt={author.displayName} size={44} />
      </Link>

      {item.kind === "prompt" ? (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="prompt" size={ICON_SIZE} className={RAIL_ACTION} />
          <CommentCountLink promptId={item.data.id} baseCount={item.data.commentCount} size={ICON_SIZE} className={RAIL_ACTION} />
          <SaveButton promptId={item.data.id} saveCount={item.data.saveCount} size={ICON_SIZE} className={RAIL_ACTION} />
        </>
      ) : item.kind === "workflow" ? (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="workflow" size={ICON_SIZE} className={RAIL_ACTION} />
          <CommentCountLink workflowId={item.data.id} baseCount={item.data.commentCount} size={ICON_SIZE} className={RAIL_ACTION} />
          <SaveButton workflowId={item.data.id} saveCount={item.data.saveCount} size={ICON_SIZE} className={RAIL_ACTION} />
        </>
      ) : item.kind === "preset" ? (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="preset" size={ICON_SIZE} className={RAIL_ACTION} />
          <CommentCountLink presetId={item.data.id} baseCount={item.data.commentCount} size={ICON_SIZE} className={RAIL_ACTION} />
          <SaveButton presetId={item.data.id} saveCount={item.data.saveCount} size={ICON_SIZE} className={RAIL_ACTION} />
        </>
      ) : (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="request" size={ICON_SIZE} className={RAIL_ACTION} />
          <CommentCountLink requestId={item.data.id} baseCount={item.data.commentCount} size={ICON_SIZE} className={RAIL_ACTION} />
          <Link
            href={`${requestHref(item.data)}#request-responses`}
            className={contentActionClassName(false, RAIL_ACTION)}
            title={t("request.replies")}
            aria-label={`${t("request.replies")} (${formatCount(item.data.responseCount)})`}
          >
            <Reply size={ICON_SIZE} strokeWidth={1.75} />
            <span aria-hidden>{formatCount(item.data.responseCount)}</span>
          </Link>
        </>
      )}

      <ShareTriggerButton target={share} size={ICON_SIZE} label={t("common.share")} className={cn(RAIL_ACTION, "[&>span]:inline")} />
    </div>
  );
}
