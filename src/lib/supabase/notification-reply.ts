import {
  postCommentOnCommunityPost,
  postCommentOnPreset,
  postCommentOnPrompt,
  postCommentOnQuote,
  postCommentOnRequest,
  postCommentOnResult,
  postCommentOnSpace,
  postCommentOnWorkflow,
} from "./comments";
import type { CommentExtras } from "./comments";
import type { CommentReplyTarget } from "@/lib/notification-actions";
import type { PromptComment } from "@/types";

/**
 * Bildirim kartından yorum yanıtı (docs/history/326-*): hedef türü adresten gelir (`commentReplyTarget`), yazma mevcut `postCommentOn*` ailesidir —
 * yani sunucu tetikleyicileri (hız sınırı, askı, engel, topluluk üyeliği, hedefin halka açıklığı) aynen çalışır. Tüm yorum ağacını yükleyen
 * `useCommentThread` bilerek kullanılmaz: kart yalnız tek bir yanıt yazar.
 */
export async function postNotificationReply(target: CommentReplyTarget, authorId: string, body: string, extras?: CommentExtras): Promise<PromptComment> {
  const { contentId, parentCommentId } = target;
  switch (target.kind) {
    case "prompt":
      return postCommentOnPrompt(contentId, authorId, body, parentCommentId, extras);
    case "request":
      return postCommentOnRequest(contentId, authorId, body, parentCommentId, extras);
    case "result":
      return postCommentOnResult(contentId, authorId, body, parentCommentId, extras);
    case "workflow":
      return postCommentOnWorkflow(contentId, authorId, body, parentCommentId, extras);
    case "preset":
      return postCommentOnPreset(contentId, authorId, body, parentCommentId, extras);
    case "quote":
      return postCommentOnQuote(contentId, authorId, body, parentCommentId, extras);
    case "community_post":
      return postCommentOnCommunityPost(contentId, authorId, body, parentCommentId, extras);
    case "space":
      return postCommentOnSpace(contentId, authorId, body, parentCommentId, { ...extras });
    default:
      throw new Error("reply_unsupported");
  }
}
