"use client";

import { useCallback } from "react";
import { InlineReactionPicker } from "@/features/reactions/inline-reaction-picker";
import { ReactionButton } from "@/features/reactions/reaction-button";
import { ReactionSummary } from "@/features/reactions/reaction-summary";
import { useLikeState, type ReactResult } from "@/features/prompts/use-like-state";
import { notificationCommentId } from "@/lib/notification-actions";
import { REACTION_LABEL, type ReactionKey } from "@/lib/reactions";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useNotifications } from "./notifications-provider";
import type { useNotificationCards } from "./use-notification-cards";
import type { NotificationCard } from "@/types";

type List = ReturnType<typeof useNotificationCards>;

/**
 * Yoruma tepki, bildirim yüzeylerinde (docs/history/327-*): gönderideki tepki sistemiyle AYNI bileşenler. Kartta "Hızlı beğen" düğmesi dokununca altı hareketli
 * emojili seçiciyi açar; Ayrıntı'da seçici AÇIK gelir ve altında tepki özeti ("Sen, Zeynep ve 3 kişi", dokununca "Tepkiler" listesi) durur. Seçilince kart okundu
 * sayılır ve "Geri al" şeridi tepkiyi önceki hâline döndürür (`useLikeState.react` — mağaza ve sayılar tutarlı kalır).
 */

function useReactionUndo(card: NotificationCard, commentId: string, likeCount: number) {
  const { t } = useTranslation();
  const { pushUndo, markRead } = useNotifications();
  const { react } = useLikeState(commentId, likeCount, "comment");
  return useCallback(
    (_result: ReactResult, prev: ReactionKey | null, next: ReactionKey | null) => {
      const text = next === null ? t("nc.reactionRemoved") : prev ? t("nc.reactionChanged", { label: t(REACTION_LABEL[next]) }) : t("nc.reacted", { label: t(REACTION_LABEL[next]) });
      pushUndo(text, async () => {
        await react(prev);
      });
      void markRead(card);
    },
    [t, pushUndo, markRead, react, card],
  );
}

/** Kartın "Hızlı beğen" düğmesi: dokununca gönderidekiyle aynı emoji seçicisi açılır. */
export function CardReactionButton({ card, list }: { card: NotificationCard; list: List }) {
  const { t } = useTranslation();
  const commentId = notificationCommentId(card);
  if (!commentId) return null;
  const comment = list.context.comments.get(commentId);
  // Tepki sayısı mağazaya İLK görünümde tohumlanır: yorum bilgisi gelmeden çizilirse sayı 0'da kalırdı. Gelene kadar aynı boyda iskelet; silinmiş yorumda tepki yok.
  if (!comment) return <span aria-hidden className="skeleton-shimmer inline-block h-11 w-32 rounded-full" data-reaction-loading="" />;
  if (comment.deleted) return null;
  return <CardReactionButtonInner card={card} commentId={commentId} likeCount={comment.likeCount} label={t("nc.quickLike")} />;
}

function CardReactionButtonInner({ card, commentId, likeCount, label }: { card: NotificationCard; commentId: string; likeCount: number; label: string }) {
  const onResult = useReactionUndo(card, commentId, likeCount);
  return <ReactionButton tone="action" contentType="comment" id={commentId} likeCount={likeCount} size={18} labelText={label} onResult={onResult} />;
}

/** Ayrıntı'nın tepki bölümü: açık emoji seçici + ipucu + tepki özeti. */
export function DetailReactionSection({ card, list, showHint }: { card: NotificationCard; list: List; showHint: boolean }) {
  const commentId = notificationCommentId(card);
  if (!commentId) return null;
  const comment = list.context.comments.get(commentId);
  if (!comment) return <div aria-hidden className="skeleton-shimmer h-[7.5rem] rounded-[28px]" data-reaction-loading="" />;
  if (comment.deleted) return null;
  return <DetailReactionSectionInner card={card} commentId={commentId} likeCount={comment.likeCount} showHint={showHint} />;
}

function DetailReactionSectionInner({ card, commentId, likeCount, showHint }: { card: NotificationCard; commentId: string; likeCount: number; showHint: boolean }) {
  const { t } = useTranslation();
  const onResult = useReactionUndo(card, commentId, likeCount);
  const { reaction } = useLikeState(commentId, likeCount, "comment");
  return (
    <div data-reaction-section="">
      <p className="mb-2 text-label font-bold text-text-secondary">{t("nc.quickReaction")}</p>
      <InlineReactionPicker id={commentId} likeCount={likeCount} contentType="comment" onResult={onResult} />
      {showHint && (
        <p className="mt-2 text-caption text-text-muted" data-reaction-hint="">
          {reaction ? t("nc.reactionHintOn", { label: t(REACTION_LABEL[reaction]) }) : t("nc.reactionHintOff")}
        </p>
      )}
      <ReactionSummary contentType="comment" id={commentId} likeCount={likeCount} overLayers className="mt-1" />
    </div>
  );
}
