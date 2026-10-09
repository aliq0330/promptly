"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TaxonomyDeepRows, TaxonomyTypeChips } from "@/features/content/taxonomy-filter";
import { SortSelect, SORT_KEYS, SORT_LABELS, type ContentSortKey } from "@/features/content/sort-select";
import { MobileViewToggle, ViewModeSwitcher } from "@/features/content/view-mode-switcher";
import type { TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Below `md` the primary chip row turns into editorial tabs: flat, 42px,
 * a 2px underline under the active one, no icons. Done with child-selector
 * variants on the scroller (not a second set of components) so the very same
 * `Chip`s render once, are restyled on phones only, and stay plain chips in
 * the filter sheet and from `md` up.
 */
const MOBILE_TABS =
  "max-md:gap-1 max-md:border-b max-md:border-border-soft " +
  "max-md:[&>button]:h-[42px] max-md:[&>button]:rounded-none max-md:[&>button]:border-0 max-md:[&>button]:border-b-2 max-md:[&>button]:border-transparent " +
  "max-md:[&>button]:bg-transparent max-md:[&>button]:px-3 max-md:[&>button]:text-body max-md:[&>button]:shadow-none max-md:[&>button]:text-text-muted " +
  "max-md:[&>button:hover]:bg-transparent max-md:[&>button>svg]:hidden " +
  "max-md:[&>button[aria-pressed=true]]:border-primary max-md:[&>button[aria-pressed=true]]:bg-transparent max-md:[&>button[aria-pressed=true]]:font-semibold max-md:[&>button[aria-pressed=true]]:text-text";

/** One titled block of the filter sheet. */
export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-label font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}

/** Wrapping chip group for use inside the filter sheet (the scrolling `ChipRow` is for tab rows). */
export function SheetChips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** The sheet rows every taxonomy-filtered list shares: content type, then category / subcategory. */
export function TaxonomySheetSections({
  value,
  onChange,
  showCategories = true,
}: {
  value: TaxonomyFilterValue;
  onChange: (next: TaxonomyFilterValue) => void;
  showCategories?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SheetSection title={t("toolbar.contentType")}>
        <SheetChips>
          <TaxonomyTypeChips value={value} onChange={onChange} />
        </SheetChips>
      </SheetSection>
      {showCategories && value.contentType && (
        <SheetSection title={t("toolbar.category")}>
          <div className="space-y-2">
            <TaxonomyDeepRows value={value} onChange={onChange} wrap />
          </div>
        </SheetSection>
      )}
    </>
  );
}

/** How many narrowing levels a taxonomy filter has set; the content type is skipped when it is already a visible tab. */
export function taxonomyActiveCount(value: TaxonomyFilterValue, includeType: boolean): number {
  return (value.category ? 1 : 0) + (value.subcategory ? 1 : 0) + (includeType && value.contentType ? 1 : 0);
}

/**
 * The control strip above a content list — ONE component for Home, Explore,
 * Prompts, Generators, Workflows, Requests (and Presets).
 *
 * Same compact strip at EVERY width: `[chips / tabs …]  [⚙ Filtre] [En yeni ↓] [▦]`.
 * Categories, request status, sort and view live in the "Filtrele" sheet
 * (bottom sheet on phones, centred dialog from `sm` up); state and data
 * fetching are untouched, the sheet only drives the same setters live. The
 * primary chips become editorial tabs below `md` only.
 */
export function ListToolbar({
  tabs,
  tabsLabel,
  mobileTabs,
  hideTabsOnMobile,
  sort,
  onSortChange,
  sheetSections,
  desktopSheetSections,
  desktopActiveExtra = 0,
  activeCount = 0,
  onClear,
  className,
}: {
  /** The primary chip row (desktop) — and the mobile tabs unless `mobileTabs` / `hideTabsOnMobile` say otherwise. */
  tabs?: ReactNode;
  tabsLabel: string;
  /** Different chips for the phone tab row (e.g. request status) while desktop keeps `tabs`. */
  mobileTabs?: ReactNode;
  /** The page already shows its own tab bar above (Explore's section tabs). */
  hideTabsOnMobile?: boolean;
  sort: ContentSortKey;
  onSortChange: (sort: ContentSortKey) => void;
  /** Page-specific sections of the filter sheet (placed above Sıralama / Görünüm). */
  sheetSections?: ReactNode;
  /** Sections only needed from `md` up — on phones the same filter is already a tab (e.g. request status). */
  desktopSheetSections?: ReactNode;
  /** Extra active filters that only exist from `md` up (added to the Filtre badge there). */
  desktopActiveExtra?: number;
  /** How many filters are narrowing the list right now — shown on the Filtre button. */
  activeCount?: number;
  onClear?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const hasMobileTabs = mobileTabs !== undefined;
  const scroller = "scrollbar-none flex min-w-0 touch-pan-x gap-2 overflow-x-auto overscroll-x-contain";

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
        {tabs && (
          <div
            role="group"
            aria-label={tabsLabel}
            className={cn(scroller, "md:flex-1", MOBILE_TABS, (hasMobileTabs || hideTabsOnMobile) && "max-md:hidden")}
          >
            {tabs}
          </div>
        )}
        {hasMobileTabs && (
          <div role="group" aria-label={tabsLabel} className={cn(scroller, MOBILE_TABS, "md:hidden")}>
            {mobileTabs}
          </div>
        )}

        <div className="flex min-w-0 items-center gap-2 md:shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={activeCount > 0 ? t("toolbar.filterWithCount", { count: activeCount }) : t("toolbar.filter")}
            className="h-11 gap-2 rounded-lg px-3.5 md:h-10"
          >
            <SlidersHorizontal size={16} aria-hidden />
            {t("toolbar.filter")}
            {activeCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold tabular-nums text-primary-foreground md:hidden">
                {activeCount}
              </span>
            )}
            {activeCount + desktopActiveExtra > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold tabular-nums text-primary-foreground max-md:hidden">
                {activeCount + desktopActiveExtra}
              </span>
            )}
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:flex-none">
            <SortSelect value={sort} onChange={onSortChange} />
            <MobileViewToggle className="md:hidden" />
            <ViewModeSwitcher className="max-md:hidden" />
          </div>
        </div>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)} labelledBy={titleId}>
          <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
              <h2 id={titleId} className="text-h3 font-semibold text-text">
                {t("toolbar.filterTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("common.close")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
              {sheetSections}
              {desktopSheetSections && <div className="space-y-5 max-md:hidden">{desktopSheetSections}</div>}
              <SheetSection title={t("toolbar.sort")}>
                <div role="radiogroup" aria-label={t("profile.sortAriaLabel")} className="space-y-1">
                  {SORT_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={sort === key}
                      onClick={() => onSortChange(key)}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-label transition-colors",
                        sort === key ? "bg-primary-soft font-semibold text-text" : "text-text-secondary hover:bg-surface-soft",
                      )}
                    >
                      {t(SORT_LABELS[key])}
                      {sort === key && <Check size={16} className="text-primary" aria-hidden />}
                    </button>
                  ))}
                </div>
              </SheetSection>
              <SheetSection title={t("toolbar.view")}>
                <ViewModeSwitcher />
              </SheetSection>
            </div>

            <div className="flex gap-2 border-t border-border-soft px-4 py-3">
              {onClear && (
                <Button variant="outline" className="h-11 flex-1" onClick={onClear} disabled={activeCount + desktopActiveExtra === 0}>
                  {t("toolbar.clear")}
                </Button>
              )}
              <Button className="h-11 flex-[2]" onClick={() => setOpen(false)}>
                {t("toolbar.apply")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
