"use client";

import type { IconComponent } from "@/components/icons/icon";
import { radioGroupKeyDown, radioTabIndex } from "@/components/ui/radio-keys";
import { cn } from "@/lib/utils";

export interface ChoiceOption<K extends string> {
  key: K;
  label: string;
  /** One line about this option: the tooltip, and — with `showHint` — the line under the group while it is selected. */
  hint?: string;
  icon?: IconComponent;
  disabled?: boolean;
  /** `data-*` attributes put on the button (tests, analytics). */
  attrs?: { [data: `data-${string}`]: string | undefined };
}

/**
 * Pick ONE value from a few SHORT options (a role, a duration, a mode, a notification level — docs/history/403-*, 453-*): a `radiogroup`, not a tab list.
 * Tabs (`components/ui/tabs.tsx`) navigate between panels; this chooses a value. Three looks, one behaviour (arrow keys move + select):
 *   - `pill` (default)  separate pills, the row WRAPS (never scrolls: a selected pill must not hide off-screen). 4+ options or long labels;
 *   - `segmented`       a joined switch on a soft ground for 2–3 short options (`value` may be `null` = mixed, nothing highlighted);
 *   - `tile`            icon over a short name in a grid (Space kind, story audience, content type): the icon carries part of the choice.
 * Options that need their own description are `OptionGroup` (`option-group.tsx`); picking several values is a `Chip`; a colour is `SwatchGroup`.
 * `showHint` prints the selected option's `hint` under the group (one line, replaces hand-written "what happens" paragraphs).
 */
export function ChoiceGroup<K extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  labelledBy,
  variant = "pill",
  showHint,
  iconOnly,
  disabled,
  testId,
  className,
}: {
  value: K | null;
  options: ChoiceOption<K>[];
  onChange: (key: K) => void;
  ariaLabel?: string;
  labelledBy?: string;
  variant?: "pill" | "segmented" | "tile";
  showHint?: boolean;
  /** `tile` only: a compact icon-only grid (room icons); the label is the accessible name. */
  iconOnly?: boolean;
  disabled?: boolean;
  testId?: string;
  className?: string;
}) {
  const anyChecked = options.some((option) => option.key === value);
  const buttons = options.map((option, index) => {
    const selected = option.key === value;
    const Icon = option.icon;
    return (
      <button
        key={option.key}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={radioTabIndex(index, selected, anyChecked)}
        title={option.hint}
        aria-label={iconOnly ? option.label : undefined}
        disabled={disabled || option.disabled}
        data-segment={variant === "segmented" ? option.key : undefined}
        data-choice={option.key}
        onClick={() => !selected && onChange(option.key)}
        {...option.attrs}
        className={cn(
          "text-small transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
          variant === "pill" && cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-4", selected ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border-strong bg-surface font-medium text-text-secondary hover:bg-surface-soft"),
          variant === "segmented" && cn("inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 leading-tight", selected ? "bg-surface font-semibold text-primary shadow-xs" : "font-medium text-text-secondary hover:text-text"),
          variant === "tile" && cn("flex flex-col items-center justify-center gap-1.5 rounded-md border text-center leading-tight", iconOnly ? "h-12 px-0" : "min-h-18 px-2 py-2", selected ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border-strong bg-surface font-medium text-text-secondary hover:bg-surface-soft"),
        )}
      >
        {Icon && <Icon size={iconOnly ? 24 : variant === "tile" ? 20 : 16} aria-hidden className="shrink-0" />}
        {!iconOnly && <span className={cn(variant === "segmented" && "min-w-0 break-words")}>{option.label}</span>}
      </button>
    );
  });
  const selectedHint = showHint ? options.find((option) => option.key === value)?.hint : undefined;
  const group = (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      onKeyDown={radioGroupKeyDown}
      data-segmented={variant === "segmented" ? testId : undefined}
      data-choice-group={testId}
      className={cn(
        variant === "pill" && "flex flex-wrap gap-2",
        variant === "segmented" && "flex rounded-full bg-surface-soft p-0.5",
        variant === "tile" && (iconOnly ? "grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2" : "grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2"),
        className,
      )}
    >
      {buttons}
    </div>
  );
  if (!showHint) return group;
  return (
    <div>
      {group}
      <p className="mt-2 min-h-5 text-caption text-text-muted" data-choice-hint="">
        {selectedHint}
      </p>
    </div>
  );
}
