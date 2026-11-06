"use client";

import { SendIcon } from "@/components/ui/motion-icons";
import { useCompletionSeq } from "@/lib/use-motion-seq";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons/arrow-right";
import { Check } from "@/components/icons/check";
import { ChevronDown } from "@/components/icons/chevron-down";
import { CornerUpLeft } from "@/components/icons/corner-up-left";
import { Share2 } from "@/components/icons/share-2";
import { Button, buttonClassName } from "@/components/ui/button";
import { shareOrCopyLink } from "@/features/prompts/share-button";
import { CardAvatar, CardHeadline, CommentExtrasStrip, StackedAvatars, commentExtrasCount } from "./notification-parts";
import { CardReactionButton } from "./comment-reaction-controls";
import { useCardActions, type CardActions } from "./use-card-actions";
import { useNotifications } from "./notifications-provider";
import type { useNotificationCards } from "./use-notification-cards";
import { changedExcerpt, diffLines } from "@/lib/text-diff";
import { milestoneInfo, quotedPreview, reactionSummary } from "@/lib/notification-card";
import { quickActionKind } from "@/lib/notification-actions";
import { notificationCommentId } from "@/lib/notification-actions";
import { parseNotificationHref } from "@/lib/notification-mirror";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { NotificationCard } from "@/types";

type List = ReturnType<typeof useNotificationCards>;

export function detailHref(key: string): string {
  return `/notifications?n=${encodeURIComponent(key)}`;
}

/** Karttaki alıntı kutusunun metni: yorum gövdesi (toplu sorgudan), yoksa sunucu önizlemesi; boş yazı (yalnız ek) → null. */
function usePreviewText(card: NotificationCard, list: List): string | null {
  const { t } = useTranslation();
  const commentId = notificationCommentId(card);
  const comment = commentId ? list.context.comments.get(commentId) : undefined;
  if (comment) return comment.deleted ? t("nc.commentDeleted") : comment.body.trim() ? comment.body : null;
  if (card.type === "comment" || card.type === "comment_reply") return quotedPreview(card.latestMessage)?.trim() || null;
  return null;
}

