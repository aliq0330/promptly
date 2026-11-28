"use client";

import { FileText } from "@/components/icons/file-text";
import { Lock } from "@/components/icons/lock";
import { useAuth } from "@/features/auth/auth-provider";
import { SettingsLinkCard, SettingsLinkRow, SettingsSubpage } from "@/features/settings/settings-ui";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Ayarlar → Yasal: Kullanım Koşulları ve Gizlilik Politikası (herkese açık sayfalara bağlantılar). */
export default function LegalSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  if (loading || !user) return null;

  return (
    <SettingsSubpage title={t("legal.groupTitle")} description={t("settings.hub.legalDesc")}>
      <SettingsLinkCard id="settings-legal" label={t("legal.groupTitle")}>
        <SettingsLinkRow href="/terms" icon={<FileText size={20} className="text-text-secondary" />} title={t("legal.termsTitle")} hint={t("legal.termsHint")} />
        <SettingsLinkRow href="/privacy" icon={<Lock size={20} className="text-text-secondary" />} title={t("legal.privacyTitle")} hint={t("legal.privacyHint")} />
      </SettingsLinkCard>
    </SettingsSubpage>
  );
}
