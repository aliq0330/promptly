"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal, type LucideIcon } from "lucide-react";
import { ScrollRow } from "@/components/ui/scroll-row";
import { ListFilterSheet } from "@/features/content/list-toolbar";
import { SortSelect, SORT_KEYS, type ContentSortKey } from "@/features/content/sort-select";
import { CONTROL_ICON_BUTTON, SectionMenu } from "@/features/content/section-menu";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

export interface SectionNavItem<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
  /** Something waiting there (Topluluklar' invitations): a small count on the tile. */
  count?: number;
  /** `variant="menu"`: a divider line before this row (a new group of the menu). */
  dividerBefore?: boolean;
}

/**
 * The count badge of a tile. It comes AFTER the label in the DOM (the tab is read as "Davetler 3"),
 * placed over the icon's top-right corner: from the tile's centre (the icon is centred, at most 60px wide; the tile
 * row leaves room above it).
 */
function CountBadge({ count }: { count: number }) {
  return (
    <span
      data-section-count=""
      className="pointer-events-none absolute -top-1.5 left-[calc(50%+1.125rem)] flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] font-bold leading-none text-primary-foreground ring-2 ring-background"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Home's and Keşfet's section switcher (docs/history/207-*, the "Bölüm balonları" design): big rounded-square tiles
 * (icon + name, the chosen one dark) with the list controls — sort, Filtre — in one calm row under
 * them. `variant="tabs"` (docs/history/227-*, used by Home and Keşfet) swaps the tiles for ONE row of underlined text tabs
 * so the first post starts higher. Nothing is pinned while scrolling (docs/history/338-*: the folded 52px bar that used to hang under the header was removed) —
 * the switcher scrolls away with the page.
 */
export function SectionNav<K extends string>({
  items,
  active,
  onChange,
  ariaLabel,
  spread,
  variant = "tiles",
  menuTitle,
  hideControls,
  chips,
  chipsLabel,
  chipsOnMobile,
  sort,
  onSortChange,
  sortKeys = SORT_KEYS,
  sheetSections,
  desktopSheetSections,
  activeCount = 0,
  desktopActiveExtra = 0,
  onClear,
}: {
  items: SectionNavItem<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  /** Few tiles / tabs (Home): spread across a phone's width instead of scrolling. */
  spread?: boolean;
  /** "tiles" = the rounded-square balloons (Topluluklar, Spaces, topic pages); "tabs" = one row of underlined text tabs (Home, Keşfet). */
  variant?: "tiles" | "tabs" | "menu";
  /** `variant="menu"` (Keşfet, docs/history/233-*): ONE "Tümü ▾" menu instead of the tabs; the sheet's title on phones. */
  menuTitle?: string;
  /** Only the tiles (Keşfet's Yaratıcılar section is not a filterable feed): no sort / Filtre / view controls. */
  hideControls?: boolean;
  /** A secondary chip row (post kind / content type) in the control row. */
  chips?: ReactNode;
  chipsLabel?: string;
  /** Show the chip row on phones too (Home); otherwise from `md` up only (on phones it lives in the Filtre sheet). */
  chipsOnMobile?: boolean;
  /** Omit when the order is not user-selectable here (Home: the tab decides it). */
  sort?: ContentSortKey;
  onSortChange?: (sort: ContentSortKey) => void;
  sortKeys?: ContentSortKey[];
  sheetSections?: ReactNode;
  desktopSheetSections?: ReactNode;
  activeCount?: number;
  desktopActiveExtra?: number;
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const totalActive = activeCount + desktopActiveExtra;
  const filterLabel = activeCount > 0 ? t("toolbar.filterWithCount", { count: activeCount }) : t("toolbar.filter");
  const filterButton = (
    <button
      type="button"
      onClick={() => setSheetOpen(true)}
      aria-haspopup="dialog"
      aria-label={filterLabel}
      title={t("toolbar.filter")}
      className={cn(FILTER_BUTTON, "relative")}
    >
      <SlidersHorizontal size={17} strokeWidth={1.9} aria-hidden />
      {totalActive > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold tabular-nums text-primary-foreground">
          {totalActive}
        </span>
      )}
    </button>
  );
  // The sade control row (docs/history/233-*) uses the same quiet icon button as Spaces / Topluluklar.
  const menuFilterButton = (
    <button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-label={filterLabel} title={t("toolbar.filter")} className={cn(CONTROL_ICON_BUTTON, "relative")}>
      <SlidersHorizontal size={22} strokeWidth={1.75} aria-hidden />
      {totalActive > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold tabular-nums text-primary-foreground">
          {totalActive}
        </span>
      )}
    </button>
  );

  return (
    <>
      <div className="space-y-3">
        {variant === "menu" ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <SectionMenu
              items={items.map((item) => ({ key: item.key, label: item.label, icon: item.icon, count: item.count, dividerBefore: item.dividerBefore }))}
              active={active}
              onChange={onChange}
              ariaLabel={ariaLabel}
              title={menuTitle ?? ariaLabel}
            />
            <span className="flex-1" />
            {!hideControls && menuFilterButton}
          </div>
        ) : variant === "tabs" ? (
          // Sade düzen (docs/history/237-*): sekmeler solda, Filtre simgesi AYNI satırın sağında.
          <SectionTabs
            items={items}
            active={active}
            onChange={onChange}
            ariaLabel={ariaLabel}
            spread={spread}
            end={hideControls ? undefined : menuFilterButton}
          />
        ) : (
          <div
            role="tablist"
            aria-label={ariaLabel}
            className={cn(
              "scrollbar-none flex touch-pan-x overflow-x-auto overscroll-x-contain pb-1",
              items.some((item) => item.count) && "pr-1.5 pt-1.5",
              spread ? "justify-between gap-1 sm:justify-start sm:gap-5" : "gap-2 sm:flex-wrap sm:overflow-visible",
            )}
          >
            {items.map((item) => (
              <SectionTile key={item.key} item={item} selected={item.key === active} onSelect={() => onChange(item.key)} fluid={spread} />
            ))}
          </div>
        )}

        {!hideControls && variant !== "menu" && variant !== "tabs" && (
          <div className="flex min-w-0 items-center gap-2">
            {sort && onSortChange && (
              <div className={cn("order-1 flex min-w-0 md:order-2 md:shrink-0", !chips && "flex-1 md:flex-none", chips && !chipsOnMobile && "max-md:flex-1")}>
                <SortSelect value={sort} onChange={onSortChange} keys={sortKeys} quiet />
              </div>
            )}
            {chips && (
              <ScrollRow
                role="group"
                aria-label={chipsLabel}
                wrapperClassName={cn("order-2 flex-1 md:order-1", !chipsOnMobile && "hidden md:block")}
                className={cn("gap-1.5", QUIET_CHIPS)}
              >
                {chips}
              </ScrollRow>
            )}
            <div className="order-3 ml-auto flex shrink-0 items-center gap-2">
              {filterButton}
            </div>
          </div>
        )}

        {!hideControls && sheetOpen && (
          <ListFilterSheet
            onClose={() => setSheetOpen(false)}
            sheetSections={sheetSections}
            desktopSheetSections={desktopSheetSections}
            sort={sort}
            onSortChange={onSortChange}
            sortKeys={sortKeys}
            activeCount={activeCount}
            desktopActiveExtra={desktopActiveExtra}
            onClear={onClear}
          />
        )}
      </div>
    </>
  );
}

