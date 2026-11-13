"use client";

import { SendArrowIcon } from "@/components/ui/motion-icons";
import { useCompletionSeq } from "@/lib/use-motion-seq";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Keyboard } from "@/components/icons/keyboard";
import { Loader2 } from "@/components/icons/loader-2";
import { Plus } from "@/components/icons/plus";
import { Smile } from "@/components/icons/smile";
import { X } from "@/components/icons/x";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ALLOWED_IMAGE_MIME } from "@/lib/supabase/message-images";
import { ChatAttachSheet } from "./chat-attach";
import { GifPicker } from "@/features/gif/gif-picker";
import type { GifItem } from "@/lib/giphy";
import { ComposerEmojiPicker, useIsWideComposer } from "./composer-emoji-picker";
import type { CommunityPostType } from "@/lib/supabase/communities";
import type { ComposerImage } from "./use-composer-images";

const ACCEPT = ALLOWED_IMAGE_MIME.join(",");

/** Removes the selection, or the last user-visible character (a whole emoji, flags/ZWJ sequences included) before the caret. */
function deleteBackward(text: string, start: number, end: number): { text: string; caret: number } {
  if (start !== end) return { text: text.slice(0, start) + text.slice(end), caret: start };
  if (start === 0) return { text, caret: 0 };
  const before = text.slice(0, start);
  let cut = start - 1;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    let last = 0;
    for (const { index } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(before)) last = index;
    cut = last;
  } else {
    cut = start - (Array.from(before).at(-1)?.length ?? 1);
  }
  return { text: text.slice(0, cut) + text.slice(start), caret: cut };
}

function imageFilesFrom(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file.name));
}

/**
 * Drag-and-drop for a whole container (desktop). Counts enter/leave pairs
 * because `dragleave` also fires when the pointer moves onto a child.
 */
