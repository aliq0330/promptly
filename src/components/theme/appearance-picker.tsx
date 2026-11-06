"use client";

import { Moon } from "@/components/icons/moon";
import { Sun } from "@/components/icons/sun";
import { useTheme } from "@/components/theme/theme-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Mode picker (Settings → Görünüm). Promptly has one palette (docs/history/342-*), so light / dark is the only
 * appearance choice; the palette swatches that used to sit above it are gone.
 */
export function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <fieldset>
      <legend className="mb-2 text-label font-medium text-text-secondary">{t("settings.modeLabel")}</legend>
      <div className="inline-flex gap-0.5 rounded-lg border border-border-soft bg-surface-soft p-0.5" role="radiogroup">
        {(
          [
            { value: "light", label: t("settings.modeLight"), Icon: Sun },
            { value: "dark", label: t("settings.modeDark"), Icon: Moon },
          ] as const
        ).map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-label font-medium transition-[color,background-color,box-shadow] duration-200 ease-soft",
              theme === value
                ? "bg-surface text-text shadow-sm ring-1 ring-border-soft"
                : "text-text-muted hover:text-text",
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