const FILTER_BUTTON =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-soft bg-surface text-text-secondary " +
  "transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";
/** The chip row stays calm next to the tiles: no borders, the chosen chip tinted instead of filled. */
const QUIET_CHIPS =
  "[&>button]:border-transparent [&>button]:bg-transparent [&>button]:text-text-muted [&>button]:shadow-none [&>button:hover]:bg-surface-soft " +
  "[&>button[aria-pressed=true]]:border-transparent [&>button[aria-pressed=true]]:bg-primary-soft [&>button[aria-pressed=true]]:text-primary";

function SectionTile<K extends string>({
  item,
  selected,
  onSelect,
  fluid,
}: {
  item: SectionNavItem<K>;
  selected: boolean;
  onSelect: () => void;
  /** Share the row's width (a spread row of up to five tiles on a phone) instead of a fixed width. */
  fluid?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col items-center gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        fluid ? "min-w-0 max-w-[4.75rem] flex-1 sm:w-[4.75rem] sm:flex-none" : "w-[4.75rem] shrink-0",
      )}
    >
      <span
        className={cn(
          "relative grid aspect-square w-full max-w-[3.75rem] place-items-center rounded-[1.25rem] transition-[background-color,color,box-shadow,transform] duration-200 ease-soft group-active:scale-[0.95]",
          selected ? "bg-text text-background shadow-card" : "bg-surface-soft text-text-secondary group-hover:bg-border-soft group-hover:text-text",
        )}
      >
        <Icon size={24} strokeWidth={1.75} aria-hidden />
      </span>
      <span className={cn("text-center text-caption leading-tight", selected ? "font-semibold text-text" : "font-medium text-text-muted")}>{item.label}</span>
      {item.count ? <CountBadge count={item.count} /> : null}
    </button>
  );
}

/**
 * The text-tab form of the section switcher: one underlined row (the chosen tab bold with a primary underline). A spread row (Home's two
 * views) shares the width; Keşfet's eleven sections scroll (`ScrollRow`: finger, wheel, drag, arrows).
 */
function SectionTabs<K extends string>({
  items,
  active,
  onChange,
  ariaLabel,
  spread,
  end,
}: {
  items: SectionNavItem<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  spread?: boolean;
  /** Controls at the end of the same strip (Filtre). */
  end?: ReactNode;
}) {
  return (
    // On a phone the row is a white strip edge to edge (the page behind it is the soft grey), from `sm` it sits on the page.
    <div className="flex items-center border-b border-border-soft max-sm:-mx-3 max-sm:border-t max-sm:bg-surface max-sm:px-3">
      <ScrollRow role="tablist" aria-label={ariaLabel} wrapperClassName="min-w-0 flex-1" className={cn("gap-1", spread && "[&>button]:flex-1")}>
        {items.map((item) => {
          const selected = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(item.key)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-b-[3px] px-3.5 text-body transition-colors duration-200 ease-soft",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                selected ? "border-primary font-bold text-text" : "border-transparent font-medium text-text-muted hover:text-text",
              )}
            >
              {item.label}
              {item.count ? (
                <span data-section-count="" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] font-bold leading-none text-primary-foreground">
                  {item.count > 99 ? "99+" : item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </ScrollRow>
      {end && <div className="flex shrink-0 items-center gap-0.5 pl-1">{end}</div>}
    </div>
  );
}
