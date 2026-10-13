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
  type TaxonomyCategory,
  type TaxonomySelection,
} from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

type Lang = "tr" | "en";

/**
 * Create/edit form field for the shared content taxonomy — used by prompt,
 * prompt request and preset forms alike.
 *
 *   content type (required, always visible chips)
 *   category › subcategory (optional, ONE summary row that opens the tree)
 *
 * The type decides which sections the form shows, so it stays a one-tap chip
 * row. The category tree is long (dozens of branches), so it stays closed
 * behind a summary row until the author asks for it — and closes again once a
 * subcategory is picked. Selecting a different content type resets the
 * category. Categories come from the live `taxonomy_categories` table (bundled
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
  const [treeOpen, setTreeOpen] = useState(false);
  // `undefined` = follow the selection; an explicit value (incl. `null` = all closed) = the user's own toggling.
  const [openCategory, setOpenCategory] = useState<string | null | undefined>(undefined);
  const activeCategory = openCategory === undefined ? value.category : openCategory;

  function chooseType(type: TaxonomySelection["contentType"]) {
    if (type === value.contentType) return;
    onChange({ contentType: type, category: null, subcategory: null });
    setOpenCategory(undefined);
    setTreeOpen(false);
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
    // A subcategory is the end of the path — fold the tree away.
    if (!alreadyThis) setTreeOpen(false);
  }

  const types = lockContentType ? [value.contentType] : CONTENT_TYPE_IDS;
  const category = findCategory(value.contentType, value.category);
  const sub = findSubcategory(value.contentType, category?.id, value.subcategory);
  const pathParts = [
    ...(category ? [taxonomyLabel(category.labelKey, language)] : []),
    ...(sub ? [taxonomyLabel(sub.labelKey, language)] : []),
  ];

  return (
    <div className="space-y-4" data-taxonomy-tree>
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
          {!bare && (
            <p className="text-sm font-medium text-text">
              {t("taxonomy.categoryLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </p>
          )}
          <p className="text-caption text-text-secondary">{lockContentType ? lockedHint : t("taxonomy.categoryHint")}</p>
        </div>
        <div role="radiogroup" aria-label={t("taxonomy.contentTypeFilter")} className={cn("grid gap-2", lockContentType ? "grid-cols-1 sm:max-w-[14rem]" : "grid-cols-2 sm:grid-cols-4")}>
          {types.map((type) => {
            const meta = CONTENT_TYPE_META[type];
            const Icon = meta.icon;
            const selected = value.contentType === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={lockContentType}
                data-taxonomy-type={type}
                onClick={() => chooseType(type)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text",
                  lockContentType && "cursor-default",
                )}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                {t(meta.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface" data-taxonomy-path>
        <div className="flex items-center gap-2 pr-2">
          <button
            type="button"
            onClick={() => setTreeOpen((open) => !open)}
            aria-expanded={treeOpen}
            aria-controls="taxonomy-category-tree"
            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-caption text-text-muted">{t("taxonomy.categoryLabel")} ({t("common.optional")})</span>
              {pathParts.length > 0 ? (
                <ol className="flex min-w-0 flex-wrap items-center gap-x-1 text-small font-medium text-text">
                  {pathParts.map((part, index) => (
                    <li key={`${index}-${part}`} className="flex min-w-0 items-center gap-1">
                      {index > 0 && <ChevronRight size={12} className="shrink-0 text-text-muted" aria-hidden />}
                      <span className={cn("break-words", index === pathParts.length - 1 && "text-primary")}>{part}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <span className="block text-small text-text-secondary">{t("taxonomy.pickCategory", { count: getCategories(value.contentType).length })}</span>
              )}
            </span>
            <span className="shrink-0 text-caption font-medium text-primary">{treeOpen ? t("vision.hide") : pathParts.length > 0 ? t("taxonomy.change") : t("vision.show")}</span>
            <ChevronRight size={18} className={cn("shrink-0 text-text-muted transition-transform duration-200", treeOpen && "rotate-90")} aria-hidden />
          </button>
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
        <Collapsible open={treeOpen} id="taxonomy-category-tree">
          <div className="@container border-t border-border-soft px-2 pb-3 pt-2 @md:px-3">
            <CategoryList
              value={value}
              language={language}
              activeCategory={activeCategory}
              onToggleCategory={(id) => setOpenCategory(activeCategory === id ? null : id)}
              onChooseLeaf={chooseLeaf}
            />
          </div>
        </Collapsible>
      </div>
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
