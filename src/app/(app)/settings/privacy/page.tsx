"use client";

import { useEffect, useState } from "react";
import { OptionGroup } from "@/components/ui/option-group";
import { useAuth } from "@/features/auth/auth-provider";
import { SettingsCard, SettingsLinkRow, SettingsSubpage } from "@/features/settings/settings-ui";
import { fetchOwnMessagePrivacy, updateMessagePrivacy, type MessagePrivacy } from "@/lib/supabase/profiles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { PresenceSettingsCard } from "@/features/presence/presence-settings";

/** Ayarlar → Gizlilik: kim mesaj atabilir + çevrimiçi durumu (docs/history/329-*) + engellenen kişiler. */
export default function PrivacySettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [messagePrivacy, setMessagePrivacy] = useState<MessagePrivacy | null>(null);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchOwnMessagePrivacy(user.id).then((value) => {
      setMessagePrivacy(value);
    });
  }, [user]);

  async function handlePrivacyChange(value: MessagePrivacy) {
    if (!user || isSavingPrivacy) return;
    const previous = messagePrivacy;
    setMessagePrivacy(value);
    setIsSavingPrivacy(true);
    try {
      await updateMessagePrivacy(user.id, value);
    } catch (err) {
      console.error("updateMessagePrivacy", err);
      setMessagePrivacy(previous);
    } finally {
      setIsSavingPrivacy(false);
    }
  }

  if (loading || !user) return null;

  return (
    <SettingsSubpage title={t("settings.privacyTitle")} description={t("settings.hub.privacyDesc")}>
      <SettingsCard title={t("settings.messagePrivacyTitle")} hint={t("settings.messagePrivacyQuestion")}>
        {messagePrivacy === null ? (
          <p className="text-caption text-text-muted">{t("settings.loadingEllipsis")}</p>
        ) : (
          <OptionGroup<MessagePrivacy>
            ariaLabel={t("settings.messagePrivacyTitle")}
            value={messagePrivacy}
            onChange={(value) => void handlePrivacyChange(value)}
            options={[
              { key: "everyone", label: t("settings.everyone"), description: t("settings.everyoneHint") },
              { key: "followers_only", label: t("settings.followersOnly"), description: t("settings.followersOnlyHint") },
            ]}
          />
        )}
      </SettingsCard>

      <div id="presence">
        <PresenceSettingsCard />
      </div>

      <SettingsLinkRow href="/settings/blocked" title={t("settings.blockedUsers")} hint={t("settings.blockedUsersHint")} />
    </SettingsSubpage>
  );
}
