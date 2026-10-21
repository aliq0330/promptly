"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { SlidersHorizontal, type LucideIcon } from "lucide-react";
import { ListFilterSheet } from "@/features/content/list-toolbar";
import { SortSelect, SORT_KEYS, type ContentSortKey } from "@/features/content/sort-select";
import { MobileViewToggle, ViewModeSwitcher } from "@/features/content/view-mode-switcher";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

export interface SectionNavItem<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
}

/** Clears the 4rem header (`Header`, h-16): the tiles count as "scrolled away" once they are above it. */
const HEADER_OFFSET = 64;

/**
 * true once `ref`'s element has scrolled up out of view (under the header). No React work while scrolling: the
 * observer only fires when the element crosses the edge.
 */
function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0), {
      rootMargin: `-${HEADER_OFFSET}px 0px 0px 0px`,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return past;
}

/**
 * Home's and Keşfet's section switcher (docs/history/207-*, the "Bölüm balonları" design): big rounded-square tiles
 * (icon + name, the chosen one dark) with the list controls — sort, Filtre, Kart | Izgara — in one calm row under
 * them. Once the tiles scroll away they fold into ONE 52px bar pinned under the header (in its place while the header
 * is hidden, `[data-sticky-under-header]`): the chosen section as a labelled pill, the others as icons, Filtre and the
 * view toggle at the end. Render it as a direct child of the TALL container (the page / feed section): the bar is a
 * zero-height `sticky` element, so its containing block must reach the end of the list.
 */
export function SectionNav<K extends string>({
  items,
  active,
  onChange,
  ariaLabel,
  spread,
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
  /** Few tiles (Home): spread across a phone's width instead of scrolling. */
  spread?: boolean;
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
  const blockRef = useRef<HTMLDivElement>(null);
  const folded = useScrolledPast(blockRef);

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

  return (
    <>
      <FoldedBar items={items} active={active} onChange={onChange} ariaLabel={ariaLabel} visible={folded} actions={hideControls ? null : <>{filterButton}<MobileViewToggle className={ICON_BUTTON} /></>} />

      <div ref={blockRef} className="space-y-3">
        <div
          role="tablist"
          aria-label={ariaLabel}
          className={cn(
            "scrollbar-none flex touch-pan-x overflow-x-auto overscroll-x-contain pb-1",
            spread ? "justify-between gap-1 sm:justify-start sm:gap-5" : "gap-2 sm:flex-wrap sm:overflow-visible",
          )}
        >
          {items.map((item) => (
            <SectionTile key={item.key} item={item} selected={item.key === active} onSelect={() => onChange(item.key)} />
          ))}
        </div>

        {!hideControls && (
          <div className="flex min-w-0 items-center gap-2">
            {sort && onSortChange && (
              <div className={cn("order-1 flex min-w-0 md:order-2 md:shrink-0", !chips && "flex-1 md:flex-none", chips && !chipsOnMobile && "max-md:flex-1")}>
                <SortSelect value={sort} onChange={onSortChange} keys={sortKeys} quiet />
              </div>
            )}
            {chips && (
              <div
                role="group"
                aria-label={chipsLabel}
                className={cn(
                  "scrollbar-none order-2 min-w-0 flex-1 touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain md:order-1",
                  chipsOnMobile ? "flex" : "hidden md:flex",
                  QUIET_CHIPS,
                )}
              >
                {chips}
              </div>
            )}
            <div className="order-3 ml-auto flex shrink-0 items-center gap-2">
              {filterButton}
              <MobileViewToggle className={cn(ICON_BUTTON, "md:hidden")} />
              <ViewModeSwitcher className="max-md:hidden" />
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

const ICON_BUTTON = "h-10 w-10 rounded-full border-border-soft";
const FILTER_BUTTON =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-soft bg-surface text-text-secondary " +
  "transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";
/** The chip row stays calm next to the tiles: no borders, the chosen chip tinted instead of filled. */
const QUIET_CHIPS =
  "[&>button]:border-transparent [&>button]:bg-transparent [&>button]:text-text-muted [&>button]:shadow-none [&>button:hover]:bg-surface-soft " +
  "[&>button[aria-pressed=true]]:border-transparent [&>button[aria-pressed=true]]:bg-primary-soft [&>button[aria-pressed=true]]:text-primary";

function SectionTile<K extends string>({ item, selected, onSelect }: { item: SectionNavItem<K>; selected: boolean; onSelect: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className="group flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span
        className={cn(
          "grid h-[3.75rem] w-[3.75rem] place-items-center rounded-[1.25rem] transition-[background-color,color,box-shadow,transform] duration-200 ease-soft group-active:scale-[0.95]",
          selected ? "bg-text text-background shadow-card" : "bg-surface-soft text-text-secondary group-hover:bg-border-soft group-hover:text-text",
        )}
      >
        <Icon size={24} strokeWidth={1.75} aria-hidden />
      </span>
      <span className={cn("text-center text-caption leading-tight", selected ? "font-semibold text-text" : "font-medium text-text-muted")}>{item.label}</span>
    </button>
  );
}

/** The folded state: a zero-height sticky anchor whose absolutely positioned bar hangs below the header (or the screen's top once the header slid away). */
function FoldedBar<K extends string>({
  items,
  active,
  onChange,
  ariaLabel,
  visible,
  actions,
}: {
  items: SectionNavItem<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  visible: boolean;
  actions: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  // The chosen pill can sit beyond the edge of a scrolling row (Keşfet's last sections): bring it into view whenever it changes or the bar appears.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const chosen = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && chosen) row.scrollLeft = Math.max(0, chosen.offsetLeft - 8);
  }, [active, visible]);

  return (
    // `margin: 0` inline: a `space-y-*` parent must not add a gap around this zero-height element.
    <div data-sticky-under-header style={{ margin: 0 }} className="sticky z-20 h-0">
      <div
        inert={!visible}
        className={cn(
          "absolute -inset-x-3 top-0 flex h-[3.25rem] items-center gap-2 border-b border-border-soft bg-background/90 px-3 backdrop-blur-xl backdrop-saturate-150 sm:inset-x-0 sm:px-0",
          "transition-[opacity,transform] duration-300 ease-soft",
          visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        <div
          ref={rowRef}
          role="group"
          aria-label={ariaLabel}
          className="scrollbar-none relative flex min-w-0 flex-1 touch-pan-x items-center gap-1.5 overflow-x-auto overscroll-x-contain"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const selected = item.key === active;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                aria-label={item.label}
                title={item.label}
                onClick={() => onChange(item.key)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full text-label font-semibold whitespace-nowrap",
                  "transition-[background-color,color,padding] duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                  selected ? "bg-text pl-3 pr-4 text-background" : "w-10 bg-surface-soft text-text-secondary hover:bg-border-soft hover:text-text",
                )}
              >
                <Icon size={16} strokeWidth={1.9} aria-hidden />
                {selected && item.label}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
