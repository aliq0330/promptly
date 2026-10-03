"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Collapsible } from "@/components/ui/collapsible";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useTaxonomyVersion } from "@/features/content/taxonomy-hydrator";
import { FALLBACK_TAXONOMY_ICON, TAXONOMY_ICONS } from "@/features/content/taxonomy-icons";
import {
  CONTENT_TYPE_IDS,
  findCategory,
  findSubcategory,
  getCategories,
  getSubcategories,
  taxonomyLabel,
  type ContentTypeId,
  type TaxonomyCategory,
  type TaxonomySelection,
} from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

type Lang = "tr" | "en";

/**
 * Create/edit form field for the shared content taxonomy — used by prompt,
 * prompt request, generator and preset forms alike. One nested tree in place
 * of the old dropdown / master-detail:
 *
 *   content type (required)  ->  category (optional)  ->  subcategory (optional)
 *
 * Every level is an accordion (one branch open per level), the leaf level is a
 * radio group, and the chosen path is echoed as a breadcrumb above the tree.
 * Selecting a different content type resets the category (same contract as
 * before). Categories come from the live `taxonomy_categories` table (bundled
 * seed as fallback); only the open branches are ever mounted in the DOM.
 */
export function TaxonomyPicker({
  value,
  onChange,
  lockContentType = false,
  lockedHint,
  bare = false,
}: {
  value: TaxonomySelection;
  onChange: (next: TaxonomySelection) => void;
  /** Editing an existing item: the type can't change, category/subcategory still can. */
  lockContentType?: boolean;
  lockedHint?: string;
  /** Inside a `FormSection` that already carries the "Kategori" heading: drop the picker's own title line. */
  bare?: boolean;
}) {
  const { t, language } = useTranslation();
  useTaxonomyVersion();
  // `undefined` = follow the selection; an explicit value (incl. `null` = all closed) = the user's own toggling.
  const [openType, setOpenType] = useState<ContentTypeId | null | undefined>(undefined);
  const [openCategory, setOpenCategory] = useState<string | null | undefined>(undefined);
  const activeType = openType === undefined ? value.contentType : openType;
  const activeCategory = openCategory === undefined ? value.category : openCategory;

  function toggleType(type: ContentTypeId) {
    if (type !== value.contentType) {
      onChange({ contentType: type, category: null, subcategory: null });
      setOpenType(type);
      setOpenCategory(undefined);
      return;
    }
    setOpenType(activeType === type ? null : type);
  }

  function chooseLeaf(category: TaxonomyCategory, subcategoryId: string | null) {
    if (subcategoryId === null) {
      // "All of <category>": selects the category alone; tapping it again clears it.
      const alreadyOnly = value.category === category.id && !value.subcategory;
      onChange({ ...value, category: alreadyOnly ? null : category.id, subcategory: null });
      return;
    }
    const alreadyThis = value.category === category.id && value.subcategory === subcategoryId;
    onChange({ ...value, category: category.id, subcategory: alreadyThis ? null : subcategoryId });
  }

  const types = lockContentType ? [value.contentType] : CONTENT_TYPE_IDS;

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {!bare && (
            <p className="text-sm font-medium text-text">
              {t("taxonomy.categoryLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </p>
          )}
          <p className="text-caption text-text-secondary">{t("taxonomy.categoryHint")}</p>
        </div>
        {value.category && (
          <button
            type="button"
            onClick={() => {
              onChange({ ...value, category: null, subcategory: null });
              setOpenCategory(undefined);
            }}
            className="shrink-0 rounded-md px-2 py-1 text-caption font-medium text-text-muted underline hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t("taxonomy.clearSelection")}
          </button>
        )}
      </div>

      <SelectedPath value={value} language={language} />

      <div className="@container divide-y divide-border-soft overflow-hidden rounded-lg border border-border bg-surface" data-taxonomy-tree>
        {types.map((type) => (
          <TypeNode
            key={type}
            type={type}
            open={activeType === type}
            selected={value.contentType === type}
            hint={lockContentType ? lockedHint : undefined}
            onToggle={() => toggleType(type)}
          >
            {type === value.contentType && (
              <CategoryList
                value={value}
                language={language}
                activeCategory={activeCategory}
                onToggleCategory={(id) => setOpenCategory(activeCategory === id ? null : id)}
                onChooseLeaf={chooseLeaf}
              />
            )}
          </TypeNode>
        ))}
      </div>
    </div>
  );
}

/** Breadcrumb of the chosen path: Görsel › Fotoğrafçılık › Portre Fotoğrafçılığı. */
function SelectedPath({ value, language }: { value: TaxonomySelection; language: Lang }) {
  const { t } = useTranslation();
  const category = findCategory(value.contentType, value.category);
  const sub = findSubcategory(value.contentType, category?.id, value.subcategory);
  const parts = [
    t(CONTENT_TYPE_META[value.contentType].labelKey),
    ...(category ? [taxonomyLabel(category.labelKey, language)] : []),
    ...(sub ? [taxonomyLabel(sub.labelKey, language)] : []),
  ];
  return (
    <div className="mb-3 flex flex-col gap-0.5 rounded-lg border border-border-soft bg-primary-soft px-3 py-2 sm:flex-row sm:items-center sm:gap-3" data-taxonomy-path>
      <span className="shrink-0 text-caption text-text-secondary">{t("taxonomy.selectedPath")}</span>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-small font-medium text-text">
        {parts.map((part, index) => (
          <li key={`${index}-${part}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight size={12} className="shrink-0 text-text-muted" aria-hidden />}
            <span className={cn("break-words", index === parts.length - 1 && "text-primary")}>{part}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TypeNode({
  type,
  open,
  selected,
  hint,
  onToggle,
  children,
}: {
  type: ContentTypeId;
  open: boolean;
  selected: boolean;
  hint?: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const meta = CONTENT_TYPE_META[type];
  const Icon = meta.icon;
  const count = getCategories(type).length;
  const panelId = `taxonomy-type-${type}`;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        data-taxonomy-type={type}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary @md:px-4"
      >
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md", selected ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary")}>
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-text">{t(meta.labelKey)}</span>
          <span className="block truncate text-caption text-text-muted">{hint ?? t("taxonomy.categoryCount", { count })}</span>
        </span>
        {selected && (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-label={t("taxonomy.typeSelectedAria")}>
            <Check size={12} strokeWidth={3} aria-hidden />
          </span>
        )}
        <ChevronRight size={18} className={cn("shrink-0 text-text-muted transition-transform duration-200", open && "rotate-90")} aria-hidden />
      </button>
      <Collapsible open={open} id={panelId}>
        <div className="px-2 pb-3 pt-0.5 @md:px-3">{children}</div>
      </Collapsible>
    </div>
  );
}

/** Tree connector for one child row: an elbow into the row + the vertical line continuing to the next sibling. */
const BRANCH_ITEM =
  "relative not-last:before:pointer-events-none not-last:before:absolute not-last:before:-left-2.5 not-last:before:top-0 not-last:before:bottom-0 not-last:before:w-px not-last:before:bg-border-strong";
const BRANCH_ELBOW =
  "relative before:pointer-events-none before:absolute before:-left-2.5 before:top-0 before:h-1/2 before:w-2.5 before:rounded-bl-md before:border-b before:border-l before:border-border-strong";
const BRANCH_LIST = "ml-5 pl-2.5 @md:ml-6";

function CategoryList({
  value,
  language,
  activeCategory,
  onToggleCategory,
  onChooseLeaf,
}: {
  value: TaxonomySelection;
  language: Lang;
  activeCategory: string | null;
  onToggleCategory: (id: string) => void;
  onChooseLeaf: (category: TaxonomyCategory, subcategoryId: string | null) => void;
}) {
  const { t } = useTranslation();
  const categories = getCategories(value.contentType);
  if (categories.length === 0) {
    return <p className="mx-1 rounded-md border border-dashed border-border px-3 py-4 text-small text-text-muted">{t("taxonomy.noCategories")}</p>;
  }
  return (
    <ul className={BRANCH_LIST} aria-label={t("taxonomy.categoryLabel")}>
      {categories.map((category) => {
        const open = activeCategory === category.id;
        return (
          <li key={category.id} className={BRANCH_ITEM}>
            <div className={BRANCH_ELBOW}>
              <CategoryRow category={category} value={value} language={language} open={open} onClick={() => onToggleCategory(category.id)} />
            </div>
            <Collapsible open={open} id={`taxonomy-panel-${category.id}`}>
              <LeafList category={category} value={value} language={language} onChoose={onChooseLeaf} />
            </Collapsible>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryRow({
  category,
  value,
  language,
  open,
  onClick,
}: {
  category: TaxonomyCategory;
  value: TaxonomySelection;
  language: Lang;
  open: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = TAXONOMY_ICONS[category.icon ?? ""] ?? FALLBACK_TAXONOMY_ICON;
  const isSelected = value.category === category.id;
  const selectedSub = isSelected ? findSubcategory(value.contentType, category.id, value.subcategory) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={`taxonomy-panel-${category.id}`}
      data-taxonomy-category={category.id}
      className={cn(
        "flex min-h-12 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary @md:gap-3 @md:px-2.5",
        open ? "bg-surface-soft" : "hover:bg-surface-soft",
      )}
    >
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", isSelected ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary")}>
        <Icon size={16} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-label font-semibold text-text">{taxonomyLabel(category.labelKey, language)}</span>
        {selectedSub ? (
          <span className="block truncate text-caption text-primary">{taxonomyLabel(selectedSub.labelKey, language)}</span>
        ) : (
          <span className="block truncate text-caption text-text-muted">{t("taxonomy.subcategoryCount", { count: category.subcategories.length })}</span>
        )}
      </span>
      {isSelected && (
        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1 text-caption font-semibold text-primary-foreground" aria-label={t("taxonomy.selectedBadgeAria")}>
          {value.subcategory ? 1 : <Check size={12} aria-hidden />}
        </span>
      )}
      <ChevronRight size={18} className={cn("shrink-0 text-text-muted transition-transform duration-200", open && "rotate-90")} aria-hidden />
    </button>
  );
}

function LeafList({
  category,
  value,
  language,
  onChoose,
}: {
  category: TaxonomyCategory;
  value: TaxonomySelection;
  language: Lang;
  onChoose: (category: TaxonomyCategory, subcategoryId: string | null) => void;
}) {
  const { t } = useTranslation();
  const subs = getSubcategories(value.contentType, category.id);
  const onlyCategory = value.category === category.id && !value.subcategory;
  return (
    <ul className={cn(BRANCH_LIST, "pb-1 pt-0.5")} role="radiogroup" aria-label={t("taxonomy.subcategoryLabel")}>
      <li className={BRANCH_ITEM}>
        <div className={BRANCH_ELBOW}>
          <Leaf selected={onlyCategory} onClick={() => onChoose(category, null)} subtle data-taxonomy-all={category.id}>
            {t("taxonomy.allIn", { name: taxonomyLabel(category.labelKey, language) })}
          </Leaf>
        </div>
      </li>
      {subs.map((sub) => (
        <li key={sub.id} className={BRANCH_ITEM}>
          <div className={BRANCH_ELBOW}>
            <Leaf selected={value.category === category.id && value.subcategory === sub.id} onClick={() => onChoose(category, sub.id)} data-taxonomy-sub={sub.id}>
              {taxonomyLabel(sub.labelKey, language)}
            </Leaf>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Last level of the tree: a radio row (a selection indicator instead of a chevron). */
function Leaf({ selected, onClick, subtle, children, ...rest }: { selected: boolean; onClick: () => void; subtle?: boolean; children: React.ReactNode } & Record<string, unknown>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      {...rest}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary @md:min-h-12 @md:px-2.5",
        selected ? "bg-primary-soft font-medium text-text" : cn("hover:bg-surface-soft hover:text-text", subtle ? "text-text-muted" : "text-text-secondary"),
      )}
    >
      <span className={cn("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2", selected ? "border-primary" : "border-border-strong")} aria-hidden>
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </button>
  );
}
