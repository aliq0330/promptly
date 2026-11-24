"use client";

import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Check } from "@/components/icons/check";
import type { IconComponent } from "@/components/icons/icon";
import { radioGroupKeyDown, radioTabIndex } from "@/components/ui/radio-keys";
import { cn } from "@/lib/utils";

export interface MenuRadioItem<K extends string> {
  key: K;
  label: ReactNode;
  icon?: IconComponent;
  /** Quiet trailing text (a count of results). */
  meta?: ReactNode;
  /** A small blue count bubble (unseen things). */
  count?: ReactNode;
  /** A hairline above this row (a second group inside the same menu). */
  dividerBefore?: boolean;
  /** Rendered under the row while it is the selected one (a category's subcategories). */
  below?: ReactNode;
  /** `data-*` attributes put on the radio button. */
  attrs?: { [data: `data-${string}`]: string | undefined };
}

/**
 * The rows of a menu or sheet list that pick ONE value (a section, a sort order, a category — docs/history/453-*): the selected row is the soft
 * blue one in semibold with a tick at the end. Pressing a row always calls `onChange` (a menu closes on it; a filter list toggles the category off).
 * `size="lg"` is the section menu's 48 px row. A menu that owns its own arrow-key model passes `onKeyDown` (focus moves, nothing is selected).
 */
export function MenuRadioGroup<K extends string>({
  value,
  items,
  onChange,
  ariaLabel,
  labelledBy,
  size = "md",
  onKeyDown,
  groupRef,
  className,
}: {
  value: K | null;
  items: MenuRadioItem<K>[];
  onChange: (key: K) => void;
  ariaLabel?: string;
  labelledBy?: string;
  size?: "md" | "lg";
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  groupRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  const anyChecked = items.some((item) => item.key === value);
  return (
    <div ref={groupRef} role="radiogroup" aria-label={ariaLabel} aria-labelledby={labelledBy} onKeyDown={onKeyDown ?? radioGroupKeyDown} className={cn("space-y-0.5", className)}>
      {items.map((item, index) => {
        const selected = item.key === value;
        const Icon = item.icon;
        return (
          <div key={item.key} className={cn(item.dividerBefore && "mt-1 border-t border-border-soft pt-1")}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={radioTabIndex(index, selected, anyChecked)}
              onClick={() => onChange(item.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                size === "lg" ? "min-h-12 text-body" : "min-h-11 text-label",
                selected ? "bg-primary-soft font-semibold text-text" : "text-text-secondary hover:bg-surface-soft",
              )}
              {...item.attrs}
            >
              {Icon && <Icon size={20} aria-hidden className="shrink-0 text-text-muted" />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.meta ? (
                <span data-section-meta="" className="text-small tabular-nums text-text-muted">
                  {item.meta}
                </span>
              ) : null}
              {item.count ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground">{item.count}</span> : null}
              {selected && <Check size={size === "lg" ? 20 : 16} aria-hidden className="shrink-0 text-primary" />}
            </button>
            {selected && item.below}
          </div>
        );
      })}
    </div>
  );
}
