"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ImagePlus, Loader2, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ALLOWED_IMAGE_MIME } from "@/lib/supabase/message-images";
import { ComposerEmojiPicker } from "./composer-emoji-picker";
import type { ComposerImage } from "./use-composer-images";

const ACCEPT = ALLOWED_IMAGE_MIME.join(",");

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
 * The message composer: `[photo] [ text … ] [emoji]  [Send]`. Photos are
 * only STAGED here (preview strip above the input) — nothing is uploaded or
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
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const closeEmoji = useCallback(() => setEmojiOpen(false), []);

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
    selectionRef.current = { start: caret, end: caret };
    // Desktop: keep typing flow. On phones the sheet stays open, and focusing here would pop the keyboard over it.
    if (window.matchMedia("(min-width: 768px)").matches) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(caret, caret);
      });
    }
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
      className="relative border-t border-border-soft bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 lg:px-6"
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary-soft/80 text-sm font-medium text-text">
          {t("messages.dropPhotosHere")}
        </div>
      )}
      {banners}
      {images.length > 0 && (
        <ul className="mb-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label={t("messages.selectedPhotos")}>
          {images.map((image, index) => (
            <li key={image.key} className="relative h-16 w-16 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img
                src={image.previewUrl}
                alt={t("messages.selectedPhotoAlt", { index: index + 1 })}
                className="h-full w-full rounded-xl border border-border-soft object-cover"
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
        <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-lg bg-warning/10 px-3 py-1.5 text-xs text-warning">
          <span>{imageNotice}</span>
          <button type="button" onClick={onDismissNotice} aria-label={t("common.close")} className="shrink-0">
            <X size={12} aria-hidden />
          </button>
        </p>
      )}
      <div className="flex items-end gap-2">
        <div
          className={cn(
            "relative flex min-w-0 flex-1 items-end gap-0.5 rounded-3xl border border-border-soft bg-background px-1.5 py-1 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15",
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label={t("messages.addPhoto")}
            title={t("messages.addPhoto")}
            className={iconButton}
          >
            <ImagePlus size={20} aria-hidden />
          </button>
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
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={disabled}
            enterKeyHint="enter"
            className="max-h-32 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-[7px] text-sm leading-[1.4] text-text placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            ref={emojiButtonRef}
            type="button"
            onClick={() => {
              rememberSelection();
              setEmojiOpen((open) => !open);
            }}
            disabled={disabled}
            aria-label={t("messages.addEmoji")}
            title={t("messages.addEmoji")}
            aria-haspopup="dialog"
            aria-expanded={emojiOpen}
            className={iconButton}
          >
            <Smile size={20} aria-hidden />
          </button>
          {emojiOpen && <ComposerEmojiPicker onPick={insertEmoji} onClose={closeEmoji} anchorRef={emojiButtonRef} />}
        </div>
        <Button type="submit" disabled={!canSend || disabled} aria-label={t("messages.sendMessageAria")} className="h-11 shrink-0">
          {isSending ? t("messages.sendingEllipsis") : t("common.send")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
