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
import { useTranslation } from "@/lib/i18n/language-provider";

/** The "Tümü / Görsel / Metin / Ses / Video" chips — shared by `TaxonomyFilter` and the mobile toolbar (tab row + filter sheet). */
export function TaxonomyTypeChips({ value, onChange }: { value: TaxonomyFilterValue; onChange: (next: TaxonomyFilterValue) => void }) {
  const { t } = useTranslation();
  return (
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
}

/**
 * The category and subcategory chip rows (each appears only once the level
 * above it is chosen). `wrap` lays them out as plain wrapping rows (the
 * mobile filter sheet) instead of the horizontally scrolling `ChipRow`.
 */
export function TaxonomyDeepRows({ value, onChange, wrap }: { value: TaxonomyFilterValue; onChange: (next: TaxonomyFilterValue) => void; wrap?: boolean }) {
  const { t, language } = useTranslation();
  const categories = value.contentType ? getCategories(value.contentType) : [];
  const subcategories = value.contentType ? getSubcategories(value.contentType, value.category) : [];
  const Row = wrap ? WrapRow : ChipRow;
  return (
    <>
      {value.contentType && (
        <Row>
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
        </Row>
      )}
      {value.category && subcategories.length > 0 && (
        <Row>
          <Chip selected={!value.subcategory} onClick={() => onChange({ ...value, subcategory: null })}>
            {t("taxonomy.allSubcategories")}
          </Chip>
          {subcategories.map((sub) => (
            <Chip key={sub.id} selected={value.subcategory === sub.id} onClick={() => onChange({ ...value, subcategory: sub.id })}>
              {taxonomyLabel(sub.labelKey, language)}
            </Chip>
          ))}
        </Row>
      )}
    </>
  );
}

function WrapRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

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
}: {
  value: TaxonomyFilterValue;
  onChange: (next: TaxonomyFilterValue) => void;
}) {
  return (
    <div className="space-y-2">
      <ChipRow>
        <TaxonomyTypeChips value={value} onChange={onChange} />
      </ChipRow>
      <TaxonomyDeepRows value={value} onChange={onChange} />
    </div>
  );
}
