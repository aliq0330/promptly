"use client";

import { useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { LikeButton } from "@/features/prompts/like-button";
import { CommentSection } from "@/features/prompts/comment-section";
import { useCommentCountDelta } from "@/features/prompts/comment-count-store";
import { contentActionClassName } from "@/features/content/action-styles";
import { formatCount } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import Link from "next/link";
import { postPageHref } from "@/lib/communities";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { summarizeContent } from "./content-summary";
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

/** Gönderinin beğeni düğmesi (kart altbilgisi ve sayfa ortak): üye/ziyaretçi → gerçek beğeni; üye olmayan/kapatılmış → açıklayıcı bildirim. */
export function PostLike({ post, mode, onToast }: { post: CommunityPost; mode: EngageMode; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  if (mode === "open") return <LikeButton id={post.id} likeCount={post.likeCount} contentType="community_post" />;
  const blockedReason = mode === "join" ? t("communities.post.engage.joinToLike") : t("communities.post.engage.closed");
  return (
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
  );
}

/** Gönderi yorum sayısı + bağlantı (başvuru sayfasının yorumlarına gider); canlı sayaç `comment-count-store`'dan. */
export function PostCommentLink({ post }: { post: CommunityPost }) {
  const { t } = useTranslation();
  const delta = useCommentCountDelta(post.id);
  const count = Math.max(0, post.commentCount + delta);
  return (
    <Link
      href={`${postPageHref(post.id)}#comments`}
      title={t("communities.post.engage.comments")}
      aria-label={t("communities.post.engage.commentsAria", { count })}
      className={contentActionClassName(false)}
    >
      <MessageCircle size={16} strokeWidth={1.75} />
      <span aria-hidden>{formatCount(count)}</span>
    </Link>
  );
}

/** Gönderinin istatistik düğmesi: normal kartlardaki `StatisticsButton` — burada sayaçlar GÖNDERİNİN kendisine aittir. */
export function PostStatisticsButton({ post, size, label }: { post: CommunityPost; size?: number; label?: string }) {
  return (
    <StatisticsButton
      target={{ contentType: "community_post", contentId: post.id, likeCount: post.likeCount, commentCount: post.commentCount }}
      size={size}
      label={label}
    />
  );
}

/**
 * Gönderinin paylaş düğmesi: normal kartlardaki `ShareModal`. Bağlantı gönderinin kendi sayfasıdır ve olduğu gibi paylaşılır
 * (topluluk içeriği özeldir → herkese açık paylaşım sayfası yok; bağlantıyı yalnız topluluğu okuyabilenler açabilir).
 */
export function PostShareButton({ post, label }: { post: CommunityPost; label?: string }) {
  const { t } = useTranslation();
  const summary = post.content ? summarizeContent(post.content) : null;
  return (
    <ShareTriggerButton
      label={label}
      target={{
        contentType: "community_post",
        postId: post.id,
        title: summary?.title ?? t("communities.post.badge.application"),
        description: post.note ?? summary?.description ?? "",
        thumbnailUrl: summary?.media[0]?.url ?? null,
        badgeLabel: summary ? t(summary.typeLabelKey) : t("communities.post.badge.application"),
        href: postPageHref(post.id),
      }}
    />
  );
}

/**
 * Başvuru SAYFASINDAKİ etkileşim: beğeni + yorumlar (varsayılan AÇIK, `#comments`) + istatistik + paylaş. Beğeni/yorum gönderinin kendi
 * kimliğine bağlıdır; orijinal içeriğin sayaçlarına dokunmaz.
 */
export function PostEngagement({
  post,
  mode,
  onToast,
  defaultOpen = true,
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

  return (
    <div data-post-engagement={post.id} className="space-y-2">
      <div className="flex items-center gap-0.5 border-t border-border-soft pt-1.5" role="group" aria-label={t("communities.post.engage.sectionAria")}>
        <PostLike post={post} mode={mode} onToast={onToast} />
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
        <PostStatisticsButton post={post} />
        <span className="ml-auto" />
        <PostShareButton post={post} />
      </div>
      {open && (
        <div id="comments" className="scroll-mt-20 rounded-lg bg-background/60 p-1 sm:p-2">
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
