"use client";

import { GalleryVerticalEnd, LayoutGrid, Rows3, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { displayViewMode, useViewMode, type ViewMode } from "./view-mode-store";

const OPTIONS: { mode: ViewMode; icon: LucideIcon; labelKey: TranslationKey; titleKey: TranslationKey }[] = [
  { mode: "card", icon: Rows3, labelKey: "view.card", titleKey: "view.cardTitle" },
  { mode: "focus", icon: LayoutGrid, labelKey: "view.focus", titleKey: "view.focusTitle" },
  { mode: "feed", icon: GalleryVerticalEnd, labelKey: "view.feed", titleKey: "view.feedTitle" },
];

/**
 * ▤ Kart | ▦ Odak — the segmented control that flips a list between the
 * existing cards and the Focus View. Two real `<button>`s with `aria-pressed`
 * (Tab / Enter / Space work natively), a visible focus ring, tooltips, and a
 * ≥ 44px touch target below `md` (touch layouts); the label collapses to the
 * icon alone on the narrowest screens (the accessible name stays).
 * `allowFeed` adds the third option, Odak Akışı (only lists that render it pass it).
 */
export function ViewModeSwitcher({ className, allowFeed = false }: { className?: string; allowFeed?: boolean }) {
  const { t } = useTranslation();
  const [stored, setMode] = useViewMode();
  const mode = displayViewMode(stored, allowFeed);

  return (
    <div
      role="group"
      aria-label={t("view.switcherAria")}
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border-soft bg-surface-soft p-0.5", className)}
    >
      {OPTIONS.filter((option) => allowFeed || option.mode !== "feed").map((option) => {
        const active = mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            aria-pressed={active}
            aria-label={t(option.labelKey)}
            title={t(option.titleKey)}
            onClick={() => setMode(option.mode)}
            className={cn(
              "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 text-label font-medium md:h-9 md:min-w-9",
              "transition-[background-color,color,box-shadow] duration-200 ease-soft",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface-soft",
              active ? "bg-surface text-text shadow-sm ring-1 ring-border-soft [&_svg]:text-primary" : "text-text-muted hover:text-text",
            )}
          >
            <option.icon size={16} strokeWidth={1.9} aria-hidden />
            <span className="hidden sm:inline">{t(option.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Phone-width Kart / Odak control: one icon button in the toolbar's action
 * bar that shows the CURRENT view (▦ card, ▤ focus) and flips to the other on
 * tap — same `useViewMode` state as the segmented switcher. (Odak Akışı has its own
 * button next to it, `MobileFeedButton`; while it is open its own bar offers the way back.)
 */
export function MobileViewToggle({ className, allowFeed = false }: { className?: string; allowFeed?: boolean }) {
  const { t } = useTranslation();
  const [stored, setMode] = useViewMode();
  const mode = displayViewMode(stored, allowFeed) === "focus" ? "focus" : "card";
  const next: ViewMode = mode === "card" ? "focus" : "card";
  const Icon = mode === "card" ? LayoutGrid : Rows3;
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={t(mode === "card" ? "view.switchToFocus" : "view.switchToCard")}
      title={t(mode === "card" ? "view.focusTitle" : "view.cardTitle")}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary",
        "transition-colors hover:bg-surface-soft hover:text-text",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        className,
      )}
    >
      <Icon size={18} strokeWidth={1.9} aria-hidden />
    </button>
  );
}

/** Phone-width "open Odak Akışı" icon button, next to `MobileViewToggle` on a list that offers it. */
export function MobileFeedButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useViewMode();
  return (
    <button
      type="button"
      onClick={() => setMode("feed")}
      aria-pressed={mode === "feed"}
      aria-label={t("view.switchToFeed")}
      title={t("view.feedTitle")}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary",
        "transition-colors hover:bg-surface-soft hover:text-text",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        className,
      )}
    >
      <GalleryVerticalEnd size={18} strokeWidth={1.9} aria-hidden />
    </button>
  );
}

/**
 * The pair every list page shows (the same one Keşfet's toolbar has): the one-tap toggle on phones, the
 * segmented Kart | Odak control from `md`. Drop it next to a list's own sort/search controls.
 * `allowFeed` (Ana Sayfa): + Odak Akışı — a third segment from `md`, its own button on phones.
 */
export function ViewModeControls({ allowFeed = false }: { allowFeed?: boolean }) {
  return (
    <>
      <MobileViewToggle className="md:hidden" allowFeed={allowFeed} />
      {allowFeed && <MobileFeedButton className="md:hidden" />}
      <ViewModeSwitcher className="max-md:hidden" allowFeed={allowFeed} />
    </>
  );
}
