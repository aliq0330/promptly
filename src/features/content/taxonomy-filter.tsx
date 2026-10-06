"use client";

import { Chip, ChipRow } from "@/components/ui/chip";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import {
  CONTENT_TYPE_IDS,
  getCategories,
  getSubcategories,
  taxonomyLabel,
  type TaxonomyFilterValue,
} from "@/lib/content-taxonomy";
import { ChipSortRow } from "@/features/content/sort-select";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Filter chips for the shared taxonomy, used wherever a list can be
 * narrowed by content type (Explore, search results, generators, requests,
 * tag pages). Levels appear progressively: types always; categories only
 * once a type is chosen; subcategories only once a category is chosen — so
 * a type's dozens of subcategories are never in the DOM until asked for.
 */
export function TaxonomyFilter({
  value,
  onChange,
  sort,
}: {
  value: TaxonomyFilterValue;
  onChange: (next: TaxonomyFilterValue) => void;
  /** Optional sort select, pinned to the right of the type chips on the same line. */
  sort?: React.ReactNode;
}) {
  const { t, language } = useTranslation();
  const categories = value.contentType ? getCategories(value.contentType) : [];
  const subcategories = value.contentType ? getSubcategories(value.contentType, value.category) : [];

  const typeChips = (
    <>
      <Chip selected={!value.contentType} onClick={() => onChange({ contentType: null, category: null, subcategory: null })}>
        {t("common.all")}
      </Chip>
      {CONTENT_TYPE_IDS.map((type) => (
        <Chip
          key={type}
          icon={CONTENT_TYPE_META[type].icon}
          selected={value.contentType === type}
          onClick={() => onChange({ contentType: type, category: null, subcategory: null })}
        >
          {t(CONTENT_TYPE_META[type].labelKey)}
        </Chip>
      ))}
    </>
  );

  return (
    <div className="space-y-2">
      {sort ? <ChipSortRow sort={sort}>{typeChips}</ChipSortRow> : <ChipRow>{typeChips}</ChipRow>}
      {value.contentType && (
        <ChipRow>
          <Chip selected={!value.category} onClick={() => onChange({ ...value, category: null, subcategory: null })}>
            {t("taxonomy.allCategories")}
          </Chip>
          {categories.map((category) => (
            <Chip
              key={category.id}
              selected={value.category === category.id}
              onClick={() => onChange({ ...value, category: category.id, subcategory: null })}
            >
              {taxonomyLabel(category.labelKey, language)}
            </Chip>
          ))}
        </ChipRow>
      )}
      {value.category && subcategories.length > 0 && (
        <ChipRow>
          <Chip selected={!value.subcategory} onClick={() => onChange({ ...value, subcategory: null })}>
            {t("taxonomy.allSubcategories")}
          </Chip>
          {subcategories.map((sub) => (
            <Chip key={sub.id} selected={value.subcategory === sub.id} onClick={() => onChange({ ...value, subcategory: sub.id })}>
              {taxonomyLabel(sub.labelKey, language)}
            </Chip>
          ))}
        </ChipRow>
      )}
    </div>
  );
}