export function useImageDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [isDragging, setIsDragging] = useState(false);
  const depth = useRef(0);

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

  return {
    isDragging,
    handlers: {
      onDragEnter(event: DragEvent) {
        if (!enabled || !hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setIsDragging(true);
      },
      onDragOver(event: DragEvent) {
        if (!enabled || !hasFiles(event)) return;
        event.preventDefault();
      },
      onDragLeave(event: DragEvent) {
        if (!enabled || !hasFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setIsDragging(false);
      },
      onDrop(event: DragEvent) {
        if (!enabled || !hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setIsDragging(false);
        const files = imageFilesFrom(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      },
    },
  };
}

/**
 * The message composer (docs/history/268-*): `[+] [ text … 😊 ] [↑]`. "+" opens the attach sheet (photo · import a prompt file · share from the
 * library); photos are only STAGED here (preview strip above the input) — nothing is uploaded or
 * sent until the user presses Send. Enter sends on desktop (Shift+Enter =
 * new line); on touch devices Enter stays a newline. Banners (blocked /
 * replying / sharing) come in through `banners` so this component doesn't
 * need to know about them.
 */
export function MessageComposer({
  draft,
  onDraftChange,
  placeholder,
  disabled,
  canSend,
  isSending,
  onSubmit,
  images,
  imageNotice,
  onAddFiles,
  onRemoveImage,
  onDismissNotice,
  banners,
  error,
  dragActive,
  onPickLibrary,
  onImport,
  onPickGif,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  placeholder: string;
  /** Blocked conversation — the whole composer is inert. */
  disabled: boolean;
  canSend: boolean;
  isSending: boolean;
  onSubmit: (event: FormEvent) => void;
  images: ComposerImage[];
  imageNotice: string | null;
  onAddFiles: (files: File[]) => void;
  onRemoveImage: (key: string) => void;
  onDismissNotice: () => void;
  banners?: ReactNode;
  error?: string | null;
  /** Whether a file is being dragged over the conversation — shows the drop hint. */
  dragActive: boolean;
  /** "+" → Kütüphaneden paylaş: seçilen türün seçicisini açar (yoksa o satır çizilmez ve "+" yalnız fotoğraf ekler). */
  onPickLibrary?: (type: CommunityPostType) => void;
  /** "+" → Prompt içe aktar. */
  onImport?: () => void;
  /** "+" → GIF (docs/history/308-*): GIPHY seçicisini açar; seçilen GIF'i çağıran GÖNDERİR (taslak metne dokunulmaz). Yoksa GIF satırı çizilmez. */
  onPickGif?: (gif: GifItem) => void;
}) {
  const { t } = useTranslation();
  const sendSeq = useCompletionSeq(isSending);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const hasSheet = Boolean(onPickLibrary || onImport || onPickGif);
  const wide = useIsWideComposer();
  /** Phone panel: the message list's distance from its bottom, kept across the panel opening/closing (the list shrinks/grows). */
  const listAnchorRef = useRef<{ el: HTMLElement; fromBottom: number } | null>(null);
  const emojiPanel = emojiOpen && !wide;

  const toggleEmoji = useCallback((open: boolean) => {
    const list = formRef.current?.parentElement?.querySelector<HTMLElement>("[data-chat-scroll]");
    listAnchorRef.current = list ? { el: list, fromBottom: list.scrollHeight - list.scrollTop - list.clientHeight } : null;
    setEmojiOpen(open);
  }, []);
  const closeEmoji = useCallback(() => toggleEmoji(false), [toggleEmoji]);

  // Keep the visible end of the thread in place while the phone panel takes/returns space under the input.
  useLayoutEffect(() => {
    const anchor = listAnchorRef.current;
    listAnchorRef.current = null;
    if (!anchor) return;
    anchor.el.scrollTop = anchor.el.scrollHeight - anchor.el.clientHeight - anchor.fromBottom;
  }, [emojiPanel]);

  // Grow with the content up to ~5 lines, then scroll inside.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  function rememberSelection() {
    const el = textareaRef.current;
    if (el) selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
  }

  function insertEmoji(emoji: string) {
    const { start, end } = selectionRef.current;
    const from = Math.min(start, draft.length);
    const to = Math.min(end, draft.length);
    onDraftChange(draft.slice(0, from) + emoji + draft.slice(to));
    const caret = from + emoji.length;
    placeCaret(caret, from + emoji.length >= draft.length);
  }

  function handleBackspace() {
    const { start, end } = selectionRef.current;
    const next = deleteBackward(draft, Math.min(start, draft.length), Math.min(end, draft.length));
    if (next.text === draft) return;
    onDraftChange(next.text);
    placeCaret(next.caret, next.caret >= next.text.length);
  }

  /** After an emoji insert/delete. Desktop keeps the typing flow (focus); on phones the panel replaces the keyboard, so the input is NOT focused (that would pop the keyboard) — its end is just scrolled into view. */
  function placeCaret(caret: number, atEnd: boolean) {
    selectionRef.current = { start: caret, end: caret };
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      if (wide) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(caret, caret);
      } else if (atEnd) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  function handleEmojiButton() {
    if (wide) {
      rememberSelection();
      toggleEmoji(!emojiOpen);
      return;
    }
    if (emojiOpen) {
      // Keyboard button: back to typing at the same caret.
      toggleEmoji(false);
      const el = textareaRef.current;
      if (el) {
        el.focus({ preventScroll: true });
        const { start, end } = selectionRef.current;
        el.setSelectionRange(start, end);
      }
      return;
    }
    rememberSelection();
    textareaRef.current?.blur(); // the panel takes the keyboard's place
    toggleEmoji(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    // Only a real keyboard (fine pointer) sends on Enter; phones keep it as a newline.
    if (!window.matchMedia("(pointer: fine)").matches) return;
    event.preventDefault();
    if (canSend) formRef.current?.requestSubmit();
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = imageFilesFrom(
      Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file)),
    );
    if (files.length === 0) return;
    event.preventDefault();
    onAddFiles(files);
  }

  const iconButton =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50";

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="relative bg-background px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 lg:px-6"
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary-soft/80 text-small font-medium text-text">
          {t("messages.dropPhotosHere")}
        </div>
      )}
      {banners}
      {images.length > 0 && (
        <ul className="mb-2 flex gap-2 overflow-x-auto pb-1 scrollbar-fine" aria-label={t("messages.selectedPhotos")}>
          {images.map((image, index) => (
            <li key={image.key} className="relative h-16 w-16 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img
                src={image.previewUrl}
                alt={t("messages.selectedPhotoAlt", { index: index + 1 })}
                className="h-full w-full rounded-xl object-cover"
                draggable={false}
              />
              {image.status === "preparing" && (
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60" role="status" aria-label={t("messages.preparingPhoto")}>
                  <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemoveImage(image.key)}
                aria-label={t("messages.removePhoto")}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {imageNotice && (
        <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-lg bg-warning/10 px-3 py-1.5 text-caption text-warning">
          <span>{imageNotice}</span>
          <button type="button" onClick={onDismissNotice} aria-label={t("common.close")} className="shrink-0">
            <X size={12} aria-hidden />
          </button>
        </p>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => (hasSheet ? setAttachOpen(true) : fileInputRef.current?.click())}
          disabled={disabled}
          aria-label={t("messages.attach.title")}
          title={t("messages.attach.title")}
          aria-haspopup={hasSheet ? "dialog" : undefined}
          data-composer-plus
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface text-text transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus size={24} aria-hidden />
        </button>
        <div
          className={cn(
            "relative flex min-w-0 flex-1 items-end gap-0.5 rounded-xl bg-surface px-4 py-1.5 pr-2 transition-shadow duration-200 ease-soft focus-within:ring-2 focus-within:ring-primary/40",
            disabled && "opacity-50",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(event) => {
              const files = imageFilesFrom(event.target.files);
              event.target.value = "";
              if (files.length > 0) onAddFiles(files);
            }}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            onChange={(event) => {
              onDraftChange(event.target.value);
              rememberSelection();
            }}
            onSelect={rememberSelection}
            onKeyUp={rememberSelection}
            onClick={rememberSelection}
            onBlur={rememberSelection}
            // Phones: tapping the input while the emoji panel is open brings the keyboard back in its place.
            onFocus={() => {
              if (emojiPanel) closeEmoji();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={disabled}
            enterKeyHint="enter"
            maxLength={4000}
            className="max-h-32 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-[9px] text-body leading-[1.4] text-text placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            // Keep focus where it is: on a phone a focused input would bring the keyboard over the panel.
            onPointerDown={(event) => event.preventDefault()}
            onClick={handleEmojiButton}
            disabled={disabled}
            aria-label={emojiPanel ? t("messages.showKeyboard") : t("messages.addEmoji")}
            title={emojiPanel ? t("messages.showKeyboard") : t("messages.addEmoji")}
            aria-haspopup={wide ? "dialog" : undefined}
            aria-expanded={emojiOpen}
            data-composer-emoji
            className={iconButton}
          >
            {emojiPanel ? <Keyboard size={20} aria-hidden /> : <Smile size={20} aria-hidden />}
          </button>
          {emojiOpen && wide && <ComposerEmojiPicker variant="popover" onPick={insertEmoji} onClose={closeEmoji} containerRef={formRef} />}
        </div>
        <button
          type="submit"
          disabled={!canSend || disabled}
          aria-label={t("messages.sendMessageAria")}
          title={t("common.send")}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,background-color] duration-200 ease-soft hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50"
        >
          {isSending ? <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <SendArrowIcon size={22} strokeWidth={2.2} seq={sendSeq} />}
        </button>
      </div>
      {emojiPanel && (
        <ComposerEmojiPicker variant="panel" onPick={insertEmoji} onBackspace={handleBackspace} onClose={closeEmoji} containerRef={formRef} />
      )}
      {error && (
        <p role="alert" className="mt-2 text-caption text-danger">
          {error}
        </p>
      )}
      {attachOpen && hasSheet && (
        <ChatAttachSheet
          onClose={() => setAttachOpen(false)}
          onPhoto={() => {
            setAttachOpen(false);
            fileInputRef.current?.click();
          }}
          onGif={
            onPickGif
              ? () => {
                  setAttachOpen(false);
                  setGifOpen(true);
                }
              : undefined
          }
          onImport={
            onImport
              ? () => {
                  setAttachOpen(false);
                  onImport();
                }
              : undefined
          }
          onPickType={
            onPickLibrary
              ? (type) => {
                  setAttachOpen(false);
                  onPickLibrary(type);
                }
              : undefined
          }
        />
      )}
      {gifOpen && onPickGif && (
        <GifPicker
          onClose={() => setGifOpen(false)}
          onPick={(gif) => {
            setGifOpen(false);
            onPickGif(gif);
          }}
        />
      )}
    </form>
  );
}
