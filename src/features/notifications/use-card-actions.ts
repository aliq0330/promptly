"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useNotifications } from "./notifications-provider";
import type { useNotificationCards } from "./use-notification-cards";
import type { CommentExtrasController } from "@/features/prompts/comment-extras";
import { deleteComment } from "@/lib/supabase/comments";
import { followUser, unfollowUser } from "@/lib/supabase/follows";
import { acceptEditSuggestion, rejectEditSuggestion } from "@/lib/supabase/prompt-edit-suggestions";
import { acceptMessageRequest, declineMessageRequest } from "@/lib/supabase/messages";
import { postNotificationReply } from "@/lib/supabase/notification-reply";
import { commentReplyTarget, messageRequestConversationId, suggestionId } from "@/lib/notification-actions";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { NotificationCard } from "@/types";

type List = ReturnType<typeof useNotificationCards>;

/**
 * Kart eylemlerinin TEK yeri (docs/history/326-*): zil paneli, mobil genişleyen kart ve Ayrıntı görünümü aynı fonksiyonları kullanır. Yoruma TEPKİ burada
 * değil (docs/history/327-*): gönderideki tepki sistemidir (`ReactionButton`/`InlineReactionPicker` + `useLikeState`, `comment-reaction-controls.tsx`).
 * Her eylem iyimser çalışır (durum anında değişir), sunucu reddederse geri alınır ve bir uyarı çıkar; "Geri al" şeridi mümkün olan her yerde
 * eylemi gerçekten tersine çevirir. Eylem sonrası kart okundu sayılır. Düzenleme önerisi KABULÜ geri alınamaz (prompt metni değişir, sürüm kaydı oluşur);
 * reddetme için de sunucuda "yeniden aç" yoktur — ikisinde şerit yerine tek satırlık onay gösterilir.
 */
export function useCardActions(card: NotificationCard, list: List) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { pushUndo, markRead } = useNotifications();
  const [busy, setBusy] = useState<string | null>(null);
  const { context, setFollowing, patchSuggestion, setLocal } = list;

  const fail = useCallback(
    (err: unknown) => {
      console.error("notification action", err);
      announceNotice(t("nc.actionFailed"));
    },
    [t],
  );

  const replyTarget = commentReplyTarget(card);
  const reply = useCallback(
    async (body: string, extras?: CommentExtrasController): Promise<boolean> => {
      const text = body.trim();
      const withExtras = Boolean(extras?.hasExtras);
      if (!user || !replyTarget || (!text && !withExtras)) return false;
      setBusy("reply");
      let uploaded: string | null = null;
      try {
        const prepared = extras && withExtras ? await extras.prepare(user.id) : null;
        uploaded = prepared?.uploadedPath ?? null;
        const created = await postNotificationReply(replyTarget, user.id, text, prepared?.extras);
        extras?.clear();
        setLocal(card.key, { reply: { id: created.id, body: text || t("nc.replyMedia") } });
        pushUndo(t("nc.replySent"), async () => {
          await deleteComment(created.id);
          setLocal(card.key, { reply: null });
        });
        void markRead(card);
        return true;
      } catch (err) {
        if (extras && uploaded) await extras.discardUpload(uploaded);
        fail(err);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [user, replyTarget, card, setLocal, pushUndo, markRead, t, fail],
  );

  const actorId = card.latestActor?.id ?? null;
  const following = actorId ? context.following.has(actorId) : false;
  const toggleFollow = useCallback(async () => {
    if (!user || !actorId || busy) return;
    const next = !following;
    setBusy("follow");
    setFollowing(actorId, next);
    try {
      if (next) await followUser(user.id, actorId);
      else await unfollowUser(user.id, actorId);
      const name = card.latestActor?.displayName ?? "";
      if (next) {
        pushUndo(t("nc.followingToast", { name }), async () => {
          await unfollowUser(user.id, actorId);
          setFollowing(actorId, false);
        });
        void markRead(card);
      }
    } catch (err) {
      setFollowing(actorId, following);
      fail(err);
    } finally {
      setBusy(null);
    }
  }, [user, actorId, busy, following, setFollowing, card, pushUndo, markRead, t, fail]);

  const sid = suggestionId(card);
  const suggestion = sid ? (context.suggestions.get(sid) ?? null) : null;
  const resolveSuggestion = useCallback(
    async (accept: boolean) => {
      if (!sid || !suggestion || busy) return;
      setBusy("suggestion");
      try {
        if (accept) {
          if (!suggestion.proposedText) return;
          await acceptEditSuggestion(sid, suggestion.proposedText);
        } else {
          await rejectEditSuggestion(sid);
        }
        patchSuggestion(sid, accept ? "accepted" : "rejected");
        announceNotice(t(accept ? "nc.suggestionAccepted" : "nc.suggestionRejected"));
        void markRead(card);
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
      }
    },
    [sid, suggestion, busy, patchSuggestion, markRead, card, t, fail],
  );

  const conversationId = messageRequestConversationId(card);
  const resolveMessageRequest = useCallback(
    async (accept: boolean) => {
      if (!user || !conversationId || busy) return;
      setBusy("request");
      try {
        if (accept) await acceptMessageRequest(conversationId, user.id);
        else await declineMessageRequest(conversationId, user.id);
        setLocal(card.key, { request: accept ? "accepted" : "declined" });
        void markRead(card);
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
      }
    },
    [user, conversationId, busy, card, setLocal, markRead, fail],
  );

  return {
    busy,
    replyTarget,
    reply,
    following,
    toggleFollow,
    suggestion,
    acceptSuggestion: () => resolveSuggestion(true),
    rejectSuggestion: () => resolveSuggestion(false),
    resolveMessageRequest,
  };
}

export type CardActions = ReturnType<typeof useCardActions>;
