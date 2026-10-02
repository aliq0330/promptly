"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Collapsible } from "@/components/ui/collapsible";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useTaxonomyVersion } from "@/features/content/taxonomy-hydrator";
import { FALLBACK_TAXONOMY_ICON, TAXONOMY_ICONS } from "@/features/content/taxonomy-icons";
import {
  CONTENT_TYPE_IDS,
  findSubcategory,
  getCategories,
  getSubcategories,
  taxonomyLabel,
  type ContentTypeId,
  type TaxonomyCategory,
  type TaxonomySelection,
} from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Create/edit form field for the shared content taxonomy — used by prompt,
 * prompt request, generator and preset forms alike: content type (required)
 * → category (optional) → subcategory (optional). Categories come from the
 * live `taxonomy_categories` table (bundled seed as fallback).
 *
 * Layout: below `md` a vertical ACCORDION (one category open at a time, its
 * subcategories slide open under it); from `md` a two-column master/detail
 * (category list on the left, the chosen category's subcategories on the
 * right). Only the open category's subcategories are ever in the DOM.
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
  useTaxonomyVersion();

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
                    "flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
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
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text">
              {t("taxonomy.categoryLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </p>
            <p className="text-caption text-text-secondary">{t("taxonomy.categoryHint")}</p>
          </div>
          {value.category && (
            <button
              type="button"
              onClick={() => onChange({ ...value, category: null, subcategory: null })}
              className="shrink-0 rounded-md px-2 py-1 text-caption font-medium text-text-muted underline hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t("taxonomy.clearSelection")}
            </button>
          )}
        </div>
        {/* Re-mounted per content type so the open category never leaks across types. */}
        <CategoryBrowser key={value.contentType} value={value} onChange={onChange} language={language} />
      </div>
    </div>
  );
}

