"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "@/components/icons/bell";
import { Trophy } from "@/components/icons/trophy";
import { X } from "@/components/icons/x";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { FLOATING_PANEL_CLASS } from "@/components/ui/floating";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { useAuth } from "@/features/auth/auth-provider";
import { ReactionButton } from "@/features/reactions/reaction-button";
import { CardAvatar, useHeadlineParts } from "./notification-parts";
import { useNotifications } from "./notifications-provider";
import { fetchNotificationContext } from "@/lib/supabase/notification-context";
import { followUser } from "@/lib/supabase/follows";
import { sendMessage } from "@/lib/supabase/messages";
import { postNotificationReply } from "@/lib/supabase/notification-reply";
import {
  LIVE_TOAST_SWIPE_PX,
  isMilestoneCard,
  liveToastAction,
  liveToastDurationMs,
  liveToastInlineReply,
  liveToastReplyHref,
  type LiveToastEntry,
} from "@/lib/live-notification-toast";
import { commentReplyTarget, notificationCommentId } from "@/lib/notification-actions";
import { milestoneInfo, quotedPreview, withoutQuotedPreview } from "@/lib/notification-card";
import { parseNotificationHref } from "@/lib/notification-mirror";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { REACTION_LABEL, type ReactionKey } from "@/lib/reactions";
import { cn } from "@/lib/utils";

/** Kutlama kartının konfetisi: dört token rengi, sabit (rastgelesiz) dağılım; hareketi azalt'ta CSS kendiliğinden söndürür. */
const CONFETTI = ["bg-primary", "bg-secondary", "bg-heart", "bg-success"] as const;
const CONFETTI_COUNT = 14;

