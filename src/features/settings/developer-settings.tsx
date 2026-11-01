"use client";

import Link from "next/link";
import { Code2 } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { ApiKeysSection } from "@/features/settings/api-keys-section";
import { ConnectedAppsSection } from "@/features/settings/connected-apps-section";
import { SettingsCard, SettingsLinkRow, SettingsSubpage } from "@/features/settings/settings-ui";
import { developerEndpoints } from "@/lib/developers";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Ayarlar → Geliştirici (docs/history/318-*): tek sayfada üç iş — (1) bir yapay zekâ aracına bağlama rehberi (anahtarla; OAuth "deneysel"), (2) kişisel anahtarlar,
 * (3) bağlı uygulamalar. Rehberdeki her adım gerçek bir bağlayıcı denemesinden gelir (claude.ai: "Oturum açma yok" + `Authorization: Bearer pmt_…`); adres
 * `NEXT_PUBLIC_SUPABASE_URL`'den türetilir (`lib/developers.ts`), uydurma adres gösterilmez.
 */
export function DeveloperSettings() {
  const { t } = useTranslation();
  const endpoints = developerEndpoints(process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <SettingsSubpage title={t("settings.groupDeveloper")} description={t("settings.hub.developerDesc")}>
      <SettingsCard title={t("devSettings.connectTitle")} hint={t("devSettings.connectLead")}>
        <div className="space-y-5" data-dev-connect="">
          <div className="space-y-3">
            <h4 className="text-small font-semibold text-text">{t("devSettings.methodKey")}</h4>
            <p className="text-xs leading-relaxed text-text-muted">{t("devSettings.methodKeyLead")}</p>
            <ol className="list-decimal space-y-3 pl-5 text-small leading-relaxed text-text-secondary marker:text-text-muted">
              <li>{t("devSettings.step1")}</li>
              <li>{t("devSettings.step2")}</li>
              <li className="space-y-2">
                <span className="block">{t("devSettings.step3")}</span>
                {endpoints ? <CodeBlock text={endpoints.mcpMeUrl} label={t("dev.meMcpAddress")} /> : null}
              </li>
              <li>{t("devSettings.step4")}</li>
              <li className="space-y-2">
                <span className="block">{t("devSettings.step5")}</span>
                <CodeBlock text="Authorization" label="Authorization" />
                <span className="block">{t("devSettings.step5Value")}</span>
                <CodeBlock text="Bearer pmt_…" label="Bearer pmt_" />
                <span className="block text-xs font-medium text-warning">{t("devSettings.step5Warn")}</span>
              </li>
              <li>{t("devSettings.step6")}</li>
            </ol>
            <p className="rounded-lg bg-surface-soft px-3.5 py-2.5 text-xs leading-relaxed text-text-secondary">{t("devSettings.secretNote")}</p>
          </div>

          <div className="space-y-1.5 border-t border-border-soft pt-4">
            <h4 className="text-small font-semibold text-text">{t("devSettings.methodOauth")}</h4>
            <p className="text-xs leading-relaxed text-text-muted">{t("devSettings.methodOauthBody")}</p>
          </div>

          <p className="border-t border-border-soft pt-4 text-xs leading-relaxed text-text-muted">
            {t("devSettings.moreTools")}{" "}
            <Link href="/developers" className="font-medium text-primary hover:underline">
              {t("devSettings.docsTitle")}
            </Link>
          </p>
        </div>
      </SettingsCard>

      <SettingsCard title={t("devSettings.keysTitle")} hint={t("apiKeys.hint")}>
        <ApiKeysSection />
      </SettingsCard>

      <ConnectedAppsSection />

      <SettingsLinkRow href="/developers" icon={<Code2 size={18} className="text-text-secondary" />} title={t("devSettings.docsTitle")} hint={t("devSettings.docsHint")} />
    </SettingsSubpage>
  );
}
