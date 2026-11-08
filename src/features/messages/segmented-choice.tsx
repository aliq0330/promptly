"use client";

import { cn } from "@/lib/utils";

/** Üç seçenekli bildirim düzeyi gibi KÜÇÜK, tek seçimli anahtar (Yön A mockup'ı): dolgulu zeminde beyaz seçili hap. Seçili yoksa (karışık durum) hiçbiri vurgulanmaz. */
export function SegmentedChoice<K extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  testId,
}: {
  value: K | null;
  options: { key: K; label: string }[];
  onChange: (key: K) => void;
  ariaLabel: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} data-segmented={testId} className="flex rounded-full bg-surface-soft p-[3px]">
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-segment={option.key}
            onClick={() => !selected && onChange(option.key)}
            className={cn(
              "h-9 min-w-0 flex-1 truncate rounded-full px-2 text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
              selected ? "bg-surface font-bold text-primary shadow-xs" : "font-medium text-text-secondary hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
