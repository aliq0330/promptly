"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Search } from "@/components/icons/search";
import { X } from "@/components/icons/x";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * The one search box (docs/history/406-*): the `Input` look (control border, 44 px / `dense` 40 px) with the magnifier inside and a clear
 * button once there is text. The focus ring is the input's own. `data-*` attributes go to the wrapper (tests and anchors); everything
 * else goes to the `<input>`. Boxes that parse chips (`AdvancedSearchBox`) or live on a canvas (`board-search`) are different tools.
 */
export const SearchField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
    value: string;
    onChange: (value: string) => void;
    dense?: boolean;
    /** Accessible name of the clear button; the clear button is drawn only when it is given. */
    clearLabel?: string;
    /** Draw the clear button even while the box is empty (a box that the button also closes). */
    alwaysClear?: boolean;
    /** Called after the clear button emptied the box (close the box, refocus…). */
    onClear?: () => void;
    wrapperClassName?: string;
    [data: `data-${string}`]: string | undefined;
  }
>(function SearchField({ value, onChange, dense, clearLabel, alwaysClear, onClear, wrapperClassName, className, placeholder, "aria-label": ariaLabel, ...rest }, ref) {
  const wrapperProps: Record<string, unknown> = {};
  const inputProps: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rest)) (key.startsWith("data-") ? wrapperProps : inputProps)[key] = val;
  return (
    <div className={cn("relative min-w-0", wrapperClassName)} {...wrapperProps}>
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
      <Input
        ref={ref}
        type="search"
        dense={dense}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        enterKeyHint="search"
        className={cn("pl-10", clearLabel && "pr-10", "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden", className)}
        {...inputProps}
      />
      {clearLabel && (value || alwaysClear) && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          aria-label={clearLabel}
          className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-sm text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
});
