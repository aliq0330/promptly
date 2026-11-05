"use client";

import { Moon } from "@/components/icons/moon";
import { Sun } from "@/components/icons/sun";
import { IconButton } from "@/components/ui/icon-button";
import { useTheme } from "@/components/theme/theme-provider";
import { useTranslation } from "@/lib/i18n/language-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <IconButton
      label={theme === "dark" ? t("common.switchToLightTheme") : t("common.switchToDarkTheme")}
      onClick={toggleTheme}
      className="shrink-0"
    >
      {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
    </IconButton>
  );
}
