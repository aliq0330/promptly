"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ComposeSheet } from "@/features/content/compose";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import type { UseTagPickerResult } from "@/features/prompts/use-tag-picker";
import { CONTENT_TYPE_IDS } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import type { PromptContentType, UserProfile } from "@/types";

const chipClassName =
  "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * Türü gösteren hap (Görsel ⌄ · Metin · Ses · Video): dokununca "Ne üretiyorsun?" alt sayfası açılır. Düzenlemede tür değişmez:
 * hap pasiftir ve ok çizilmez.
 */
export function ContentTypePicker({ value, onChange, locked = false }: { value: PromptContentType; onChange: (next: PromptContentType) => void; locked?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const meta = CONTENT_TYPE_META[value];
  return (
    <>
      <button
        type="button"
        disabled={locked}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${t("taxonomy.contentTypeFilter")}: ${t(meta.labelKey)}`}
        data-compose-type-pill={value}
        className={cn(
          chipClassName,
          "mt-1 border-border-strong bg-surface font-semibold text-text-secondary",
          locked ? "cursor-default" : "hover:border-primary/50 hover:text-text",
        )}
      >
        <meta.icon size={15} strokeWidth={1.9} aria-hidden className="text-primary" />
        {t(meta.labelKey)}
        {!locked && <ChevronDown size={14} aria-hidden className="text-text-muted" />}
      </button>
      {open && (
        <ComposeSheet id="type" title={t("compose.whatMaking")} onClose={() => setOpen(false)}>
          <div role="radiogroup" aria-label={t("taxonomy.contentTypeFilter")} className="divide-y divide-border-soft">
            {CONTENT_TYPE_IDS.map((type) => {
              const option = CONTENT_TYPE_META[type];
              const selected = type === value;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-taxonomy-type={type}
                  onClick={() => {
                    onChange(type);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <option.icon size={20} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-text">{t(option.labelKey)}</span>
                    <span className="block text-caption text-text-muted">{t(TYPE_SUB_KEY[type])}</span>
                  </span>
                  <span aria-hidden className={cn("h-5 w-5 shrink-0 rounded-full border-2", selected ? "border-[6px] border-primary" : "border-border-strong")} />
                </button>
              );
            })}
          </div>
        </ComposeSheet>
      )}
    </>
  );
}

const TYPE_SUB_KEY: Record<PromptContentType, TranslationKey> = {
  image: "compose.typeSub.image",
  text: "compose.typeSub.text",
  audio: "compose.typeSub.audio",
  video: "compose.typeSub.video",
};

/**
 * Yazma ekranının gövdesi (docs/history/216-*): üstte avatar + ad + tür hapı, hemen altında araç satırı (`toolbar`, yazıdan ÖNCE —
 * iOS klavyesi açılınca görünür alanın üstünde kalır), altında tam genişlikte yazı alanı. Kim görecek bilgisi yalnız son kontrol
 * penceresindedir; yalnız topluluğa yazarken adın yanında hedef topluluk görünür.
 */
export function ComposeBody({
  profile,
  audienceLabel,
  onAudience,
  typeSlot,
  toolbar,
  children,
}: {
  profile: UserProfile | null;
  /** Yalnız bir topluluğa yazılırken verilir ("Ali · Açık Topluluk"); dokununca son kontrol penceresi açılır. */
  audienceLabel?: string;
  onAudience?: () => void;
  typeSlot?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-compose-body="">
      <div className="flex items-start gap-3">
        <Avatar src={profile?.avatarUrl ?? null} alt={profile?.displayName ?? ""} size={44} className="shrink-0" />
        <div className="min-w-0 pt-0.5">
          <p className="truncate text-body font-bold text-text">
            {profile?.displayName ?? ""}
            {audienceLabel && (
              <>
                <span className="font-normal text-text-muted"> · </span>
                <button type="button" onClick={onAudience} data-compose-audience="" className="font-medium text-text-muted underline-offset-2 hover:text-text hover:underline">
                  {audienceLabel}
                </button>
              </>
            )}
          </p>
          {typeSlot}
        </div>
      </div>
      {toolbar && <div className="mt-3">{toolbar}</div>}
      <div className="space-y-3 px-0.5 pt-4">{children}</div>
    </div>
  );
}

/** Başlık ve metinden gelen etiket önerileri, yazma ekranında görünür kalır; dokununca eklenir (hiçbiri kendiliğinden değil). */
export function SuggestedTagsRow({ picker, max = 4 }: { picker: UseTagPickerResult; max?: number }) {
  const { t } = useTranslation();
  const list = picker.suggested.slice(0, max);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-compose-suggested="">
      <span className="text-caption text-text-muted">{t("compose.suggested")}</span>
      {list.map((tag) => (
        <button
          key={tag.slug}
          type="button"
          disabled={picker.acceptingSlug === tag.slug}
          onClick={() => void picker.acceptSuggested(tag)}
          data-compose-suggestion={tag.slug}
          className={cn(chipClassName, "border-dashed border-border-strong text-text-secondary hover:border-primary/50 hover:text-primary disabled:opacity-60")}
        >
          <Plus size={13} aria-hidden />#{tag.label}
        </button>
      ))}
    </div>
  );
}
