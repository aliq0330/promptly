"use client";

import { Cpu, Folder, Hash, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import type { UseTagPickerResult } from "@/features/prompts/use-tag-picker";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { CONTENT_TYPE_IDS, taxonomyPathLabel } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { PromptContentType, Tag, UserProfile } from "@/types";

const chipClassName =
  "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Yazma ekranının üstündeki tür çipleri (Görsel · Metin · Ses · Video). Düzenlemede tür değişmez: yalnız seçili olan, pasif. */
export function ContentTypeChips({ value, onChange, locked = false }: { value: PromptContentType; onChange: (next: PromptContentType) => void; locked?: boolean }) {
  const { t } = useTranslation();
  const types = locked ? [value] : CONTENT_TYPE_IDS;
  return (
    <div role="radiogroup" aria-label={t("taxonomy.contentTypeFilter")} className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
      {types.map((type) => {
        const meta = CONTENT_TYPE_META[type];
        const selected = type === value;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={locked}
            data-taxonomy-type={type}
            onClick={() => onChange(type)}
            className={cn(
              chipClassName,
              "shrink-0 font-semibold",
              selected ? "border-primary/50 bg-primary-soft text-primary" : "border-border text-text-secondary hover:border-border-strong hover:text-text",
              locked && "cursor-default",
            )}
          >
            <meta.icon size={15} strokeWidth={1.9} aria-hidden />
            {t(meta.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

/** "aliq · Herkese açık": kim olarak ve kime paylaşıldığı; ikinci kısım son kontrol penceresini açar. */
export function ComposeAuthorLine({ profile, audienceLabel, onAudience }: { profile: UserProfile | null; audienceLabel: string; onAudience: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar src={profile?.avatarUrl ?? null} alt={profile?.displayName ?? ""} size={36} />
      <p className="min-w-0 truncate text-small">
        <span className="font-semibold text-text">{profile?.displayName ?? ""}</span>
        <span className="text-text-muted"> · </span>
        <button type="button" onClick={onAudience} data-compose-audience="" className="font-medium text-text-muted underline-offset-2 hover:text-text hover:underline">
          {audienceLabel}
        </button>
      </p>
    </div>
  );
}

/**
 * Seçilenlerin özeti (araç, kategori, etiketler) — dokununca ilgili alt sayfa açılır. Hiçbiri seçilmemişse ilgili "+ …" çipi görünür
 * ki alanın varlığı unutulmasın.
 */
export function ComposeSummaryChips({
  tools,
  contentType,
  category,
  subcategory,
  tags,
  onTools,
  onCategory,
  onTags,
}: {
  tools: string[];
  contentType: PromptContentType;
  category: string | null;
  subcategory: string | null;
  tags: Tag[];
  onTools?: () => void;
  onCategory?: () => void;
  onTags?: () => void;
}) {
  const { t, language } = useTranslation();
  const resolved = resolveToolRefs(tools);
  const path = category ? taxonomyPathLabel({ contentType, category, subcategory }, language, false) : "";
  const set = "border-border bg-surface text-text hover:border-border-strong";
  const empty = "border-dashed border-border text-text-muted hover:border-border-strong hover:text-text";
  return (
    <div className="flex flex-wrap gap-2" data-compose-summary="">
      {onTools &&
        (resolved.length > 0 ? (
          resolved.map((tool) => (
            <button key={tool.ref} type="button" onClick={onTools} className={cn(chipClassName, set)}>
              <Cpu size={14} aria-hidden className="shrink-0 text-text-muted" />
              <span className="truncate">{tool.label}</span>
            </button>
          ))
        ) : (
          <button type="button" onClick={onTools} className={cn(chipClassName, empty)}>
            <Plus size={14} aria-hidden /> {t("compose.toolTool")}
          </button>
        ))}
      {onCategory && (
        <button type="button" onClick={onCategory} className={cn(chipClassName, path ? set : empty)}>
          {path ? <Folder size={14} aria-hidden className="shrink-0 text-text-muted" /> : <Plus size={14} aria-hidden />}
          <span className="truncate">{path || t("compose.toolCategory")}</span>
        </button>
      )}
      {onTags &&
        (tags.length > 0 ? (
          tags.map((tag) => (
            <button key={tag.slug} type="button" onClick={onTags} className={cn(chipClassName, set)}>
              <Hash size={13} aria-hidden className="shrink-0 text-text-muted" />
              <span className="truncate">{tag.label}</span>
            </button>
          ))
        ) : (
          <button type="button" onClick={onTags} className={cn(chipClassName, empty)}>
            <Plus size={14} aria-hidden /> {t("compose.toolTags")}
          </button>
        ))}
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
