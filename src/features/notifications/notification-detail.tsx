"use client";

import { SendIcon } from "@/components/ui/motion-icons";
import { useCompletionSeq } from "@/lib/use-motion-seq";
import { TrashIcon } from "@/components/ui/motion-icons";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons/arrow-left";
import { ArrowRight } from "@/components/icons/arrow-right";
import { Check } from "@/components/icons/check";
import { MoreVertical } from "@/components/icons/more-vertical";
import { Undo2 } from "@/components/icons/undo-2";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { StorageImage } from "@/components/ui/storage-media";
import { LoadMore } from "@/features/feed/load-more";
import { ReactionIcon } from "@/features/reactions/reaction-icon";
import { DetailReactionSection } from "./comment-reaction-controls";
import { CommentExtrasPreview, CommentExtrasToolbar, useCommentExtras } from "@/features/prompts/comment-extras";
import { shareOrCopyLink } from "@/features/prompts/share-button";
import { useAuth } from "@/features/auth/auth-provider";
import { DetailFooterActions } from "./notification-menus";
import { CardAvatar, CardHeadline, CommentExtrasStrip } from "./notification-parts";
import { attachmentHref } from "@/features/content/compact-content-card";
import { useCardActions } from "./use-card-actions";
import { useNotifications } from "./notifications-provider";
import type { useNotificationCards } from "./use-notification-cards";
import { fetchNotificationGroupMembers } from "@/lib/supabase/notifications";
import { linkedCardFor } from "@/lib/supabase/notification-context";
import { cardKindKey, milestoneInfo, reactionSummary } from "@/lib/notification-card";
import { linkedContent, notificationCommentId, quickActionKind } from "@/lib/notification-actions";
import { parseNotificationHref } from "@/lib/notification-mirror";
import { changedExcerpt, diffLines } from "@/lib/text-diff";
import { announceNotice } from "@/lib/app-notice";
import { REACTION_LABEL } from "@/lib/reactions";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { NotificationCard, NotificationGroupMember } from "@/types";

type List = ReturnType<typeof useNotificationCards>;

/** Beğeni/takip kartının üyeleri: kim, hangi tepkiyle, ne zaman (sayfalı, kendiliğinden yüklenir). */
function GroupMembers({ card }: { card: NotificationCard }) {
  const { t, language } = useTranslation();
  const [members, setMembers] = useState<NotificationGroupMember[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async (cursor: { at: string; id: string } | null) => {
    setLoading(true);
    setFailed(false);
    try {
      const page = await fetchNotificationGroupMembers(card.key, cursor, 30);
      setMembers((prev) => (cursor ? [...prev, ...page] : page));
      setHasMore(page.length === 30);
    } catch (err) {
      console.error("group members", err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kart değişince üye listesi baştan okunur
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.key]);

  const last = members[members.length - 1];
  return (
    <div className="overflow-hidden rounded-lg border border-border-soft" data-group-members="">
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-3 border-b border-border-soft px-3.5 py-2.5 last:border-b-0">
          <Avatar src={member.actor?.avatarUrl} alt={member.actor?.displayName ?? ""} size={40} />
          <div className="min-w-0 flex-1">
            {member.actor ? (
              <Link href={`/profile/real?username=${encodeURIComponent(member.actor.username)}`} className="truncate text-small font-semibold text-text hover:underline">
                {member.actor.displayName}
              </Link>
            ) : (
              <span className="text-small text-text-muted">—</span>
            )}
            <p className="text-caption text-text-muted">{formatRelativeTime(member.createdAt, language)}</p>
          </div>
          {member.reaction && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-soft px-3 text-caption font-semibold text-text-secondary" data-member-reaction={member.reaction}>
              <ReactionIcon reaction={member.reaction} size={16} />
              {t(REACTION_LABEL[member.reaction])}
            </span>
          )}
        </div>
      ))}
      {members.length === 0 && !loading && <p className="px-3.5 py-4 text-small text-text-muted">{failed ? t("nc.membersFailed") : t("nc.membersEmpty")}</p>}
      <LoadMore failed={failed} hasMore={hasMore} loadingMore={loading && members.length > 0} onLoadMore={() => last && void load({ at: last.createdAt, id: last.id })} auto />
    </div>
  );
}