/** Bir canlı kart: üç görünüm — normal bildirim, kilometre taşı (kutlama), yoğunlukta özet. Süre, duraklatma, kaydırma, hızlı eylemler burada. */
export function LiveToast({ entry, mode, onClose }: { entry: LiveToastEntry; mode: "desk" | "phone"; onClose: (id: string) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { markRead } = useNotifications();
  const { card, summary } = entry;
  const milestone = !summary && isMilestoneCard(card);
  const milestoneData = milestone ? milestoneInfo(card.latestMessage) : null;
  const { names, text } = useHeadlineParts(card);
  const preview = summary ? null : milestoneData ? milestoneData.title : quotedPreview(card.latestMessage)?.trim() || null;
  const action = summary ? null : liveToastAction(card);
  const inlineKind = mode === "desk" && !summary ? liveToastInlineReply(card) : null;
  const duration = liveToastDurationMs(entry);
  const [paused, setPaused] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const articleRef = useRef<HTMLElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  // Süre: kalan süre izlenir; duraklatınca (üstüne gelme/basılı tutma/odak) biriken süre düşer, devam edince kalanla yeniden başlar. Birleşmede (`seq`) tam süreye döner.
  // Yanıt yazılırken süre tamamen durur. Açık bir emoji seçicisi (gövdeye portallanır, kartın DIŞINDA) varken süre dolsa bile kart kapanmaz, kısa süre sonra yeniden denenir.
  useEffect(() => {
    remaining.current = duration;
  }, [entry.seq, duration]);
  useEffect(() => {
    if (entry.leaving || paused || replyOpen) return;
    startedAt.current = performance.now();
    const timer = window.setTimeout(() => {
      if (document.querySelector("[data-reaction-picker]")) {
        remaining.current = 1500;
        setTick((n) => n + 1);
        return;
      }
      onClose(entry.id);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
    };
  }, [paused, replyOpen, entry.leaving, entry.seq, entry.id, onClose, tick]);

  const dismiss = useCallback(() => onClose(entry.id), [entry.id, onClose]);

  // Yanıt kutusu açılınca yalnız hassas işaretçide (fare) odaklanır: dokunmatikte açılışta odak vermek ekran klavyesini iter (CLAUDE.md §4).
  useEffect(() => {
    if (replyOpen && window.matchMedia("(pointer: fine)").matches) replyRef.current?.focus();
  }, [replyOpen]);

  const open = useCallback(
    (href: string) => {
      if (!summary) void markRead(card);
      dismiss();
      router.push(href);
    },
    [card, summary, markRead, dismiss, router],
  );

  const follow = useCallback(async () => {
    const actor = card.latestActor;
    if (!user || !actor || followed) return;
    setFollowed(true);
    try {
      await followUser(user.id, actor.id);
      announceNotice(t("nc.followingToast", { name: actor.displayName }));
      void markRead(card);
      dismiss();
    } catch (err) {
      console.error("live toast follow", err);
      setFollowed(false);
      announceNotice(t("nc.actionFailed"));
    }
  }, [user, card, followed, markRead, dismiss, t]);

  // Hızlı tepki (yorum bildirimi, bilgisayar): gönderideki tepki sistemiyle AYNI düğme; tepki sayısı (mağaza tohumu) tek toplu sorguyla okunur, gelene kadar düğme çizilmez.
  const commentId = inlineKind === "comment" ? notificationCommentId(card) : null;
  useEffect(() => {
    if (!commentId || !user) return;
    let cancelled = false;
    fetchNotificationContext([card], user.id)
      .then((context) => {
        const comment = context.comments.get(commentId);
        if (!cancelled && comment && !comment.deleted) setLikeCount(comment.likeCount);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `card` birleşmede değişir ama yorum kartı birleşmez; yalnız yorum kimliği değişince yeniden okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentId, user]);

  const onReacted = useCallback(
    (_result: unknown, _prev: ReactionKey | null, next: ReactionKey | null) => {
      if (next) {
        announceNotice(t("nc.reacted", { label: t(REACTION_LABEL[next]) }));
        void markRead(card);
        dismiss();
      }
    },
    [t, markRead, card, dismiss],
  );

  // Satır içi yanıt: yorumda mevcut `postCommentOn*` ailesi (sunucu kuralları aynen), mesajda mevcut `sendMessage`; kart yalnız tek bir ileti yazar.
  const sendReply = useCallback(async () => {
    const body = draft.trim();
    if (!user || !body || sending) return;
    setSending(true);
    try {
      if (inlineKind === "comment") {
        const target = commentReplyTarget(card);
        if (!target) throw new Error("reply_unsupported");
        await postNotificationReply(target, user.id, body);
      } else {
        const conversation = parseNotificationHref(card.targetHref).id;
        if (!conversation) throw new Error("reply_unsupported");
        await sendMessage(conversation, user.id, { body });
      }
      announceNotice(t("nc.replySent"));
      void markRead(card);
      dismiss();
    } catch (err) {
      console.error("live toast reply", err);
      announceNotice(t("nc.actionFailed"));
      setSending(false);
    }
  }, [draft, user, sending, inlineKind, card, markRead, dismiss, t]);

  // Telefon: yukarı kaydırarak kapat, dokununca aç, basılı tutunca süreyi durdur.
  const drag = useRef<{ startY: number; dy: number; moved: boolean } | null>(null);
  function finishDrag(el: HTMLElement, cancelled: boolean) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    setPaused(false);
    el.style.transition = "";
    if (state.dy < -LIVE_TOAST_SWIPE_PX) {
      dismiss();
      return;
    }
    el.style.transform = "";
    el.style.opacity = "";
    if (!state.moved && !cancelled) open(card.targetHref);
  }
  const phoneHandlers =
    mode === "phone"
      ? {
          onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if ((event.target as HTMLElement).closest("button, a")) return;
            drag.current = { startY: event.clientY, dy: 0, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
            setPaused(true);
          },
          onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
            const state = drag.current;
            if (!state) return;
            const delta = event.clientY - state.startY;
            if (Math.abs(delta) > 6) state.moved = true;
            state.dy = Math.min(0, delta);
            const el = event.currentTarget;
            el.style.transition = "none";
            el.style.transform = `translateY(${state.dy}px)`;
            el.style.opacity = String(Math.max(0.2, 1 + state.dy / 140));
          },
          onPointerUp: (event: React.PointerEvent<HTMLElement>) => finishDrag(event.currentTarget, false),
          onPointerCancel: (event: React.PointerEvent<HTMLElement>) => finishDrag(event.currentTarget, true),
        }
      : {};

  const accentBar = milestone ? "bg-secondary" : card.type === "like" && !summary ? "bg-secondary" : "bg-primary";

  return (
    <div className="live-toast-slot" data-leaving={entry.leaving ? "" : undefined}>
      <div>
        <article
          ref={articleRef}
          tabIndex={0}
          data-live-toast={card.key}
          data-kind={summary ? "summary" : card.type}
          data-live-toast-variant={summary ? "summary" : milestone ? "milestone" : "card"}
          onPointerEnter={(event) => event.pointerType === "mouse" && setPaused(true)}
          onPointerLeave={(event) => event.pointerType === "mouse" && !articleRef.current?.contains(document.activeElement) && setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setPaused(false)}
          onClick={mode === "desk" ? (event) => !(event.target as HTMLElement).closest("button, textarea, form") && open(card.targetHref) : undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") dismiss();
            else if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
              event.preventDefault();
              open(card.targetHref);
            }
          }}
          className={cn(
            "live-toast group pointer-events-auto relative grid cursor-pointer select-none grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 overflow-hidden p-3 pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            FLOATING_PANEL_CLASS,
            milestone && "border-secondary/40",
            mode === "phone" && "touch-none",
          )}
          {...phoneHandlers}
        >
          {/* Kutlama zemini: `bg-secondary-soft` yarı saydamdır, kartın kendisi opak (`surface-elevated`) kalır; ton ayrı bir katmanla verilir. */}
          {milestone && <span aria-hidden className="pointer-events-none absolute inset-0 bg-secondary-soft" />}
          {milestone && (
            <span aria-hidden className="live-toast-confetti" data-live-toast-confetti="">
              {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
                <i key={i} className={CONFETTI[i % CONFETTI.length]} style={{ left: `${6 + ((i * 7) % 88)}%`, animationDelay: `${(i % 5) * 70}ms`, ["--drift" as string]: `${(i % 2 ? 1 : -1) * (8 + ((i * 5) % 22))}px` }} />
              ))}
            </span>
          )}

          {summary ? (
            <span className="relative flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary-text" data-live-toast-icon="summary">
              <Bell size={20} aria-hidden />
            </span>
          ) : milestone ? (
            <span className="relative flex size-10 items-center justify-center rounded-full bg-secondary-soft text-secondary" data-live-toast-icon="milestone">
              <Trophy size={20} aria-hidden />
            </span>
          ) : (
            <CardAvatar card={card} size={40} />
          )}

          <div className="min-w-0">
            {summary ? (
              <>
                <p className="text-small font-semibold leading-snug text-text">{t("nc.live.summaryTitle", { count: card.rowCount })}</p>
                {card.actors.length > 0 && (
                  <p className="mt-0.5 flex items-center gap-2 text-small text-text-muted">
                    <span className="flex shrink-0 items-center">
                      {card.actors.slice(0, 3).map((actor, index) => (
                        <span key={actor.id} className={cn("rounded-full border-2 border-surface-elevated", index > 0 && "-ml-2")}>
                          <Avatar src={actor.avatarUrl} alt={actor.displayName} size={20} />
                        </span>
                      ))}
                    </span>
                    <span className="min-w-0 truncate">{t("nc.live.summaryFrom", { names: card.actors.slice(0, 2).map((a) => a.displayName).join(", ") })}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-small leading-snug text-text">
                  {names && <span className="font-semibold">{names} </span>}
                  <span className={cn(!names && "font-semibold")}>{withoutQuotedPreview(text)}</span>
                </p>
                {preview && <p className="mt-0.5 line-clamp-2 text-small text-text-muted [overflow-wrap:anywhere]">{milestone ? `“${preview}”` : preview}</p>}
              </>
            )}

            {mode === "desk" && (
              <>
                {summary && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" data-action="see-all" onClick={() => open("/notifications")}>
                      {t("nc.live.seeAll")}
                    </Button>
                  </div>
                )}
                {milestone && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" data-action="stats" onClick={() => open(card.targetHref)}>
                      {t("nc.viewStats")}
                    </Button>
                  </div>
                )}
                {!summary && !milestone && action === "reply" && !replyOpen && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {commentId && likeCount !== null && (
                      <span className="contents" data-action="like">
                        <ReactionButton tone="action" contentType="comment" id={commentId} likeCount={likeCount} size={20} labelText={t("nc.quickLike")} onResult={onReacted} />
                      </span>
                    )}
                    <Button size="sm" variant="secondary" data-action="reply" onClick={() => (inlineKind ? setReplyOpen(true) : open(liveToastReplyHref(card)))}>
                      {t("nc.reply")}
                    </Button>
                  </div>
                )}
                {!summary && !milestone && action === "reply" && replyOpen && (
                  <form
                    className="mt-3 space-y-2"
                    data-live-toast-reply=""
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendReply();
                    }}
                  >
                    <label className="sr-only" htmlFor={`live-reply-${entry.id}`}>
                      {t("nc.replyLabel")}
                    </label>
                    <Textarea
                      id={`live-reply-${entry.id}`}
                      ref={replyRef}
                      value={draft}
                      rows={2}
                      maxLength={2000}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          void sendReply();
                        }
                      }}
                      placeholder={t("nc.replyPlaceholder", { name: card.latestActor?.displayName ?? "" })}
                      className="resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <Button type="submit" size="sm" data-action="reply-send" disabled={sending || !draft.trim()}>
                        {t("nc.send")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" data-action="reply-detail" onClick={() => open(liveToastReplyHref(card))}>
                        {t("nc.detail")}
                      </Button>
                    </div>
                  </form>
                )}
                {!summary && !milestone && action === "follow" && entry.canFollow && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" data-action="follow" disabled={followed} onClick={() => void follow()}>
                      {t("nc.live.follow")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <span className="pt-0.5 text-caption text-text-muted transition-opacity group-focus-within:opacity-0 md:group-hover:opacity-0">{t("nc.live.now")}</span>
          {mode === "desk" && (
            <button
              type="button"
              aria-label={t("nc.live.close")}
              title={t("nc.live.close")}
              data-action="close"
              onClick={() => dismiss()}
              className={iconButtonClassName(false, "absolute right-1 top-1 bg-surface-soft opacity-0 group-focus-within:opacity-100 group-hover:opacity-100")}
            >
              <X size={16} aria-hidden />
            </button>
          )}
          <i
            key={entry.seq}
            aria-hidden
            data-live-toast-bar=""
            className={cn("live-toast-bar absolute inset-x-0 bottom-0 h-[3px]", accentBar)}
            style={{ animationDuration: `${duration}ms`, animationPlayState: paused || replyOpen ? "paused" : "running" }}
          />
        </article>
      </div>
    </div>
  );
}