function SuggestionPreview({ card, list, clamp }: { card: NotificationCard; list: List; clamp: boolean }) {
  const { t } = useTranslation();
  const suggestion = list.context.suggestions.get(parseNotificationHref(card.targetHref).hlId ?? "");
  if (!suggestion) return null;
  const lines = suggestion.proposedText && suggestion.currentText != null ? changedExcerpt(diffLines(suggestion.currentText, suggestion.proposedText), 1) : [];
  return (
    <div className="mt-2 space-y-1.5">
      {suggestion.note && <p className={cn("rounded-xl bg-surface-soft px-3 py-2 text-small text-text-secondary", clamp && "line-clamp-3")}>“{suggestion.note}”</p>}
      {lines.length > 0 ? (
        <div className="space-y-0.5 rounded-xl bg-surface-soft px-3 py-2 font-mono text-caption leading-relaxed" data-suggestion-diff="">
          {lines.slice(0, clamp ? 6 : 24).map((line, index) => (
            <div key={index} className={cn("break-words", line.op === "del" && "text-danger", line.op === "add" && "text-success", line.op === "same" && "text-text-muted")}>
              {line.op === "del" ? "− " : line.op === "add" ? "+ " : "  "}
              {line.text}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-caption text-text-muted">{t("nc.suggestionNoText")}</p>
      )}
    </div>
  );
}

function ActionButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button size="md" {...props} className={cn("h-11", className)} />;
}

/** Hızlı eylem satırı: kart türüne göre düğmeler + sağda "Ayrıntı →". Mockup'taki sıra ve etiketler. */
function QuickActionsRow({
  card,
  list,
  actions,
  onNavigate,
  onOpenReply,
  replyOpen,
}: {
  card: NotificationCard;
  list: List;
  actions: CardActions;
  onNavigate?: () => void;
  onOpenReply: () => void;
  replyOpen: boolean;
}) {
  const { t, language } = useTranslation();
  const { markRead } = useNotifications();
  const kind = quickActionKind(card);
  const local = list.local[card.key];
  const detail = detailHref(card.key);
  const follow = actions.following;
  const suggestion = actions.suggestion;
  const stats = parseNotificationHref(card.targetHref);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-quick-actions={kind}>
      {kind === "comment" && (
        <>
          {/* Gönderideki tepki sistemi: dokununca altı hareketli emojili seçici açılır (docs/history/327-*). */}
          <span className="contents" data-action="like">
            <CardReactionButton card={card} list={list} />
          </span>
          {actions.replyTarget && (
            <ActionButton variant="outline" aria-expanded={replyOpen} onClick={onOpenReply} data-action="reply">
              <CornerUpLeft size={18} strokeWidth={1.75} aria-hidden />
              <span>{t("nc.reply")}</span>
            </ActionButton>
          )}
        </>
      )}
      {kind === "members" && (
        <Link href={detail} onClick={() => { void markRead(card); onNavigate?.(); }} className={buttonClassName({ variant: "outline", className: "h-11" })} data-action="members">
          {card.type === "follow" ? t("nc.whoFollowed") : t("nc.whoLiked")}
        </Link>
      )}
      {kind === "followBack" && (
        <ActionButton variant={follow ? "secondary" : "primary"} onClick={() => void actions.toggleFollow()} disabled={actions.busy === "follow"} aria-pressed={follow} data-action="follow">
          {follow && <Check size={16} aria-hidden />}
          {follow ? t("nc.followingNow") : t("nc.followBack")}
        </ActionButton>
      )}
      {kind === "suggestion" &&
        (suggestion?.status === "pending" || !suggestion ? (
          <>
            {suggestion?.proposedText ? (
              <ActionButton onClick={() => void actions.acceptSuggestion()} disabled={actions.busy === "suggestion"} data-action="accept">
                {t("nc.accept")}
              </ActionButton>
            ) : (
              <Link href={detail} onClick={() => { void markRead(card); onNavigate?.(); }} className={buttonClassName({ variant: "primary", className: "h-11" })} data-action="accept-edit">
                {t("nc.acceptWithEdit")}
              </Link>
            )}
            <ActionButton variant="outline" onClick={() => void actions.rejectSuggestion()} disabled={actions.busy === "suggestion" || !suggestion} data-action="reject">
              {t("nc.reject")}
            </ActionButton>
          </>
        ) : (
          <span className="inline-flex h-11 items-center gap-2 px-1 text-small font-semibold text-success" data-suggestion-result={suggestion.status}>
            <Check size={16} aria-hidden />
            {t(suggestion.status === "accepted" ? "nc.suggestionAccepted" : "nc.suggestionRejected")}
          </span>
        ))}
      {kind === "messageRequest" &&
        (local?.request ? (
          <span className="inline-flex h-11 items-center gap-2 px-1 text-small font-semibold text-success" data-request-result={local.request}>
            <Check size={16} aria-hidden />
            {t(local.request === "accepted" ? "nc.requestAccepted" : "nc.requestDeclined")}
          </span>
        ) : (
          <>
            <ActionButton onClick={() => void actions.resolveMessageRequest(true)} disabled={actions.busy === "request"} data-action="request-accept">
              {t("nc.accept")}
            </ActionButton>
            <ActionButton variant="outline" onClick={() => void actions.resolveMessageRequest(false)} disabled={actions.busy === "request"} data-action="request-decline">
              {t("nc.reject")}
            </ActionButton>
          </>
        ))}
      {kind === "milestone" && (
        <>
          <Link href={card.targetHref} onClick={() => { void markRead(card); onNavigate?.(); }} className={buttonClassName({ variant: "primary", className: "h-11 !bg-secondary" })} data-action="stats">
            {t("nc.viewStats")}
          </Link>
          <ActionButton
            variant="outline"
            data-action="share"
            onClick={async () => {
              if (!stats.id) return;
              const result = await shareOrCopyLink(`/prompts/local?id=${stats.id}`, milestoneInfo(card.latestMessage)?.title ?? "Promptly");
              if (result === "copied") announceNotice(t("common.linkCopied"));
            }}
          >
            <Share2 size={16} aria-hidden />
            {t("nc.share")}
          </ActionButton>
        </>
      )}
      <span className="flex-1" />
      <Link href={detail} onClick={() => { void markRead(card); onNavigate?.(); }} className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-small font-semibold text-primary hover:bg-primary-soft" data-action="detail" aria-label={`${t("nc.detail")} · ${formatRelativeTime(card.sortAt, language)}`}>
        {t("nc.detail")}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}

/**
 * Bildirim kartı (docs/history/326-*): `popover` = zil panelinde hep açık; `page` = telefon/tablet listesinde dokununca genişleyen (tek açık kart).
 * İçeride yalnız görünüm var: tüm eylemler `useCardActions`'tan, tüm veri `useNotificationCards`'tan gelir.
 */
export function NotificationCardView({
  card,
  list,
  variant,
  open = true,
  onToggle,
  onNavigate,
}: {
  card: NotificationCard;
  list: List;
  variant: "popover" | "page";
  open?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const { t, language } = useTranslation();
  const actions = useCardActions(card, list);
  const replySeq = useCompletionSeq(actions.busy === "reply");
  const { markRead } = useNotifications();
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const preview = usePreviewText(card, list);
  const unread = card.unreadCount > 0;
  const kind = quickActionKind(card);
  const expanded = variant === "popover" || open;
  const local = list.local[card.key];
  const milestone = milestoneInfo(card.latestMessage);
  const summary = reactionSummary(card.reactionCounts, t);
  const replyName = card.latestActor?.displayName ?? "";
  const isMilestone = kind === "milestone";
  const commentId = notificationCommentId(card);
  const comment = commentId ? list.context.comments.get(commentId) : undefined;
  const extrasCount = commentExtrasCount(comment);
  const articleRef = useRef<HTMLElement>(null);

  const header = (
    <>
      <CardAvatar card={card} size={variant === "popover" ? 40 : 44} />
      <div className="min-w-0 flex-1 text-left">
        <CardHeadline card={card} className="leading-snug" />
        {!expanded && (preview || summary || extrasCount > 0) && (
          <p className="mt-1 line-clamp-2 text-small text-text-muted">
            {preview ?? summary ?? (extrasCount > 0 ? t(extrasCount === 1 ? "nc.extras.one" : "nc.extras.many", { count: extrasCount }) : null)}
            {preview && extrasCount > 0 && <span className="ml-1.5 font-semibold text-text-secondary">· {t(extrasCount === 1 ? "nc.extras.one" : "nc.extras.many", { count: extrasCount })}</span>}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-caption text-text-muted">
        {unread && (
          <>
            <span className="sr-only">{t("notifications.unreadSr")}</span>
            <span aria-hidden className="size-2 rounded-full bg-primary" data-unread-dot="" />
          </>
        )}
        <span>{formatRelativeTime(card.sortAt, language)}</span>
        {variant === "page" && <ChevronDown size={16} aria-hidden className={cn("ml-0.5 transition-transform", open && "rotate-180")} />}
      </div>
    </>
  );

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      aria-keyshortcuts="J K L R E"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.matches("input, textarea, select, [contenteditable='true']") || event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "e") void markRead(card);
        if (event.key === "l" && kind === "comment") {
          // "L": tepki seçicisini açar (gönderideki ReactionButton'un kendi açılışı).
          articleRef.current?.querySelector<HTMLButtonElement>('[data-action="like"] button')?.click();
          setReplyOpen(false);
        }
        if (event.key === "r" && kind === "comment" && actions.replyTarget) {
          setReplyOpen(true);
        }
      }}
      data-notification-card={card.key}
      data-unread={unread ? "true" : "false"}
      className={cn("rounded-2xl border p-3.5", isMilestone ? "border-secondary/30 bg-secondary/10" : unread ? "border-primary/25 bg-primary-soft/60" : "border-border-soft bg-surface")}
    >
      {variant === "page" ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {header}
        </button>
      ) : (
        <div className="flex items-start gap-3">{header}</div>
      )}

      {expanded && (
        <div className={cn(variant === "popover" ? "pl-[3.25rem]" : "pl-14")}>
          {preview != null && kind !== "suggestion" && <p className="mt-2 line-clamp-4 whitespace-pre-line break-words rounded-xl bg-surface-soft px-3 py-2 text-small text-text-secondary [overflow-wrap:anywhere]" data-card-quote="">{preview}</p>}
          {kind === "comment" && <CommentExtrasStrip comment={comment} context={list.context} className="mt-2" />}
          {kind === "suggestion" && <SuggestionPreview card={card} list={list} clamp={variant === "popover"} />}
          {card.rowCount > 1 && card.actors.length > 0 && (
            <div className="mt-2.5 flex items-center gap-3">
              <StackedAvatars card={card} />
              {summary && <span className="text-caption text-text-muted" data-reaction-summary="">{summary}</span>}
            </div>
          )}
          {isMilestone && milestone && <p className="mt-1 text-small text-text-secondary">{milestone.title}</p>}

          <QuickActionsRow
            card={card}
            list={list}
            actions={actions}
            onNavigate={onNavigate}
            replyOpen={replyOpen}
            onOpenReply={() => setReplyOpen((v) => !v)}
          />

          {replyOpen && !local?.reply && (
            <form
              className="mt-2.5 flex items-end gap-2 rounded-2xl border border-border bg-surface p-1.5 pl-3.5"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await actions.reply(draft)) {
                  setDraft("");
                  setReplyOpen(false);
                }
              }}
            >
              <label className="sr-only" htmlFor={`reply-${card.key}`}>
                {t("nc.replyLabel")}
              </label>
              <textarea
                id={`reply-${card.key}`}
                value={draft}
                rows={2}
                maxLength={2000}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t("nc.replyPlaceholder", { name: replyName })}
                className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-body text-text outline-none placeholder:text-text-muted"
              />
              <Button type="submit" size="md" className="h-11 shrink-0" disabled={actions.busy === "reply" || !draft.trim()} data-action="reply-send">
                <SendIcon size={16} seq={replySeq} />
                <span className="hidden sm:inline">{t("nc.send")}</span>
                <span className="sr-only sm:hidden">{t("nc.send")}</span>
              </Button>
            </form>
          )}

          {local?.reply && (
            <div className="mt-2.5 flex justify-end">
              <p className="max-w-[92%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-small text-primary-foreground [overflow-wrap:anywhere]" data-reply-bubble="">
                {local.reply.body}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