function LinkedContent({ card, list }: { card: NotificationCard; list: List }) {
  const { t } = useTranslation();
  const item = linkedContent(card);
  const linked = linkedCardFor(list.context, card);
  if (!item) return null;
  if (!linked) {
    return (
      <Link href={attachmentHref(item.type, item.id)} className="flex items-center gap-3 rounded-lg border border-border p-3 text-small font-semibold text-primary hover:bg-primary-soft" data-linked-content="open">
        {t(`nc.open.${item.type}` as const)}
        <ArrowRight size={16} aria-hidden />
      </Link>
    );
  }
  return (
    <div className="flex items-stretch gap-3.5 rounded-lg border border-border p-3" data-linked-content="card">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-primary-soft">
        {linked.thumbnailUrl && <StorageImage src={linked.thumbnailUrl} alt="" fill sizes="80px" className="object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="text-micro font-bold uppercase tracking-[0.06em] text-text-muted">{t(`communities.feed.type.${linked.type}` as const)}</p>
        <p className="mt-0.5 line-clamp-2 font-display text-[1.0625rem] font-bold leading-snug text-text">{linked.title}</p>
      </div>
      <Link href={attachmentHref(item.type, item.id)} className={buttonClassName({ variant: "secondary", className: "h-11 self-center" })}>
        {t(`nc.open.${item.type}` as const)}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}

/**
 * Bildirimin AYRINTISI (docs/history/326-*): masaüstünde bölünmüş gelen kutusunun sağ kartı (`panel`), telefon/tablette tam sayfa (`page`, alta sabit
 * yanıt çubuğu). Açılınca kart okundu işaretlenir. Yorum: tam metin + hızlı tepki + yanıt (fotoğraf · GIF · içerik eki); beğeni/takip: üye listesi/profil;
 * öneri: fark + kabul/reddet; kilometre taşı: büyük sayı. Alt satır: Sessize al · Yarın hatırlat · Bu tür bildirimleri kapat.
 */
export function NotificationDetail({ card, list, variant, onBack }: { card: NotificationCard; list: List; variant: "panel" | "page"; onBack?: () => void }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const { markRead, markUnread, remove } = useNotifications();
  const actions = useCardActions(card, list);
  const replySeq = useCompletionSeq(actions.busy === "reply");
  const extras = useCommentExtras();
  const [draft, setDraft] = useState("");
  const kind = quickActionKind(card);
  const commentId = notificationCommentId(card);
  const comment = commentId ? list.context.comments.get(commentId) : undefined;
  const local = list.local[card.key];
  const suggestion = actions.suggestion;
  const milestone = milestoneInfo(card.latestMessage);
  const summary = reactionSummary(card.reactionCounts, t);
  const unread = card.unreadCount > 0;
  const actor = card.latestActor;
  const href = parseNotificationHref(card.targetHref);

  // Açılınca okundu (ertelenip geri gelen kart da okunmamış açılır).
  useEffect(() => {
    if (card.unreadCount > 0) void markRead(card);
    // yalnız kart değişince
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.key]);

  const send = async () => {
    if (await actions.reply(draft, extras)) setDraft("");
  };

  const lines = suggestion && suggestion.proposedText && suggestion.currentText != null ? changedExcerpt(diffLines(suggestion.currentText, suggestion.proposedText), 2) : [];

  const header = (
    <div className="flex flex-wrap items-center gap-3.5">
      <CardAvatar card={card} size={variant === "panel" ? 56 : 52} />
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-small font-semibold text-primary">
          {t(cardKindKey(card))} <span className="font-medium text-text-muted">· {new Date(card.sortAt).toLocaleString(language === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
        </p>
        <h2 className="mt-1 font-display text-[1.375rem] font-bold leading-snug tracking-[-0.01em] text-text">
          <CardHeadline card={card} as="span" plain className="!text-[1.375rem] !font-bold" />
        </h2>
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => void (unread ? markRead(card) : markUnread(card))} aria-label={unread ? t("nc.markRead") : t("nc.markUnread")} title={unread ? t("nc.markRead") : t("nc.markUnread")} data-action="toggle-read" className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {unread ? <Check size={20} aria-hidden /> : <Undo2 size={20} aria-hidden />}
        </button>
        <button type="button" onClick={() => { remove(card); onBack?.(); }} aria-label={t("notifications.deleteNotification")} title={t("notifications.deleteNotification")} data-action="delete" className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger hover:bg-danger/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
          <TrashIcon size={20} />
        </button>
      </div>
    </div>
  );

  const body = (
    <>
      {kind === "comment" && (
        <div className="space-y-3" data-detail-body="">
          {(!comment || comment.deleted || comment.body.trim()) && (
            <p className="max-w-[66ch] whitespace-pre-line break-words text-[1.0625rem] leading-relaxed text-text [overflow-wrap:anywhere]">
              {comment ? (comment.deleted ? t("nc.commentDeleted") : comment.body) : "…"}
            </p>
          )}
          {/* Ayrıntıda yorumun/yanıtın TAMAMI: tam metin + her ek, tam boy. */}
          <CommentExtrasStrip comment={comment} context={list.context} all />
        </div>
      )}
      {(kind === "members" || (card.type === "like" && card.rowCount >= 1)) && (
        <>
          {summary && <p className="text-small font-semibold text-text-secondary" data-reaction-summary="">{summary}</p>}
          <GroupMembers card={card} />
        </>
      )}
      {kind === "followBack" && actor && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-soft p-4.5" data-profile-card="">
          <Avatar src={actor.avatarUrl} alt={actor.displayName} size={56} />
          <div className="min-w-0 flex-1 basis-52">
            <p className="text-[1.0625rem] font-bold text-text">{actor.displayName}</p>
            <p className="mt-0.5 text-small text-text-muted">
              @{actor.username}
              {actor.bio ? ` · ${actor.bio}` : ""}
            </p>
          </div>
          <Button variant={actions.following ? "secondary" : "primary"} className="h-11" onClick={() => void actions.toggleFollow()} disabled={actions.busy === "follow"} aria-pressed={actions.following} data-action="follow">
            {actions.following && <Check size={16} aria-hidden />}
            {actions.following ? t("nc.followingNow") : t("nc.followBack")}
          </Button>
          <Link href={`/profile/real?username=${encodeURIComponent(actor.username)}`} className={buttonClassName({ variant: "outline", className: "h-11" })}>
            {t("nc.openProfile")}
          </Link>
        </div>
      )}
      {kind === "suggestion" && (
        <div className="space-y-3">
          {suggestion?.note && <p className="text-body leading-relaxed text-text-secondary">“{suggestion.note}”</p>}
          {lines.length > 0 && (
            <div className="space-y-1 rounded-lg bg-surface-soft px-4 py-3 font-mono text-small leading-relaxed" data-suggestion-diff="">
              {lines.map((line, index) => (
                <div key={index} className={cn("break-words", line.op === "del" && "text-danger", line.op === "add" && "text-success", line.op === "same" && "text-text-muted")}>
                  {line.op === "del" ? "− " : line.op === "add" ? "+ " : "  "}
                  {line.text}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {suggestion && suggestion.status !== "pending" ? (
              <span className="inline-flex h-11 items-center gap-2 text-small font-semibold text-success" data-suggestion-result={suggestion.status}>
                <Check size={16} aria-hidden />
                {t(suggestion.status === "accepted" ? "nc.suggestionAccepted" : "nc.suggestionRejected")}
              </span>
            ) : (
              <>
                {suggestion?.proposedText && (
                  <Button className="h-11" onClick={() => void actions.acceptSuggestion()} disabled={actions.busy === "suggestion"} data-action="accept">
                    {t("nc.accept")}
                  </Button>
                )}
                <Button variant="outline" className="h-11" onClick={() => void actions.rejectSuggestion()} disabled={actions.busy === "suggestion" || !suggestion} data-action="reject">
                  {t("nc.reject")}
                </Button>
                <Link href={card.targetHref} className={buttonClassName({ variant: suggestion?.proposedText ? "ghost" : "primary", className: "h-11" })} data-action="accept-edit">
                  {t("nc.acceptWithEdit")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
      {kind === "milestone" && milestone && (
        <div className="flex flex-wrap items-center gap-5 rounded-lg border border-secondary/30 bg-secondary/10 p-5" data-milestone="">
          <p className="font-display text-[3.5rem] font-extrabold leading-none tracking-[-0.03em] text-secondary">{milestone.count}</p>
          <p className="min-w-0 flex-1 basis-60 text-body leading-relaxed text-text-secondary">{t(milestone.kind === "copies" ? "nc.milestone.copiesBody" : "nc.milestone.reactionsBody", { count: milestone.count, title: milestone.title })}</p>
          <Link href={card.targetHref} className={buttonClassName({ variant: "primary", className: "h-11 !bg-secondary" })}>
            {t("nc.viewStats")}
          </Link>
          <Button
            variant="outline"
            className="h-11"
            onClick={async () => {
              if (!href.id) return;
              const result = await shareOrCopyLink(`/prompts/local?id=${href.id}`, milestone.title);
              if (result === "copied") announceNotice(t("common.linkCopied"));
            }}
          >
            {t("nc.share")}
          </Button>
        </div>
      )}
      {(kind === "none" || kind === "messageRequest") && (
        <div className="space-y-3">
          <CardHeadline card={card} className="text-body" />
          {kind === "messageRequest" && (
            <div className="flex gap-2">
              {local?.request ? (
                <span className="inline-flex h-11 items-center gap-2 text-small font-semibold text-success"><Check size={16} aria-hidden />{t(local.request === "accepted" ? "nc.requestAccepted" : "nc.requestDeclined")}</span>
              ) : (
                <>
                  <Button className="h-11" onClick={() => void actions.resolveMessageRequest(true)} disabled={actions.busy === "request"}>{t("nc.accept")}</Button>
                  <Button variant="outline" className="h-11" onClick={() => void actions.resolveMessageRequest(false)} disabled={actions.busy === "request"}>{t("nc.reject")}</Button>
                </>
              )}
            </div>
          )}
          <Link href={card.targetHref} className={buttonClassName({ variant: "outline", className: "h-11" })} data-action="open-target">
            {t("nc.openTarget")}
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      )}
    </>
  );

  const commentExtras = kind === "comment" && (
    <>
      {/* Seçici AÇIK gelir (kartta dokununca açılan emoji menüsünün aynısı), altında tepki özeti. */}
      <DetailReactionSection card={card} list={list} showHint={variant === "page"} />
      {local?.reply && (
        <div className="flex flex-col items-end gap-1">
          <p className="max-w-[80%] whitespace-pre-line break-words rounded-lg rounded-br-md bg-primary px-4 py-3 text-body text-primary-foreground [overflow-wrap:anywhere]" data-reply-bubble="">{local.reply.body}</p>
          <p className="text-caption text-text-muted">{t("nc.replyJustNow")}</p>
        </div>
      )}
      {/* Yanıt kutusu içeriğin AKIŞINDA (sabit çubuk değil): telefonda altındaki Sessize al / Yarın hatırlat satırını örtmez. */}
      {actions.replyTarget && user && (
        <div data-reply-composer="">
          <label htmlFor="detail-reply" className="mb-2 block text-label font-bold text-text-secondary">{t("nc.replyLabel")}</label>
          <div className="space-y-2.5 rounded-lg border border-border bg-surface p-3 pl-4">
            <textarea id="detail-reply" rows={variant === "panel" ? 3 : 2} value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder={t("nc.replyPlaceholder", { name: actor?.displayName ?? "" })} className="w-full resize-none bg-transparent text-body text-text outline-none placeholder:text-text-muted" />
            <CommentExtrasPreview extras={extras} />
            <div className="flex flex-wrap items-center gap-1.5">
              <CommentExtrasToolbar extras={extras} userId={user.id} disabled={actions.busy === "reply"} />
              <span className="flex-1" />
              <Button className="h-11" onClick={() => void send()} disabled={actions.busy === "reply" || extras.isPreparing || (!draft.trim() && !extras.hasExtras)} data-action="reply-send">
                <SendIcon size={16} seq={replySeq} />
                {t("nc.send")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const content = (
    <div className="flex flex-col gap-5">
      {header}
      {body}
      {kind !== "followBack" && <LinkedContent card={card} list={list} />}
      {commentExtras}
      <DetailFooterActions card={card} list={list} onAfterHide={onBack} />
    </div>
  );

  if (variant === "panel") {
    return (
      <article aria-label={t("nc.selectedAria")} data-notification-detail={card.key} className="rounded-lg border border-border-soft bg-surface p-7 shadow-card">
        {content}
      </article>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-notification-detail={card.key}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label={t("nc.backToList")} className="grid size-11 place-items-center rounded-full bg-surface-soft text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-action="back">
          <ArrowLeft size={20} aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate font-display text-[1.25rem] font-bold tracking-[-0.01em]">{t(cardKindKey(card))}</p>
        <span className="grid size-11 place-items-center text-text-muted" aria-hidden>
          <MoreVertical size={20} />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-(--nav-clearance) pt-4">{content}</div>
    </div>
  );
}

