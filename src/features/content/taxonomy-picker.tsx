"use client";

import { Chip, ChipRow } from "@/components/ui/chip";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import {
  CONTENT_TYPE_IDS,
  getCategories,
  getSubcategories,
  taxonomyLabel,
  type ContentTypeId,
  type TaxonomySelection,
} from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Create/edit form field for the shared content taxonomy — used by prompt,
 * prompt request and generator forms alike: content type (required) →
 * category (optional, only that type's) → subcategory (optional, only that
 * category's). Nothing below the chosen level is rendered.
 */
export function TaxonomyPicker({
  value,
  onChange,
  lockContentType = false,
  lockedHint,
}: {
  value: TaxonomySelection;
  onChange: (next: TaxonomySelection) => void;
  /** Editing an existing item: the type can't change, category/subcategory still can. */
  lockContentType?: boolean;
  lockedHint?: string;
}) {
  const { t, language } = useTranslation();
  const categories = getCategories(value.contentType);
  const subcategories = getSubcategories(value.contentType, value.category);

  function pickType(type: ContentTypeId) {
    if (type === value.contentType) return;
    onChange({ contentType: type, category: null, subcategory: null });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-text">{t("prompt.contentTypeLabel")}</label>
        {lockContentType ? (
          <div className="flex items-center gap-1.5 text-sm text-text-muted">
            {(() => {
              const Icon = CONTENT_TYPE_META[value.contentType].icon;
              return <Icon size={14} />;
            })()}
            {t(CONTENT_TYPE_META[value.contentType].labelKey)}
            {lockedHint && <span className="text-xs">{lockedHint}</span>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPE_IDS.map((type) => {
              const meta = CONTENT_TYPE_META[type];
              const Icon = meta.icon;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={value.contentType === type}
                  onClick={() => pickType(type)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    value.contentType === type
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-text-muted hover:text-text",
                  )}
                >
                  <Icon size={14} />
                  {t(meta.labelKey)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text">
          {t("taxonomy.categoryLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
        </p>
        <ChipRow>
          {categories.map((category) => (
            <Chip
              key={category.id}
              selected={value.category === category.id}
              onClick={() =>
                onChange({
                  ...value,
                  category: value.category === category.id ? null : category.id,
                  subcategory: null,
                })
              }
            >
              {taxonomyLabel(category.labelKey, language)}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {subcategories.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-text">
            {t("taxonomy.subcategoryLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
          </p>
          <ChipRow>
            {subcategories.map((sub) => (
              <Chip
                key={sub.id}
                selected={value.subcategory === sub.id}
                onClick={() => onChange({ ...value, subcategory: value.subcategory === sub.id ? null : sub.id })}
              >
                {taxonomyLabel(sub.labelKey, language)}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}
    </div>
  );
}
