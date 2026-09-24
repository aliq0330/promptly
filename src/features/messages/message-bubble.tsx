"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "./emoji-picker";
import { MessageActionMenu } from "./message-action-menu";
import { usePopoverAlign } from "./use-popover-align";
import { canEditOrDeleteMessage } from "./message-time-limit";
import { SharedPromptCard, SharedRequestCard } from "./shared-content-card";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Message } from "@/types";
import type { MessageBubbleActions, MessageReactionEntry } from "./message-bubble-types";

export type { DeleteMode, MessageBubbleActions, MessageReactionEntry } from "./message-bubble-types";

/**
 * One message bubble — plain text, a shared prompt/request card, or a
 * reply, in any combination. Deleted-for-everyone shows a placeholder but
 * keeps its place in the thread (Bölüm 9.5/9.7's safe-delete philosophy,
 * applied to messages: the row survives, only its content is gone).
 *
 * Aşama 1/2/3/4/5 (mesaj menüsü/emoji tepkileri/süre kontrolü): the "⋮" and
 * emoji icons are hidden by default and only reveal on hover (desktop,
 * plain CSS `group-hover`) or a single tap (mobile — `isActive`, owned by
 * the parent conversation view so activating one message deactivates any
 * other). Neither icon nor the popovers they open change the bubble's own
 * layout position (both are `position: absolute`).
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
}: {
  message: Message;
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
  const isDeleted = Boolean(message.deletedAt);

  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Re-checked whenever the menu opens, and every few seconds while it
  // stays open — Aşama 5/6's "menü açıkken süre dolarsa seçenekler
  // kaldırılsın, kullanıcı sayfayı yenilemek zorunda kalmasın." The real,
  // unbypassable guarantee is still the server's own RLS check (see
  // message-time-limit.ts) — this only decides what the menu SHOWS.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const canEditOrDelete = canEditOrDeleteMessage(message.createdAt, nowTick);

  const menuPopover = usePopoverAlign(isMe ? "right" : "left", menuOpen);
  const emojiPopover = usePopoverAlign(isMe ? "right" : "left", emojiOpen);

  // A different message being activated (or a blank-area tap deactivating
  // all of them, see local-conversation-view.tsx) closes whatever popover
  // THIS message had open — Aşama 1's "önceki mesajın ... açık menüsü
  // kapansın".
  useEffect(() => {
    if (!isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the PARENT deactivating this message (a different message activated, or a blank-area tap), not a render-time derivation of this component's own state
      setMenuOpen(false);
      setEmojiOpen(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!menuOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time refresh at the moment the menu opens, followed by a genuine external-clock subscription (the interval below) — not a render-time derivation
    setNowTick(Date.now());
    const interval = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [menuOpen]);

  // Tapping/clicking outside either open popover closes it — the exact
  // pattern already established by PostMenu/ProfileMoreMenu in this app.
  useEffect(() => {
    if (!menuOpen && !emojiOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (menuPopover.ref.current?.contains(target)) return;
      if (emojiPopover.ref.current?.contains(target)) return;
      if (iconsRef.current?.contains(target)) return;
      setMenuOpen(false);
      setEmojiOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setEmojiOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, emojiOpen]);

  const iconsRef = useRef<HTMLDivElement>(null);

  const myReaction = currentUserId ? (reactions.find((r) => r.userId === currentUserId)?.emoji ?? null) : null;
  const isRevealed = isActive || menuOpen || emojiOpen;

  function handleReactSelect(emoji: string) {
    onReact(message.id, emoji);
    setEmojiOpen(false);
  }

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
      className={cn(
        "flex shrink-0 items-center gap-0.5 transition-opacity",
        isRevealed ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
      )}
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Emoji tepkisi ekle"
          aria-haspopup="menu"
          aria-expanded={emojiOpen}
          onClick={(event) => {
            event.stopPropagation();
            onActivate(message.id);
            setEmojiOpen((prev) => !prev);
            setMenuOpen(false);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-accent-surface hover:text-text"
        >
          <SmilePlus size={16} />
        </button>
        {emojiOpen && (
          <EmojiPicker myReaction={myReaction} onSelect={handleReactSelect} align={emojiPopover.align} panelRef={emojiPopover.ref} />
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          aria-label="Mesaj seçenekleri"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            onActivate(message.id);
            setMenuOpen((prev) => !prev);
            setEmojiOpen(false);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-accent-surface hover:text-text"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <MessageActionMenu
            message={message}
            isMe={isMe}
            align={menuPopover.align}
            panelRef={menuPopover.ref}
            canEditOrDelete={canEditOrDelete}
            actions={actions}
            onReply={() => actions.onStartReply(message)}
            onClose={() => {
              setMenuOpen(false);
              onActivate(null);
            }}
          />
        )}
      </div>
    </div>
  );

  return (
    <div
      data-message-id={message.id}
      data-message-wrapper
      onClick={() => onActivate(isActive ? null : message.id)}
      className={cn(
        "group flex flex-col rounded-md transition-colors duration-700",
        isMe ? "items-end" : "items-start",
        isHighlighted && "-mx-1.5 bg-primary/10 px-1.5 py-1 ring-1 ring-primary/40",
      )}
    >
      {replyPreview && (
        <div
          className={cn(
            "mb-1 flex max-w-[75%] items-center gap-1 rounded-t-md border-l-2 border-primary bg-accent-surface/50 px-2 py-1 text-xs text-text-muted",
            isMe && "flex-row-reverse border-l-0 border-r-2 text-right",
          )}
        >
          <span className="truncate">
            {replyPreview.deletedAt
              ? "Silinmiş mesaj"
              : replyPreview.body ?? (replyPreview.sharedPromptId ? "Bir prompt" : "Bir istek")}
          </span>
        </div>
      )}

      <div className={cn("flex items-center gap-1", isMe ? "flex-row-reverse" : "flex-row")}>
        {isDeleted ? (
          <div className="max-w-[75%] rounded-lg bg-accent-surface/40 px-3 py-2 text-sm italic text-text-muted">
            Bu mesaj silindi.
          </div>
        ) : isEditingHere ? (
          <div className="w-full max-w-[75%] space-y-1.5" onClick={(event) => event.stopPropagation()}>
            <textarea
              value={actions.editDraft}
              onChange={(event) => actions.onEditDraftChange(event.target.value)}
              rows={2}
              autoFocus
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!actions.editDraft.trim() || actions.isSavingEdit}
                onClick={() => actions.onSubmitEdit(message.id)}
              >
                {actions.isSavingEdit ? "Kaydediliyor..." : "Kaydet"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={actions.onCancelEdit}>
                İptal
              </Button>
            </div>
            {actions.editError && <p className="text-xs text-danger">{actions.editError}</p>}
          </div>
        ) : (
          <div className="relative flex max-w-[75%] flex-col gap-1.5">
            {message.sharedPromptId && <SharedPromptCard promptId={message.sharedPromptId} />}
            {message.sharedRequestId && <SharedRequestCard requestId={message.sharedRequestId} />}
            {message.body && (
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  isMe ? "bg-primary text-primary-foreground" : "bg-accent-surface text-text",
                )}
              >
                <p className="break-words">{message.body}</p>
              </div>
            )}
            {reactions.length > 0 && (
              <div className={cn("absolute -bottom-2.5 flex gap-0.5", isMe ? "right-1" : "left-1")}>
                {reactions.map((reaction) => (
                  <span
                    key={reaction.userId}
                    data-reaction-emoji={reaction.emoji}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[11px] leading-none shadow-sm"
                  >
                    {reaction.emoji}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!isDeleted && !isEditingHere && iconButtons}
      </div>

      <div className={cn("mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-muted", isMe && "flex-row-reverse")}>
        <span>
          {formatRelativeTime(message.createdAt)}
          {message.editedAt && !isDeleted && " · düzenlendi"}
        </span>
      </div>
    </div>
  );
}
