"use client";

import { useEffect, useState } from "react";
import { ChoiceCard } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { SettingsCard, SettingsLinkRow, SettingsSubpage } from "@/features/settings/settings-ui";
import { fetchOwnMessagePrivacy, updateMessagePrivacy, type MessagePrivacy } from "@/lib/supabase/profiles";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Ayarlar → Gizlilik: kim mesaj atabilir + engellenen kişiler. */
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
          <p className="text-xs text-text-muted">{t("settings.loadingEllipsis")}</p>
        ) : (
          <div className="space-y-2">
            <ChoiceCard>
              <input type="radio" name="message-privacy" checked={messagePrivacy === "everyone"} onChange={() => handlePrivacyChange("everyone")} className="mt-0.5" />
              <span>
                <span className="font-medium">{t("settings.everyone")}</span>
                <span className="block text-xs text-text-muted">{t("settings.everyoneHint")}</span>
              </span>
            </ChoiceCard>
            <ChoiceCard>
              <input type="radio" name="message-privacy" checked={messagePrivacy === "followers_only"} onChange={() => handlePrivacyChange("followers_only")} className="mt-0.5" />
              <span>
                <span className="font-medium">{t("settings.followersOnly")}</span>
                <span className="block text-xs text-text-muted">{t("settings.followersOnlyHint")}</span>
              </span>
            </ChoiceCard>
          </div>
        )}
      </SettingsCard>

      <SettingsLinkRow href="/settings/blocked" title={t("settings.blockedUsers")} hint={t("settings.blockedUsersHint")} />
    </SettingsSubpage>
  );
}
