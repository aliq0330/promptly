"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

const STAR_ON = "fill-warning text-warning";
const STAR_OFF = "fill-transparent text-border-strong";

/** 1–5 yıldız, yalnız gösterim (Space puanı, docs/history/242-*). `value` yuvarlanarak dolar; ortalama yazıyla ayrıca gösterilir. */
export function StarRatingDisplay({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  const { t } = useTranslation();
  const filled = Math.round(value);
  return (
    <span role="img" aria-label={t("spaces.rating.starAria", { count: filled })} className={cn("inline-flex items-center gap-px align-middle", className)} data-star-rating={filled}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} strokeWidth={1.75} className={n <= filled ? STAR_ON : STAR_OFF} aria-hidden />
      ))}
    </span>
  );
}

/**
 * Seçilebilir yıldızlar: üzerine gelince önizler, dokununca seçer, seçili yıldıza yeniden dokunmak puanı temizler (`allowClear`).
 * `radiogroup` olarak okunur; klavye ile Tab → Boşluk/Enter. `disabled` iken yalnız gösterir.
 */
export function StarRatingInput({
  value,
  onChange,
  size = 28,
  disabled = false,
  allowClear = true,
  label,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  disabled?: boolean;
  allowClear?: boolean;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label={label ?? t("spaces.rating.pick")} className={cn("inline-flex items-center", className)} onMouseLeave={() => setHover(0)} data-star-input={value}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={t("spaces.rating.starAria", { count: n })}
          disabled={disabled}
          onMouseEnter={() => !disabled && setHover(n)}
          onClick={() => onChange(allowClear && n === value ? 0 : n)}
          className="rounded-md p-0.5 transition-transform hover:scale-110 disabled:cursor-default disabled:hover:scale-100"
        >
          <Star size={size} strokeWidth={1.75} className={cn("transition-colors", n <= shown ? STAR_ON : STAR_OFF)} aria-hidden />
        </button>
      ))}
    </div>
  );
}
