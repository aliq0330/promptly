"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { EMOJI_CATEGORIES, readRecentEmojis, rememberEmoji } from "./emoji-data";

const RECENT_ID = "recent";

/** `true` from the tablet breakpoint up (matches the app shell's `md`), where the picker is a popover above the input; below it, an in-flow panel under the input. */
export function useIsWideComposer(): boolean {
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

function PickerBody({
  onPick,
  onBackspace,
  compact,
}: {
  onPick: (emoji: string) => void;
  /** Panel (phone) only: the keyboard is hidden while the panel is open, so the panel carries its own delete key. */
  onBackspace?: () => void;
  compact: boolean;
}) {
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
      <div className="flex shrink-0 items-center border-b border-border-soft">
        <div role="tablist" aria-label={t("emoji.categories")} className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-1.5 py-1.5 scrollbar-fine">
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
        {onBackspace && (
          <button
            type="button"
            onClick={onBackspace}
            aria-label={t("emoji.backspace")}
            title={t("emoji.backspace")}
            className="mx-1.5 flex h-9 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Delete size={20} aria-hidden />
          </button>
        )}
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
 * The composer's emoji picker. Tablet/desktop: a compact popover anchored
 * above the input (closes on outside click / Escape). Phones: an in-flow
 * panel rendered by the composer UNDER the input row — it takes the
 * keyboard's place, so the input (and the emoji just tapped) stays visible
 * (docs/history/331-*). The composer swaps the emoji button for a keyboard
 * button while the panel is open. Emoji are inserted at the caret by the
 * parent via `onPick`.
 */
export function ComposerEmojiPicker({
  variant,
  onPick,
  onBackspace,
  onClose,
  containerRef,
}: {
  variant: "popover" | "panel";
  onPick: (emoji: string) => void;
  onBackspace?: () => void;
  onClose: () => void;
  /** Clicks inside this element (the composer) don't count as "outside" — its own buttons toggle the picker. */
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(event: PointerEvent) {
      const target = event.target as Node;
      if (pickerRef.current?.contains(target) || containerRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, containerRef]);

  if (variant === "popover") {
    return (
      <div
        ref={pickerRef}
        role="dialog"
        aria-label={t("emoji.pickerTitle")}
        className="absolute bottom-full right-0 z-30 mb-2 w-[20rem] animate-pop-in overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-pop"
      >
        <PickerBody onPick={onPick} compact={false} />
      </div>
    );
  }

  return (
    <div
      ref={pickerRef}
      role="region"
      aria-label={t("emoji.pickerTitle")}
      data-emoji-panel
      className="mt-2 overflow-hidden rounded-2xl bg-surface"
    >
      <PickerBody onPick={onPick} onBackspace={onBackspace} compact />
    </div>
  );
}
