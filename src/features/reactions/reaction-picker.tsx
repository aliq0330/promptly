"use client";

import { useRef, type CSSProperties, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { REACTION_KEYS, REACTION_LABEL, type ReactionKey } from "@/lib/reactions";
import { ReactionIcon, type ReactionIconHandle } from "./reaction-icon";

/**
 * The six-reaction picker (docs/history/265-*): a rounded panel above (or below) the reaction button — placement comes from
 * `useAnchoredPopover` (portalled, `position: fixed`, kept inside the visible area), this is only its content. Each emoji plays Telegram's
 * animation under the finger / pointer; the viewer's current reaction is highlighted, and picking it again plays it again.
 */
export function ReactionPicker({
  panelRef,
  style,
  current,
  onChoose,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  current: ReactionKey | null;
  /** `null` = take the reaction back. */
  onChoose: (reaction: ReactionKey | null) => void;
}) {
  const { t } = useTranslation();
  const icons = useRef<Partial<Record<ReactionKey, ReactionIconHandle | null>>>({});

  function moveFocus(event: React.KeyboardEvent, delta: number) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + delta + items.length) % items.length]?.focus();
    event.preventDefault();
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={t("reaction.pickerAria")}
      style={style}
      // The panel is a React child of the card it was opened from (a portal keeps the tree): its clicks must not reach the card.
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") moveFocus(event, 1);
        else if (event.key === "ArrowLeft") moveFocus(event, -1);
      }}
      className="z-[75] w-[min(calc(100vw-16px),400px)] animate-pop-in rounded-[28px] border border-border-soft bg-surface p-2 shadow-pop"
    >
      <div className="grid grid-cols-6 gap-0.5">
        {REACTION_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="menuitem"
            aria-current={current === key ? "true" : undefined}
            onClick={() => onChoose(key)}
            onPointerEnter={() => icons.current[key]?.play()}
            className={cn(
              "group flex min-w-0 flex-col items-center gap-0.5 rounded-[20px] pb-1.5 pt-2 text-caption transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              current === key ? "bg-primary-soft text-primary" : "text-text-muted hover:bg-surface-soft hover:text-text",
            )}
          >
            <ReactionIcon
              ref={(handle) => {
                icons.current[key] = handle;
              }}
              reaction={key}
              size={40}
              className="transition-transform duration-200 ease-soft group-hover:-translate-y-0.5 group-hover:scale-[1.18] group-active:scale-[1.18]"
            />
            <span className="max-w-full truncate leading-tight">{t(REACTION_LABEL[key])}</span>
          </button>
        ))}
      </div>
      {current && (
        <button
          type="button"
          role="menuitem"
          onClick={() => onChoose(null)}
          className="mt-1 w-full rounded-b-[20px] border-t border-border-soft pb-1.5 pt-2.5 text-small font-semibold text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("reaction.remove")}
        </button>
      )}
    </div>
  );
}
