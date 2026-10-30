"use client";

import { Plus } from "lucide-react";
import { useComposeStudio } from "@/features/content/compose-form";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import type { UseTagPickerResult } from "@/features/prompts/use-tag-picker";
import { CONTENT_TYPE_IDS } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { PromptContentType } from "@/types";

const chipClassName =
  "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * "Ne üretiyorsun?" (docs/history/244-*): Görsel · Metin · Ses · Video, satır içi seçenek düğmeleri (eskiden hap + alt sayfaydı).
 * Düzenlemede tür değişmez: seçili olmayanlar pasiftir.
 */
export function ContentTypePicker({ value, onChange, locked = false }: { value: PromptContentType; onChange: (next: PromptContentType) => void; locked?: boolean }) {
  const { t } = useTranslation();
  const studio = useComposeStudio();
  return (
    <div role="radiogroup" aria-label={t("compose.whatMaking")} data-compose-type={value} className={cn("flex gap-1.5", studio ? "flex-nowrap overflow-x-auto scrollbar-none lg:flex-wrap" : "flex-wrap gap-2")}>
      {CONTENT_TYPE_IDS.map((type) => {
        const option = CONTENT_TYPE_META[type];
        const selected = type === value;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={locked && !selected}
            data-taxonomy-type={type}
            onClick={() => onChange(type)}
            className={cn(
              chipClassName,
              studio ? "min-h-9 shrink-0 px-3.5 text-[0.8125rem] font-semibold disabled:opacity-50" : "min-h-11 px-3 text-body font-medium disabled:opacity-50 sm:px-4",
              selected
                ? cn("border-primary bg-primary-soft text-primary", !studio && "font-bold")
                : "border-border-strong bg-surface text-text-secondary hover:border-primary/50 hover:text-text",
              studio && !selected && "border-border",
            )}
          >
            {(!studio || selected) && <option.icon size={16} strokeWidth={1.9} aria-hidden />}
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

/** Başlık ve metinden gelen etiket önerileri, yazma ekranında görünür kalır; dokununca eklenir (hiçbiri kendiliğinden değil). */
export function SuggestedTagsRow({ picker, max = 4 }: { picker: UseTagPickerResult; max?: number }) {
  const { t } = useTranslation();
  const studio = useComposeStudio();
  const list = picker.suggested.slice(0, max);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-compose-suggested="">
      <span className={cn("text-text-muted", studio ? "text-[0.75rem]" : "text-caption")}>{t("compose.suggested")}</span>
      {list.map((tag) => (
        <button
          key={tag.slug}
          type="button"
          disabled={picker.acceptingSlug === tag.slug}
          onClick={() => void picker.acceptSuggested(tag)}
          data-compose-suggestion={tag.slug}
          className={cn(chipClassName, "border-dashed border-border-strong text-text-secondary hover:border-primary/50 hover:text-primary disabled:opacity-60", studio && "min-h-7 px-2.5 text-[0.75rem] font-semibold")}
        >
          {!studio && <Plus size={13} aria-hidden />}#{tag.label}
        </button>
      ))}
    </div>
  );
}
