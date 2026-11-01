"use client";

import { FileText, Lock } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { SettingsLinkRow, SettingsSubpage } from "@/features/settings/settings-ui";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Ayarlar → Yasal: Kullanım Koşulları ve Gizlilik Politikası (herkese açık sayfalara bağlantılar). */
export default function LegalSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  if (loading || !user) return null;

  return (
    <SettingsSubpage title={t("legal.groupTitle")} description={t("settings.hub.legalDesc")}>
      <section aria-labelledby="settings-legal" className="space-y-3">
        <h2 id="settings-legal" className="sr-only">
          {t("legal.groupTitle")}
        </h2>
        <SettingsLinkRow href="/terms" icon={<FileText size={18} className="text-text-secondary" />} title={t("legal.termsTitle")} hint={t("legal.termsHint")} />
        <SettingsLinkRow href="/privacy" icon={<Lock size={18} className="text-text-secondary" />} title={t("legal.privacyTitle")} hint={t("legal.privacyHint")} />
      </section>
    </SettingsSubpage>
  );
}
