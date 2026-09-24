"use client";

import { Check, Moon, Sun } from "lucide-react";
import { PALETTES, useTheme, type Palette } from "@/components/theme/theme-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Palette + mode picker (Settings → Görünüm). Each swatch sets its own
 * `data-palette` attribute, so it renders with that palette's REAL tokens
 * (globals.css palette selectors match any element) — the preview can never
 * drift out of sync with the actual theme values.
 */
export function AppearancePicker() {
  const { theme, setTheme, palette, setPalette } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-label font-medium text-text-secondary">{t("settings.paletteLabel")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PALETTES.map((option) => (
            <PaletteSwatch
              key={option}
              palette={option}
              label={t(`settings.palette.${option}`)}
              selected={palette === option}
              onSelect={() => setPalette(option)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-label font-medium text-text-secondary">{t("settings.modeLabel")}</legend>
        <div className="inline-flex rounded-md border border-border bg-surface-soft p-1" role="radiogroup">
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
                "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-label font-medium transition-colors duration-200",
                theme === value
                  ? "bg-surface text-text shadow-xs"
                  : "text-text-muted hover:text-text",
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function PaletteSwatch({
  palette,
  label,
  selected,
  onSelect,
}: {
  palette: Palette;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-palette={palette}
      className={cn(
        "group flex flex-col gap-2 rounded-md border bg-background p-2 text-left transition-colors duration-200",
        selected ? "border-primary" : "border-border hover:border-border-strong",
      )}
    >
      <span className="flex h-12 w-full overflow-hidden rounded-sm border border-border-soft bg-surface">
        <span className="w-1/2 bg-surface-soft" />
        <span className="flex w-1/2 flex-col justify-center gap-1 px-1.5">
          <span className="h-1.5 w-full rounded-full bg-primary" />
          <span className="h-1.5 w-2/3 rounded-full bg-primary-soft" />
          <span className="h-1.5 w-1/2 rounded-full bg-secondary/60" />
        </span>
      </span>
      <span className="flex items-center justify-between gap-1 text-label font-medium text-text">
        {label}
        {selected && <Check size={14} className="text-primary" />}
      </span>
    </button>
  );
}
