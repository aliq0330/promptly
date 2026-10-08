"use client";

import { LayoutGrid, Rows3, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { useViewMode, type ViewMode } from "./view-mode-store";

const OPTIONS: { mode: ViewMode; icon: LucideIcon; labelKey: TranslationKey; titleKey: TranslationKey }[] = [
  { mode: "card", icon: Rows3, labelKey: "view.card", titleKey: "view.cardTitle" },
  { mode: "focus", icon: LayoutGrid, labelKey: "view.focus", titleKey: "view.focusTitle" },
];

/**
 * ▤ Kart | ▦ Odak — the segmented control that flips a list between the
 * existing cards and the Focus View. Two real `<button>`s with `aria-pressed`
 * (Tab / Enter / Space work natively), a visible focus ring, tooltips, and a
 * ≥ 44px touch target below `md` (touch layouts); the label collapses to the
 * icon alone on the narrowest screens (the accessible name stays).
 */
export function ViewModeSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useViewMode();

  return (
    <div
      role="group"
      aria-label={t("view.switcherAria")}
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border-soft bg-surface-soft p-0.5", className)}
    >
      {OPTIONS.map((option) => {
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
