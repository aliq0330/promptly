"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn, profileHref } from "@/lib/utils";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import type { FeedItem } from "@/features/feed/types";
import type { UserProfile } from "@/types";

/** Shared building blocks of every Focus card — kept small and presentational. */

/** A media aspect ratio kept inside a sane band so one very tall/wide upload can't dominate a column. */
export function clampAspectRatio(width: number, height: number): number {
  if (!width || !height) return 1;
  return Math.min(1.4, Math.max(0.8, width / height));
}

/** Avatar + name linking to the creator's profile. `onImage` = white-on-scrim for use over a photo. */
export function FocusCreator({ user, onImage = false }: { user: UserProfile; onImage?: boolean }) {
  return (
    <Link
      href={profileHref(user)}
      className={cn(
        "relative z-10 inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2.5 outline-none focus-visible:ring-2 focus-visible:ring-primary",
        onImage ? "bg-black/50 pl-0.5 text-white hover:bg-black/65" : "-ml-0.5 pl-0.5 text-text-secondary hover:text-primary",
      )}
    >
      <Avatar src={user.avatarUrl} alt="" size={24} />
      <span className="truncate text-caption font-medium">{user.displayName}</span>
    </Link>
  );
}

/** The small "what is this" tag: ICON · TÜR. */
export function FocusTypeBadge({ icon: Icon, label, onImage = false, className }: { icon: LucideIcon; label: string; onImage?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-caption font-semibold uppercase tracking-[0.08em]",
        onImage ? "text-white/90" : "text-text-muted",
        className,
      )}
    >
      <Icon size={12} strokeWidth={2.25} aria-hidden className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** The card title — a real link (the full-card link behind it is mouse-only). */
export function FocusTitle({ href, title, onImage = false, className }: { href: string; title: string; onImage?: boolean; className?: string }) {
  return (
    <h3 className={cn("font-semibold leading-snug", onImage ? "text-label text-white sm:text-small" : "text-small text-text sm:text-body", className)}>
      <Link
        href={href}
        className="relative z-10 line-clamp-2 rounded-xs outline-none decoration-primary/40 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-primary"
      >
        {title}
      </Link>
    </h3>
  );
}

/**
 * Beğeni · Yorum · Kaydet — the same real, database-backed buttons the cards
 * use (nothing re-implemented). A request has no save. Tightened so the three
 * fit a two-column phone layout.
 */
export function FocusActions({ item }: { item: FeedItem }) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-0.5 border-t border-border-soft px-1 py-1 [&_a]:gap-1 [&_a]:px-1.5 [&_button]:gap-1 [&_button]:px-1.5">
      {item.kind === "prompt" ? (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="prompt" />
          <CommentCountLink promptId={item.data.id} baseCount={item.data.commentCount} />
          <SaveButton promptId={item.data.id} saveCount={item.data.saveCount} />
        </>
      ) : item.kind === "generator" ? (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="generator" />
          <CommentCountLink generatorSlug={item.data.slug} generatorId={item.data.id} baseCount={item.data.commentCount} />
          <SaveButton generatorId={item.data.id} saveCount={item.data.saveCount} />
        </>
      ) : item.kind === "workflow" ? (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="workflow" />
          <CommentCountLink workflowId={item.data.id} baseCount={item.data.commentCount} />
          <SaveButton workflowId={item.data.id} saveCount={item.data.saveCount} />
        </>
      ) : item.kind === "preset" ? (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="preset" />
          <CommentCountLink presetId={item.data.id} baseCount={item.data.commentCount} />
          <SaveButton presetId={item.data.id} saveCount={item.data.saveCount} />
        </>
      ) : (
        <>
          <LikeButton id={item.data.id} likeCount={item.data.likeCount} contentType="request" />
          <CommentCountLink requestId={item.data.id} baseCount={item.data.commentCount} />
        </>
      )}
    </div>
  );
}
