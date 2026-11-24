"use client";

import type { CSSProperties, ReactNode } from "react";
import { Check } from "@/components/icons/check";
import { radioGroupKeyDown, radioTabIndex } from "@/components/ui/radio-keys";
import { cn } from "@/lib/utils";

export interface SwatchOption<K extends string> {
  key: K;
  /** The colour's name — the swatch has no text, so this is its accessible name. */
  label: string;
  /** Classes that paint the swatch (a `bg-*` dot class). */
  className?: string;
  /** Inline paint for a swatch drawn from a CSS variable (`background: var(--…)`). */
  style?: CSSProperties;
  /** A drawn mark instead of a flat colour (the team monogram); use with `size="auto"`. */
  children?: ReactNode;
  attrs?: { [data: `data-${string}`]: string | undefined };
}

const SIZE_CLASS = { md: "h-9 w-9 rounded-full", sm: "h-6 w-6 rounded-full", auto: "rounded-xl p-0.5" } as const;

/**
 * Pick ONE colour / tone (team colour, note colour, line colour — docs/history/453-*): round swatches, the chosen one wears a ring (2 px gap + 2 px
 * `primary`) and a tick when the swatch is a flat colour. `md` is the 36 px form field, `sm` a toolbar swatch (keeps a ≥ 36 px touch area through
 * `tap-area`), `auto` wraps a mark that sizes itself. Arrow keys move + select, like every radio group.
 */
export function SwatchGroup<K extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "md",
  disabled,
  className,
}: {
  value: K | null;
  options: SwatchOption<K>[];
  onChange: (key: K) => void;
  ariaLabel: string;
  size?: keyof typeof SIZE_CLASS;
  disabled?: boolean;
  className?: string;
}) {
  const anyChecked = options.some((option) => option.key === value);
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={radioGroupKeyDown} className={cn("flex flex-wrap items-center", size === "sm" ? "gap-1" : "gap-2", className)}>
      {options.map((option, index) => {
        const checked = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            tabIndex={radioTabIndex(index, checked, anyChecked)}
            disabled={disabled}
            onClick={() => !checked && onChange(option.key)}
            data-small-target={size === "sm" ? "" : undefined}
            style={option.style}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
              SIZE_CLASS[size],
              option.className,
              checked && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
            )}
            {...option.attrs}
          >
            {option.children}
            {checked && !option.children && <Check size={size === "sm" ? 12 : 16} aria-hidden className="text-background" />}
          </button>
        );
      })}
    </div>
  );
}
