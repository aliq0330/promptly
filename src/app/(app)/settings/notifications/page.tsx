"use client";

import { useAuth } from "@/features/auth/auth-provider";
import { NotificationSettings } from "@/features/settings/notification-settings";
import { SettingsSubpage } from "@/features/settings/settings-ui";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Ayarlar → Bildirimler (docs/history/326-*): tür anahtarları, sessize alınanlar, ertelenenler. Zil panelindeki ayar simgesi buraya gelir. */
export default function NotificationSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  if (loading || !user) return null;
  return (
    <SettingsSubpage title={t("nc.settings.title")} description={t("nc.settings.desc")}>
      <NotificationSettings />
    </SettingsSubpage>
  );
}
