"use client";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { AppearancePicker } from "@/components/theme/appearance-picker";
import { useAuth } from "@/features/auth/auth-provider";
import { openWelcomeTour } from "@/features/onboarding/welcome-tour";
import { SettingsCard, SettingsSubpage } from "@/features/settings/settings-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";

/** Ayarlar → Tercihler: görünüm (açık/koyu mod — tek palet, docs/history/342-*), dil, tanıtım turu. */
export default function PreferencesSettingsPage() {
  const { user, loading } = useAuth();
  const { t, language, setLanguage } = useTranslation();
  if (loading || !user) return null;

  return (
    <SettingsSubpage title={t("settings.groupPreferences")} description={t("settings.hub.preferencesDesc")}>
      <SettingsCard title={t("settings.appearanceTitle")} hint={t("settings.appearanceHint")}>
        <AppearancePicker />
      </SettingsCard>
      <SettingsCard title={t("settings.languageTitle")} hint={t("settings.languageHint")}>
        {/* Dil adları kendi biçimiyle gösterilir (çevrilmez): İngilizce'deyken "Türkçe"yi "Turkish" yapmak geri dönüş yolunu gizlerdi. */}
        <ChoiceGroup<Language>
          ariaLabel={t("settings.languageTitle")}
          value={language}
          onChange={setLanguage}
          variant="segmented"
          className="max-w-xs"
          options={[
            { key: "tr", label: "Türkçe" },
            { key: "en", label: "English" },
          ]}
        />
      </SettingsCard>
      <SettingsCard title={t("tour.replayTitle")} hint={t("tour.replayHint")}>
        <Button type="button" variant="outline" onClick={openWelcomeTour}>
          {t("tour.replay")}
        </Button>
      </SettingsCard>
    </SettingsSubpage>
  );
}
