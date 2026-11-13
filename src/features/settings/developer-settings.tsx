"use client";

import Link from "next/link";
import { Code2 } from "@/components/icons/code-2";
import { ConnectWizard } from "@/features/developers/connect-wizard";
import { ApiKeysSection } from "@/features/settings/api-keys-section";
import { ConnectedAppsSection } from "@/features/settings/connected-apps-section";
import { TelegramSection } from "@/features/settings/telegram-section";
import { SettingsCard, SettingsLinkRow, SettingsSubpage } from "@/features/settings/settings-ui";
import { developerEndpoints } from "@/lib/developers";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Ayarlar → Geliştirici (docs/history/318-*, 319-*): (1) bir yapay zekâ aracına bağlama sihirbazı (izin vererek "deneysel" / anahtarla), (2) kişisel anahtarlar,
 * (3) bağlı uygulamalar. Sihirbaz `features/developers/connect-wizard.tsx`'tir (aynısı /developers → Hesabınla bağla'da); adres
 * `NEXT_PUBLIC_SUPABASE_URL`'den türetilir (`lib/developers.ts`), uydurma adres gösterilmez.
 */
export function DeveloperSettings() {
  const { t } = useTranslation();
  const endpoints = developerEndpoints(process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <SettingsSubpage title={t("settings.groupDeveloper")} description={t("settings.hub.developerDesc")}>
      <SettingsCard title={t("devSettings.connectTitle")} hint={t("devSettings.connectLead")}>
        <div className="space-y-4">
          {endpoints ? <ConnectWizard mcpMeUrl={endpoints.mcpMeUrl} keysHref="#anahtarlarim" /> : null}
          <p className="border-t border-border-soft pt-4 text-caption leading-relaxed text-text-muted">
            {t("devSettings.moreTools")}{" "}
            <Link href="/developers" className="font-medium text-primary hover:underline">
              {t("devSettings.docsTitle")}
            </Link>
          </p>
        </div>
      </SettingsCard>

      <div id="anahtarlarim" className="scroll-mt-24">
        <SettingsCard title={t("devSettings.keysTitle")} hint={t("apiKeys.hint")}>
          <ApiKeysSection />
        </SettingsCard>
      </div>

      <ConnectedAppsSection />

      <TelegramSection />

      <SettingsLinkRow href="/developers" icon={<Code2 size={18} className="text-text-secondary" />} title={t("devSettings.docsTitle")} hint={t("devSettings.docsHint")} />
    </SettingsSubpage>
  );
}
