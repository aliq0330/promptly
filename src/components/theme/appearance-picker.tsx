"use client";

import { Moon } from "@/components/icons/moon";
import { Sun } from "@/components/icons/sun";
import { useTheme } from "@/components/theme/theme-provider";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Mode picker (Settings → Görünüm). Promptly has one palette (docs/history/342-*), so light / dark is the only
 * appearance choice; the palette swatches that used to sit above it are gone. A two-option `ChoiceGroup` (docs/history/453-*).
 */
export function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div>
      <p id="appearance-mode-label" className="mb-2 text-label font-medium text-text-secondary">
        {t("settings.modeLabel")}
      </p>
      <ChoiceGroup<"light" | "dark">
        labelledBy="appearance-mode-label"
        variant="segmented"
        className="max-w-xs"
        value={theme}
        onChange={setTheme}
        options={[
          { key: "light", label: t("settings.modeLight"), icon: Sun },
          { key: "dark", label: t("settings.modeDark"), icon: Moon },
        ]}
      />
    </div>
  );
}
