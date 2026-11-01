"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, CheckCheck, ChevronRight, Megaphone, MoreHorizontal, Pin, SmilePlus, Star } from "lucide-react";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "./emoji-picker";
import { MessageImageGrid, useMessageImageUrls } from "./message-image-grid";
import { MessageActionSheet } from "./message-action-sheet";
import { useAnchoredPopover } from "./use-anchored-popover";
import { useLongPress } from "./use-long-press";
import { canEditOrDeleteMessage } from "./message-time-limit";
import { SharedCommunityPostCard, SharedPromptCard, SharedPresetCard, SharedRequestCard, SharedSpaceCard, SharedWorkflowCard } from "./shared-content-card";
import { parseSpaceShareBody } from "./space-share-format";
import { parseWorkflowShareBody } from "./workflow-share-format";
import { parsePresetShareBody } from "./preset-share-format";
import { parseCommunityPostShareBody } from "./community-post-share-format";
import { describeReplied, ReplyThumb, useRepliedItem } from "./reply-quote";
import { cn } from "@/lib/utils";
import { formatClockTime } from "@/lib/chat-grouping";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ReadState } from "@/lib/chat-features";
import type { Message, MessageAttachment } from "@/types";
import type { MessageBubbleActions, MessageReactionEntry, MessageSender } from "./message-bubble-types";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/features/groups/role-badge";
import { communityHref } from "@/lib/communities";
import { StoryReplyCard } from "@/features/stories/story-reply-card";
import { gifIdFromPath, giphyUrl } from "@/lib/giphy";

