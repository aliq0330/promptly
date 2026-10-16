"use client";

import { useState } from "react";
import { Heart, Link2, MessageCircle } from "lucide-react";
import { LikeButton } from "@/features/prompts/like-button";
import { CommentSection } from "@/features/prompts/comment-section";
import { useCommentCountDelta } from "@/features/prompts/comment-count-store";
import { contentActionClassName } from "@/features/content/action-styles";
import { formatCount, absoluteUrl } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { postHref } from "@/lib/communities";
import type { CommunityPost } from "@/lib/supabase/communities";

/**
 * Bir topluluk gönderisinin KENDİ etkileşimi: beğeni ve yorumlar gönderinin kimliğine bağlıdır (`prompt_likes.community_post_id`,
 * `prompt_comments.community_post_id`) — işaret edilen içeriğin beğeni/yorumlarına karışmaz ve onun sayaçlarını değiştirmez.
 * Mevcut `LikeButton` / `CommentSection` altyapısı yeniden kullanılır (ikinci bir sistem yok).
 *
 * Yazma yalnız topluluk üyesine açıktır (sunucu tetikleyicisi doğrular); burada yalnızca doğru durum gösterilir:
 *   open   → üye ya da ziyaretçi (ziyaretçide düğme giriş diyaloğunu açar)
 *   join   → oturumlu ama üye olmayan: okur, yazamaz
 *   closed → kapatılmış (salt-okunur) topluluk
 */
export type EngageMode = "open" | "join" | "closed";

export function PostEngagement({
  post,
  mode,
  onToast,
  defaultOpen = false,
  highlightCommentId = null,
}: {
  post: CommunityPost;
  mode: EngageMode;
  onToast: (message: string) => void;
  defaultOpen?: boolean;
  highlightCommentId?: string | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const delta = useCommentCountDelta(post.id);
  const commentCount = Math.max(0, post.commentCount + delta);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl(postHref(post.communityId, post.id)));
      onToast(t("communities.post.engage.linkCopied"));
    } catch {
      onToast(t("prompt.copyFailed"));
    }
  }

  const blockedReason = mode === "join" ? t("communities.post.engage.joinToLike") : t("communities.post.engage.closed");

  return (
    <div data-post-engagement={post.id} className="space-y-2">
      <div className="flex items-center gap-0.5 border-t border-border-soft pt-1.5" role="group" aria-label={t("communities.post.engage.sectionAria")}>
        {mode === "open" ? (
          <LikeButton id={post.id} likeCount={post.likeCount} contentType="community_post" />
        ) : (
          <button
            type="button"
            onClick={() => onToast(blockedReason)}
            title={blockedReason}
            aria-label={t("communities.post.engage.likesAria", { count: post.likeCount })}
            className={contentActionClassName(false, "opacity-70")}
          >
            <Heart size={16} strokeWidth={1.75} />
            <span aria-hidden>{formatCount(post.likeCount)}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          title={t("communities.post.engage.comments")}
          aria-label={t("communities.post.engage.commentsAria", { count: commentCount })}
          className={contentActionClassName(open)}
        >
          <MessageCircle size={16} strokeWidth={1.75} />
          <span aria-hidden>{formatCount(commentCount)}</span>
        </button>
        <span className="ml-auto" />
        <button type="button" onClick={() => void copyLink()} title={t("communities.post.engage.copyLink")} aria-label={t("communities.post.engage.copyLink")} className={contentActionClassName()}>
          <Link2 size={16} strokeWidth={1.75} />
        </button>
      </div>
      {open && (
        <div id={`post-comments-${post.id}`} className="rounded-lg bg-background/60 p-1 sm:p-2">
          <CommentSection
            target={{ communityPostId: post.id }}
            disabledReason={mode === "open" ? undefined : mode === "join" ? t("communities.post.engage.joinToComment") : t("communities.post.engage.closed")}
            highlightCommentId={highlightCommentId}
          />
        </div>
      )}
    </div>
  );
}
