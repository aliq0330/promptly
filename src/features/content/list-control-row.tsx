"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { ListFilterSheet } from "@/features/content/list-toolbar";
import { CONTROL_ICON_BUTTON, SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import type { ContentSortKey } from "@/features/content/sort-select";
import { CompactViewToggle } from "@/features/content/view-mode-switcher";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/** The plain big page title of the sade pages (Spaces, Topluluklar, listeler, Bildirimler, Mesajlar — docs/history/231-*, 234-*). */
export function SadeTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("font-display text-[2.375rem] font-bold leading-[1.1] tracking-[-0.02em] text-text", className)}>{children}</h1>;
}

export interface ListFilterConfig {
  sheetSections?: ReactNode;
  desktopSheetSections?: ReactNode;
  sort?: ContentSortKey;
  onSortChange?: (sort: ContentSortKey) => void;
  sortKeys?: ContentSortKey[];
  /** How many filters narrow the list right now — shown on the Filtre icon. */
  activeCount?: number;
  onClear?: () => void;
}

/**
 * The sade control row (docs/history/234-*): ONE section menu on the left, then quiet icon buttons — search · Filtre · Kart/Izgara · "+".
 * Each control is optional so the same row serves the type lists, Kaydedilenler and the topic pages; the search icon only reports its state
 * (the page decides what opens), Filtre opens the shared `ListFilterSheet`, Kart/Izgara is the shared `useViewMode` toggle.
 */
export function ListControlRow<K extends string>({
  menu,
  search,
  filter,
  create,
  showView = true,
  trailing,
}: {
  menu?: { items: SectionMenuItem<K>[]; active: K; onChange: (key: K) => void; ariaLabel: string; title: string };
  search?: { open: boolean; onToggle: () => void; label: string };
  filter?: ListFilterConfig;
  create?: { href: string; label: string };
  showView?: boolean;
  /** Page-specific icon buttons after the filter (Bildirimler: tümünü okundu say / temizle). */
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const active = filter?.activeCount ?? 0;
  const filterLabel = active > 0 ? t("toolbar.filterWithCount", { count: active }) : t("toolbar.filter");
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {menu && <SectionMenu items={menu.items} active={menu.active} onChange={menu.onChange} ariaLabel={menu.ariaLabel} title={menu.title} />}
      <span className="flex-1" />
      {search && (
        <button type="button" onClick={search.onToggle} aria-label={search.label} title={search.label} aria-pressed={search.open} data-list-search className={cn(CONTROL_ICON_BUTTON, search.open && "bg-surface-soft")}>
          {search.open ? <X size={22} strokeWidth={1.75} aria-hidden /> : <Search size={22} strokeWidth={1.75} aria-hidden />}
        </button>
      )}
      {filter && (
        <button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-label={filterLabel} title={t("toolbar.filter")} data-list-filter className={cn(CONTROL_ICON_BUTTON, "relative")}>
          <SlidersHorizontal size={22} strokeWidth={1.75} aria-hidden />
          {active > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold tabular-nums text-primary-foreground">{active}</span>
          )}
        </button>
      )}
      {trailing}
      {showView && <CompactViewToggle />}
      {create && (
        <Link href={create.href} aria-label={create.label} title={create.label} data-list-create className={cn(CONTROL_ICON_BUTTON, "bg-surface-soft hover:bg-border-soft")}>
          <Plus size={22} strokeWidth={1.75} aria-hidden />
        </Link>
      )}
      {filter && sheetOpen && (
        <ListFilterSheet
          onClose={() => setSheetOpen(false)}
          sheetSections={filter.sheetSections}
          desktopSheetSections={filter.desktopSheetSections}
          sort={filter.sort}
          onSortChange={filter.onSortChange}
          sortKeys={filter.sortKeys}
          activeCount={filter.activeCount}
          onClear={filter.onClear}
        />
      )}
    </div>
  );
}
