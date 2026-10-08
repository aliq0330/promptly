"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { EMOJI_CATEGORIES, readRecentEmojis, rememberEmoji } from "./emoji-data";

const RECENT_ID = "recent";

/** `true` from the tablet breakpoint up (matches the app shell's `md`), where the picker is a popover above the input; below it, a bottom sheet. */
function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

function PickerBody({ onPick, compact }: { onPick: (emoji: string) => void; compact: boolean }) {
  const { t } = useTranslation();
  const [recents, setRecents] = useState<string[]>([]);
  const [active, setActive] = useState<string>(EMOJI_CATEGORIES[0].id);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readRecentEmojis();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable on the client, after mount
    setRecents(stored);
    if (stored.length > 0) setActive(RECENT_ID);
  }, []);

  const tabs = [
    ...(recents.length > 0 ? [{ id: RECENT_ID, label: t("emoji.catRecent"), icon: null as string | null, emojis: recents }] : []),
    ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, label: t(c.labelKey), icon: c.icon as string | null, emojis: c.emojis })),
  ];
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  function pick(emoji: string) {
    setRecents(rememberEmoji(emoji));
    onPick(emoji);
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div role="tablist" aria-label={t("emoji.categories")} className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border-soft px-1.5 py-1.5 scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current.id}
            aria-label={tab.label}
            title={tab.label}
            onClick={() => {
              setActive(tab.id);
              gridRef.current?.scrollTo({ top: 0 });
            }}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none transition-colors focus-visible:outline-2 focus-visible:outline-primary",
              tab.id === current.id ? "bg-primary-soft" : "hover:bg-surface-soft",
            )}
          >
            {tab.icon ?? <Clock size={16} aria-hidden />}
          </button>
        ))}
      </div>
      <div
        ref={gridRef}
        role="group"
        aria-label={current.label}
        className={cn("grid grid-cols-8 content-start gap-0.5 overflow-y-auto overscroll-contain p-1.5", compact ? "h-56" : "h-64")}
      >
        {current.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => pick(emoji)}
            aria-label={emoji}
            className="flex h-9 items-center justify-center rounded-lg text-xl leading-none transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The composer's emoji picker: a compact popover anchored above the input on
 * tablet/desktop, a bottom sheet on phones (the shared `Modal`, which also
 * locks page scroll and closes on Escape). Categories + recents; emoji are
 * inserted at the caret by the parent via `onPick`.
 */
export function ComposerEmojiPicker({
  onPick,
  onClose,
  anchorRef,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** The emoji button — clicks on it are ignored by the outside-click handler (its own onClick toggles). */
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const wide = useIsWide();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wide) return;
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [wide, onClose, anchorRef]);

  if (wide) {
    return (
      <div
        ref={popoverRef}
        role="dialog"
        aria-label={t("emoji.pickerTitle")}
        className="absolute bottom-full right-0 z-30 mb-2 w-[20rem] animate-pop-in overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-pop"
      >
        <PickerBody onPick={onPick} compact={false} />
      </div>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="emoji-sheet-title">
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 id="emoji-sheet-title" className="text-sm font-semibold text-text">
            {t("emoji.pickerTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t("common.done")}
          </button>
        </div>
        <PickerBody onPick={onPick} compact />
      </div>
    </Modal>
  );
}
