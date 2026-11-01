"use client";

import { Button } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/field";
import { AppearancePicker } from "@/components/theme/appearance-picker";
import { useAuth } from "@/features/auth/auth-provider";
import { openWelcomeTour } from "@/features/onboarding/welcome-tour";
import { SettingsCard, SettingsSubpage } from "@/features/settings/settings-ui";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Ayarlar → Tercihler: görünüm (mod + palet), dil, tanıtım turu. Yalnız istemcide tutulur (localStorage). */
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
        <div className="grid gap-2 sm:grid-cols-2">
          {/* Dil adları kendi biçimiyle gösterilir (çevrilmez): İngilizce'deyken "Türkçe"yi "Turkish" yapmak geri dönüş yolunu gizlerdi. */}
          <ChoiceCard className="items-center">
            <input type="radio" name="language" checked={language === "tr"} onChange={() => setLanguage("tr")} />
            <span className="font-medium">Türkçe</span>
          </ChoiceCard>
          <ChoiceCard className="items-center">
            <input type="radio" name="language" checked={language === "en"} onChange={() => setLanguage("en")} />
            <span className="font-medium">English</span>
          </ChoiceCard>
        </div>
      </SettingsCard>
      <SettingsCard title={t("tour.replayTitle")} hint={t("tour.replayHint")}>
        <Button type="button" variant="outline" onClick={openWelcomeTour}>
          {t("tour.replay")}
        </Button>
      </SettingsCard>
    </SettingsSubpage>
  );
}