function CategoryBrowser({ value, onChange, language }: { value: TaxonomySelection; onChange: (next: TaxonomySelection) => void; language: "tr" | "en" }) {
  const { t } = useTranslation();
  const wide = useMediaQuery("(min-width: 768px)");
  const categories = getCategories(value.contentType);
  // `undefined` = follow the selection / default; `null` = the user closed everything (accordion only).
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const activeId = openId === undefined ? (value.category ?? (wide ? (categories[0]?.id ?? null) : null)) : openId;

  if (categories.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-3 py-4 text-small text-text-muted">{t("taxonomy.noCategories")}</p>;
  }

  function chooseSubcategory(category: TaxonomyCategory, subcategoryId: string | null) {
    if (subcategoryId === null) {
      // "All of <category>": selects the category alone; tapping it again clears it.
      const alreadyOnly = value.category === category.id && !value.subcategory;
      onChange({ ...value, category: alreadyOnly ? null : category.id, subcategory: null });
      return;
    }
    const alreadyThis = value.category === category.id && value.subcategory === subcategoryId;
    onChange({ ...value, category: category.id, subcategory: alreadyThis ? null : subcategoryId });
  }

  if (wide) {
    const active = categories.find((c) => c.id === activeId) ?? categories[0];
    return (
      <div className="grid grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-surface">
        <ul className="max-h-[26rem] space-y-0.5 overflow-y-auto border-r border-border-soft p-2" aria-label={t("taxonomy.categoryLabel")}>
          {categories.map((category) => (
            <li key={category.id}>
              <CategoryButton category={category} value={value} language={language} active={active.id === category.id} onClick={() => setOpenId(category.id)} variant="list" />
            </li>
          ))}
        </ul>
        <div className="@container min-w-0 p-3" role="region" aria-label={taxonomyLabel(active.labelKey, language)}>
          <div className="mb-3">
            <p className="text-label font-semibold text-text">{taxonomyLabel(active.labelKey, language)}</p>
            {active.description && <p className="text-caption text-text-secondary">{language === "en" ? active.description[0] : active.description[1]}</p>}
          </div>
          <SubcategoryGrid category={active} value={value} language={language} onChoose={chooseSubcategory} columns="grid-cols-2 @lg:grid-cols-3" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {categories.map((category) => {
        const open = activeId === category.id;
        const panelId = `taxonomy-panel-${category.id}`;
        return (
          <div key={category.id} className={cn("overflow-hidden rounded-lg border bg-surface transition-colors", open ? "border-border-strong" : "border-border")}>
            <CategoryButton
              category={category}
              value={value}
              language={language}
              active={open}
              onClick={() => setOpenId(open ? null : category.id)}
              variant="accordion"
              controls={panelId}
            />
            <Collapsible open={open} id={panelId}>
              <div className="border-t border-border-soft p-3">
                <SubcategoryGrid category={category} value={value} language={language} onChoose={chooseSubcategory} columns="grid-cols-2 sm:grid-cols-3" />
              </div>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}

function CategoryButton({
  category,
  value,
  language,
  active,
  onClick,
  variant,
  controls,
}: {
  category: TaxonomyCategory;
  value: TaxonomySelection;
  language: "tr" | "en";
  active: boolean;
  onClick: () => void;
  variant: "accordion" | "list";
  controls?: string;
}) {
  const { t } = useTranslation();
  const Icon = TAXONOMY_ICONS[category.icon ?? ""] ?? FALLBACK_TAXONOMY_ICON;
  const isSelected = value.category === category.id;
  const selectedSub = isSelected ? findSubcategory(value.contentType, category.id, value.subcategory) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={variant === "accordion" ? active : undefined}
      aria-controls={variant === "accordion" ? controls : undefined}
      aria-current={variant === "list" && active ? "true" : undefined}
      data-taxonomy-category={category.id}
      className={cn(
        "flex w-full min-h-12 items-center gap-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        variant === "accordion" ? "px-3 py-2.5 hover:bg-surface-soft" : "rounded-md px-2.5 py-2",
        variant === "list" && (active ? "bg-primary-soft" : "hover:bg-surface-soft"),
      )}
    >
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", isSelected ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary")}>
        <Icon size={16} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-label font-semibold text-text", variant === "list" ? "line-clamp-2 break-words" : "truncate")}>{taxonomyLabel(category.labelKey, language)}</span>
        {selectedSub ? (
          <span className="block truncate text-caption text-text-secondary">{taxonomyLabel(selectedSub.labelKey, language)}</span>
        ) : (
          <span className="block truncate text-caption text-text-muted">{t("taxonomy.subcategoryCount", { count: category.subcategories.length })}</span>
        )}
      </span>
      {isSelected && (
        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1 text-caption font-semibold text-primary-foreground" aria-label={t("taxonomy.selectedBadgeAria")}>
          {value.subcategory ? 1 : <Check size={12} aria-hidden />}
        </span>
      )}
      {variant === "accordion" && <ChevronDown size={18} className={cn("shrink-0 text-text-muted transition-transform duration-200", active && "rotate-180")} aria-hidden />}
    </button>
  );
}

function SubcategoryGrid({
  category,
  value,
  language,
  onChoose,
  columns,
}: {
  category: TaxonomyCategory;
  value: TaxonomySelection;
  language: "tr" | "en";
  onChoose: (category: TaxonomyCategory, subcategoryId: string | null) => void;
  columns: string;
}) {
  const { t } = useTranslation();
  const subs = getSubcategories(value.contentType, category.id);
  const onlyCategory = value.category === category.id && !value.subcategory;
  return (
    <div className={cn("grid gap-2", columns)} role="group" aria-label={t("taxonomy.subcategoryLabel")}>
      <OptionButton selected={onlyCategory} onClick={() => onChoose(category, null)} subtle data-taxonomy-all={category.id}>
        {t("taxonomy.allIn", { name: taxonomyLabel(category.labelKey, language) })}
      </OptionButton>
      {subs.map((sub) => (
        <OptionButton key={sub.id} selected={value.category === category.id && value.subcategory === sub.id} onClick={() => onChoose(category, sub.id)} data-taxonomy-sub={sub.id}>
          {taxonomyLabel(sub.labelKey, language)}
        </OptionButton>
      ))}
    </div>
  );
}

function OptionButton({ selected, onClick, subtle, children, ...rest }: { selected: boolean; onClick: () => void; subtle?: boolean; children: React.ReactNode } & Record<string, unknown>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      {...rest}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-left text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected ? "border-primary bg-primary-soft font-medium text-text" : subtle ? "border-dashed border-border bg-surface text-text-secondary hover:bg-surface-soft" : "border-border-soft bg-surface text-text-secondary hover:border-border hover:bg-surface-soft hover:text-text",
      )}
    >
      <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")} aria-hidden>
        {selected && <Check size={10} strokeWidth={3} />}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </button>
  );
}