/** A message's stored photos (signed URLs resolved lazily) + the fullscreen viewer they open. */
function BubbleImages({ attachments, isMe }: { attachments: MessageAttachment[]; isMe: boolean }) {
  const urls = useMessageImageUrls(attachments);
  const [open, setOpen] = useState<number | null>(null);
  const images = attachments.map((a) => ({ key: a.path, url: urls.get(a.path) ?? null, width: a.width, height: a.height }));
  const viewable = images.filter((image): image is typeof image & { url: string } => Boolean(image.url));

  return (
    <>
      <MessageImageGrid
        images={images}
        className={isMe ? "self-end" : "self-start"}
        // The viewer only shows photos that have resolved; map the grid index to its slot among them.
        onOpen={(index) => {
          const target = images[index];
          const slot = viewable.findIndex((image) => image.key === target.key);
          if (slot >= 0) setOpen(slot);
        }}
      />
      {open !== null && (
        <ImageLightbox
          // GIF'in tam ekranda büyük (özgün) sürümü açılır; fotoğraflar kendi imzalı adresiyle.
          images={viewable.map((image) => {
            const gifId = gifIdFromPath(image.key);
            return { url: (gifId && giphyUrl(gifId, "original")) || image.url };
          })}
          initialIndex={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

export type { DeleteMode, MessageBubbleActions, MessageReactionEntry } from "./message-bubble-types";

/**
 * One message bubble — plain text, a shared prompt/request card, or a
 * reply, in any combination. Deleted-for-everyone shows a placeholder but
 * keeps its place in the thread (Bölüm 9.5/9.7's safe-delete philosophy,
 * applied to messages: the row survives, only its content is gone).
 *
 * Long press / right click on the bubble and the "⋮" button open the same sheet (`MessageActionSheet`, docs/history/290-*).
 *
 * Aşama 1/2/3/4/5 (mesaj menüsü/emoji tepkileri/süre kontrolü): the "⋮" and
 * emoji icons are hidden by default and only reveal on hover (desktop,
 * plain CSS `group-hover`) or a single tap (mobile — `isActive`, owned by
 * the parent conversation view so activating one message deactivates any
 * other). Neither icon nor the popovers they open change the bubble's own
 * layout position.
 *
 * Staying in view (docs/history/212-*): the icon pair is `sticky` inside a column as tall as the bubble, so on a message taller
 * than the screen it rides along the part that is visible instead of sitting at the bubble's (off-screen) middle. The menu
 * and the emoji picker: the sheet is a full-screen layer, the emoji picker is portalled and fixed-positioned by `useAnchoredPopover`
 * inside the visible chat area (below the header, above the composer and the iOS keyboard), flipping above when there is no room below.
 */
export function MessageBubble({
  message,
  isMe,
  replyPreview,
  isEditingHere,
  isHighlighted,
  isActive,
  onActivate,
  reactions,
  currentUserId,
  onReact,
  actions,
  sender,
  readState,
  groupStart = true,
  groupEnd = true,
}: {
  /** Öbeğin (aynı kişinin art arda mesajları) ilk/son mesajı: grup sohbetinde avatar + ad ilkinde, kuyruk köşesi sonda. */
  groupStart?: boolean;
  groupEnd?: boolean;
  message: Message;
  /** Yalnız birebir sohbette, benim mesajımda: karşı tarafın okundu durumu (grupta tik yok; ayrıntı "Mesaj bilgisi"nde). */
  readState?: ReadState | null;
  /** Yalnız grup sohbetinde, başkasının mesajında: gönderenin avatarı, adı ve (varsa) rolü mesajın üstünde gösterilir. */
  sender?: MessageSender | null;
  isMe: boolean;
  /** The message this one replies to, already looked up from the loaded thread — null if it replies to nothing, or that message fell outside the loaded page. */
  replyPreview: Message | null;
  isEditingHere: boolean;
  /** Briefly flashed after landing here from a mesaj bildirimi (Aşama 4.8/5) — same soft-purple flash used for comments/responses. */
  isHighlighted?: boolean;
  /** Whether THIS message's action icons are revealed via a mobile tap right now — owned by the parent so tapping a different message closes this one's (Aşama 1's "başka bir mesaja dokunulduğunda önceki mesajın ikonları ve açık menüsü kapansın"). Desktop hover works independently of this via CSS. */
  isActive: boolean;
  onActivate: (id: string | null) => void;
  /** Every real-time-synced reaction currently on this message (Aşama 2) — 0, 1, or (both participants having reacted) 2 entries in this 1:1 messaging system. Never rendered with a count. */
  reactions: MessageReactionEntry[];
  currentUserId: string | null;
  onReact: (messageId: string, emoji: string) => void;
  actions: MessageBubbleActions;
}) {
  const { t, language } = useTranslation();
  const isDeleted = Boolean(message.deletedAt);

  // Workflow/preset shares have no database column (Bölüm 9.52) — recognized
  // from their own plain-text pattern inside `body`. A message only ever shares one thing.
  const workflowShare = !message.sharedPromptId && !message.sharedRequestId ? parseWorkflowShareBody(message.body) : null;
  const presetShare =
    !message.sharedPromptId && !message.sharedRequestId && !workflowShare ? parsePresetShareBody(message.body) : null;
  const spaceShare =
    !message.sharedPromptId && !message.sharedRequestId && !workflowShare && !presetShare ? parseSpaceShareBody(message.body) : null;
  const postShare =
    !message.sharedPromptId && !message.sharedRequestId && !workflowShare && !presetShare && !spaceShare ? parseCommunityPostShareBody(message.body) : null;
  const displayBody = workflowShare ? workflowShare.note : presetShare ? presetShare.note : spaceShare ? spaceShare.note : postShare ? postShare.note : message.body;

  const repliedItem = useRepliedItem(replyPreview);
  const replyPreviewText = replyPreview ? describeReplied(replyPreview, t, repliedItem.title) : null;

  // The long-press / ⋮ sheet (reaction bar + message copy + action menu, `MessageActionSheet`, docs/history/290-*); the quick
  // emoji button next to it keeps its small anchored picker.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // Re-checked whenever the menu opens, and every few seconds while it
  // stays open — Aşama 5/6's "menü açıkken süre dolarsa seçenekler
  // kaldırılsın, kullanıcı sayfayı yenilemek zorunda kalmasın." The real,
  // unbypassable guarantee is still the server's own RLS check (see
  // message-time-limit.ts) — this only decides what the menu SHOWS.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const canEditOrDelete = canEditOrDeleteMessage(message.createdAt, nowTick);

  // A "kendi" message's emoji picker lines up with the right edge of its trigger, the other side's with the left; clamped into view.
  const {
    anchorRef: emojiAnchorRef,
    panelRef: emojiPanelRef,
    style: emojiStyle,
  } = useAnchoredPopover({ open: emojiOpen, align: isMe ? "end" : "start", onAway: () => setEmojiOpen(false) });

  // A different message being activated (or a blank-area tap deactivating
  // all of them, see local-conversation-view.tsx) closes whatever popover
  // THIS message had open — Aşama 1's "önceki mesajın ... açık menüsü
  // kapansın".
  useEffect(() => {
    if (!isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the PARENT deactivating this message (a different message activated, or a blank-area tap), not a render-time derivation of this component's own state
      setSheetOpen(false);
      setEmojiOpen(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!sheetOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time refresh at the moment the menu opens, followed by a genuine external-clock subscription (the interval below) — not a render-time derivation
    setNowTick(Date.now());
    const interval = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [sheetOpen]);

  // Tapping/clicking outside the open emoji picker closes it — the exact
  // pattern already established by PostMenu/ProfileMoreMenu in this app.
  // (The sheet closes itself: its own scrim, Escape and focus handling.)
  useEffect(() => {
    if (!emojiOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (emojiPanelRef.current?.contains(target)) return;
      if (iconsRef.current?.contains(target)) return;
      setEmojiOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setEmojiOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emojiOpen]);

  const iconsRef = useRef<HTMLDivElement>(null);

  const myReaction = currentUserId ? (reactions.find((r) => r.userId === currentUserId)?.emoji ?? null) : null;
  // Tailwind's `group-hover:` only fires under `@media (hover: hover)`, which
  // touch-primary devices with a trackpad/mouse attached (iPad) report as
  // false — so hover is tracked with pointer events instead, ignoring real
  // touch pointers (those keep the tap-to-reveal behaviour via `isActive`).
  const [isHovered, setIsHovered] = useState(false);
  const isRevealed = isActive || sheetOpen || emojiOpen || isHovered;

  function handleReactSelect(emoji: string) {
    onReact(message.id, emoji);
    setEmojiOpen(false);
  }

  function openSheet() {
    onActivate(message.id);
    setSheetOpen(true);
    setEmojiOpen(false);
  }
  function closeSheet() {
    setSheetOpen(false);
    onActivate(null);
  }
  // Long press on the bubble (touch) or right click (mouse) opens the same sheet as the ⋮ button.
  const { handlers: pressHandlers, pressing } = useLongPress({ onLongPress: openSheet, enabled: !isDeleted && !isEditingHere });

  const iconButtons = (
    <div
      ref={iconsRef}
      // Every click anywhere in the icon row/popovers (including a menu
      // item like "Herkesten sil" that deliberately does NOT close the
      // menu on its first, confirm-step click) must never fall through to
      // the bubble root's own onClick — that one toggles `isActive`, which
      // would immediately deactivate this message and close the menu out
      // from under the confirm step.
      onClick={(event) => event.stopPropagation()}
      data-message-actions
      className={cn(
        // As tall as the bubble; the pair inside is sticky, so it stays on the visible part of a long message.
        "flex shrink-0 flex-col justify-center self-stretch transition-opacity",
        isRevealed ? "opacity-100" : "opacity-0 focus-within:opacity-100",
      )}
    >
      <div className="sticky bottom-2 top-2 flex items-center gap-0.5">
        <button
          ref={emojiAnchorRef}
          type="button"
          aria-label={t("messages.addEmojiReaction")}
          aria-haspopup="menu"
          aria-expanded={emojiOpen}
          onClick={(event) => {
            event.stopPropagation();
            onActivate(message.id);
            setEmojiOpen((prev) => !prev);
            setSheetOpen(false);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
        >
          <SmilePlus size={16} />
        </button>
        {emojiOpen &&
          createPortal(
            <EmojiPicker myReaction={myReaction} onSelect={handleReactSelect} panelRef={emojiPanelRef} style={emojiStyle} />,
            document.body,
          )}
        <button
          type="button"
          aria-label={t("messages.messageOptionsAriaLabel")}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={(event) => {
            event.stopPropagation();
            openSheet();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
        >
          <MoreHorizontal size={16} />
        </button>
        {/* Portalled by the sheet itself (so the scrolling list never clips it) but still a React child of this row: its clicks stop above. */}
        {sheetOpen && !isDeleted && !isEditingHere && (
          <MessageActionSheet
            message={message}
            isMe={isMe}
            sourceRef={contentRef}
            myReaction={myReaction}
            onReact={(emoji) => {
              onReact(message.id, emoji);
              closeSheet();
            }}
            canEditOrDelete={canEditOrDelete}
            actions={actions}
            onReply={() => actions.onStartReply(message)}
            onClose={closeSheet}
          />
        )}
      </div>
    </div>
  );

  // Saat baloncuğun içinde (metinli mesajda), kart/fotoğraf/silinmiş mesajda altında: sağ tarafta okundu tikleri, sabit/yıldız işaretleri.
  const inlineMeta = Boolean(displayBody && !message.announcementId && !isDeleted && !isEditingHere);
  const metaContent = (
    <>
      <span>
        {formatClockTime(message.createdAt, language)}
        {message.editedAt && !isDeleted && ` · ${t("comments.edited")}`}
      </span>
      {!isDeleted && actions.isPinned?.(message.id) && <Pin size={11} aria-label={t("chat.pin.barLabel")} />}
      {!isDeleted && actions.isStarred?.(message.id) && <Star size={11} className="fill-current" aria-label={t("chat.star.unstar")} data-starred-mark />}
      {!isDeleted && isMe && readState && (
        <span
          data-read-state={readState}
          title={readState === "read" ? t("chat.read.read") : t("chat.read.sent")}
          className={cn("inline-flex items-center", readState === "read" ? "text-primary-foreground" : undefined)}
        >
          {readState === "read" ? <CheckCheck size={14} aria-hidden /> : <Check size={14} aria-hidden />}
          <span className="sr-only">{readState === "read" ? t("chat.read.read") : t("chat.read.sent")}</span>
        </span>
      )}
    </>
  );
  const showSender = Boolean(sender && !isMe);
  const senderLabel =
    showSender && groupStart && sender ? (
      <span data-message-sender className="flex basis-full items-center gap-1.5 text-caption font-semibold">
        <span className={cn("max-w-[10rem] truncate", senderTone(message.senderId))}>{sender.displayName}</span>
        {sender.role && <RoleBadge role={sender.role} />}
      </span>
    ) : null;

  return (
    <div
      data-message-id={message.id}
      data-message-wrapper
      onClick={() => onActivate(isActive ? null : message.id)}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setIsHovered(true);
      }}
      onPointerLeave={() => setIsHovered(false)}
      className={cn(
        "group flex flex-col rounded-md transition-colors duration-700",
        isMe ? "items-end" : "items-start",
        groupStart ? "mt-3 first:mt-0" : "mt-0.5",
        isHighlighted && "-mx-1.5 bg-primary/10 px-1.5 py-1 ring-1 ring-primary/40",
      )}
    >
      {replyPreview && (
        <div
          className={cn(
            "mb-1 flex max-w-[75%] items-center gap-1 rounded-xl bg-surface-soft px-2.5 py-1.5 text-xs text-text-muted",
            isMe && "flex-row-reverse text-right",
            showSender && "ml-9",
          )}
        >
          <span className="truncate">{replyPreviewText}</span>
          {!replyPreview.deletedAt && <ReplyThumb thumb={repliedItem.thumb} size={28} />}
        </div>
      )}

      <div className={cn("flex items-stretch gap-1", isMe ? "flex-row-reverse" : "flex-row")}>
        {showSender && sender && (
          <span className="mr-1 flex w-7 shrink-0 items-end" data-message-avatar>
            {groupStart && <Avatar src={sender.avatarUrl} alt={sender.displayName} size={28} />}
          </span>
        )}
        {isDeleted ? (
          <div className="max-w-[75%] rounded-[20px] bg-surface-soft/60 px-3.5 py-2 text-sm italic text-text-muted">
            {t("messages.thisMessageWasDeleted")}
          </div>
        ) : isEditingHere ? (
          <div className="w-full max-w-[75%] space-y-1.5" onClick={(event) => event.stopPropagation()}>
            <textarea
              value={actions.editDraft}
              onChange={(event) => actions.onEditDraftChange(event.target.value)}
              rows={2}
              autoFocus
              className="w-full resize-none rounded-2xl bg-surface-soft px-3.5 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!actions.editDraft.trim() || actions.isSavingEdit}
                onClick={() => actions.onSubmitEdit(message.id)}
              >
                {actions.isSavingEdit ? t("common.saving") : t("common.save")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={actions.onCancelEdit}>
                {t("common.cancelAction")}
              </Button>
            </div>
            {actions.editError && <p className="text-xs text-danger">{actions.editError}</p>}
          </div>
        ) : (
          <div
            ref={contentRef}
            data-message-content
            {...pressHandlers}
            className={cn(
              "relative flex max-w-[75%] flex-col gap-1.5 transition-transform duration-150",
              // iOS Safari's own long-press (text selection, link preview) must not compete with ours; selecting text by touch is replaced by "Kopyala" in the menu.
              "[-webkit-touch-callout:none] pointer-coarse:select-none",
              reactions.length > 0 && "mb-3",
              pressing && "scale-[0.97]",
            )}
          >
            {!inlineMeta && senderLabel && (
              <span data-message-sender className="flex items-center gap-1.5 text-caption font-semibold">
                <span className={cn("max-w-[10rem] truncate", senderTone(message.senderId))}>{sender?.displayName}</span>
                {sender?.role && <RoleBadge role={sender.role} />}
              </span>
            )}
            {message.isStoryReply && <StoryReplyCard storyId={message.storyId} isMe={isMe} />}
            {message.sharedPromptId && <SharedPromptCard promptId={message.sharedPromptId} />}
            {message.sharedRequestId && <SharedRequestCard requestId={message.sharedRequestId} />}
            {workflowShare && <SharedWorkflowCard workflowId={workflowShare.id} />}
            {presetShare && <SharedPresetCard presetId={presetShare.id} />}
            {spaceShare && <SharedSpaceCard spaceId={spaceShare.id} />}
            {postShare && <SharedCommunityPostCard postId={postShare.id} />}
            {message.attachments.length > 0 && <BubbleImages attachments={message.attachments} isMe={isMe} />}
            {message.announcementId && displayBody && (
              <Link
                href={communityHref(message.conversationId)}
                data-announcement-card
                className="flex w-fit max-w-full flex-col gap-1 self-start rounded-[22px] bg-surface-soft px-4 py-3.5 text-sm text-text transition-colors hover:bg-surface-elevated"
              >
                <span className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-primary">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated">
                    <Megaphone size={14} aria-hidden />
                  </span>
                  {t("communities.chat.announcement")}
                </span>
                <span className="mt-1 block break-words font-display text-[1.0625rem] font-semibold">{displayBody}</span>
                <span className="inline-flex items-center gap-0.5 text-small text-primary">
                  {t("communities.chat.announcementOpen")} <ChevronRight size={15} aria-hidden />
                </span>
              </Link>
            )}
            {displayBody && !message.announcementId && (
              <div
                className={cn(
                  "flex w-fit max-w-full flex-wrap items-end gap-x-2.5 rounded-[20px] px-3.5 py-2 text-[15px] leading-[1.4]",
                  isMe ? "self-end bg-primary text-primary-foreground" : "self-start bg-surface-soft text-text",
                  groupEnd && (isMe ? "rounded-br-md" : "rounded-bl-md"),
                )}
              >
                {senderLabel}
                <p className="min-w-0 break-words">{displayBody}</p>
                <span
                  data-message-meta
                  className={cn("ml-auto inline-flex shrink-0 items-center gap-1 pt-1 text-[11px] leading-none", isMe ? "text-primary-foreground/85" : "text-text-muted")}
                >
                  {metaContent}
                </span>
              </div>
            )}
            {reactions.length > 0 && (
              <div
                className={cn(
                  "absolute -bottom-3 flex items-center gap-0.5 rounded-full bg-surface-elevated px-2 py-0.5 text-xs leading-none text-text ring-2 ring-background",
                  isMe ? "right-2.5" : "left-2.5",
                )}
              >
                {reactions.map((reaction) => (
                  <span key={reaction.userId} data-reaction-emoji={reaction.emoji}>
                    {reaction.emoji}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!isDeleted && !isEditingHere && iconButtons}
      </div>

      {!inlineMeta && !isEditingHere && (
        <div data-message-meta className={cn("mt-1 flex items-center gap-1 px-1 text-[11px] text-text-muted", showSender && "ml-9")}>
          {metaContent}
        </div>
      )}
    </div>
  );
}

/** Grup sohbetinde gönderen adının rengi: kişiye göre sabit, yalnız tema renkleriyle (koyu/açık temada okunur). */
const SENDER_TONES = ["text-primary", "text-secondary", "text-success"] as const;
function senderTone(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i += 1) hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
  return SENDER_TONES[hash % SENDER_TONES.length];
}
