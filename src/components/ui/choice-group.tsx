"use client";

import { ScrollRow } from "@/components/ui/scroll-row";
import { cn } from "@/lib/utils";

/**
 * Pick ONE value from a few options (a role, a duration, a mode, a notification level — docs/history/403-*): a `radiogroup`, not a tab list.
 * Tabs (`components/ui/tabs.tsx`) navigate between panels; this chooses a value. Two looks, one behaviour:
 *   - `pill` (default)  separate pills that scroll on a narrow screen (the selected pill is the blue `primary-soft` one);
 *   - `segmented`       a small joined switch on a soft ground for 2–3 short options that share a row (`value` may be `null` = mixed, nothing highlighted).
 */
export function ChoiceGroup<K extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  variant = "pill",
  disabled,
  testId,
}: {
  value: K | null;
  options: { key: K; label: string; hint?: string }[];
  onChange: (key: K) => void;
  ariaLabel: string;
  variant?: "pill" | "segmented";
  disabled?: boolean;
  testId?: string;
}) {
  const buttons = options.map((option) => {
    const selected = option.key === value;
    return (
      <button
        key={option.key}
        type="button"
        role="radio"
        aria-checked={selected}
        title={option.hint}
        disabled={disabled}
        data-segment={variant === "segmented" ? option.key : undefined}
        onClick={() => !selected && onChange(option.key)}
        className={cn(
          "rounded-full text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
          variant === "pill"
            ? cn("min-h-9 shrink-0 whitespace-nowrap border px-4", selected ? "border-primary bg-primary-soft font-medium text-primary" : "border-border-soft bg-surface text-text-secondary hover:bg-surface-soft")
            : cn("h-9 min-w-0 flex-1 truncate px-2", selected ? "bg-surface font-semibold text-primary shadow-xs" : "font-medium text-text-secondary hover:text-text"),
        )}
      >
        {option.label}
      </button>
    );
  });
  if (variant === "segmented") {
    return (
      <div role="radiogroup" aria-label={ariaLabel} data-segmented={testId} className="flex rounded-full bg-surface-soft p-0.5">
        {buttons}
      </div>
    );
  }
  return (
    <ScrollRow role="radiogroup" aria-label={ariaLabel} className="gap-2 md:flex-wrap">
      {buttons}
    </ScrollRow>
  );
}
