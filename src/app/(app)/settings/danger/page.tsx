"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fieldInputClassName } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
import { SettingsCard, SettingsSubpage, settingsLabelClassName } from "@/features/settings/settings-ui";
import { deleteOwnAccount } from "@/lib/supabase/account";
import { supabase } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Ayarlar → Tehlikeli bölge: hesabı sil (`delete-account` Edge Function; moderatör hesabı silinemez). */
export default function DangerSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const isModerator = useIsModerator();
  const { profile } = useOwnProfile();
  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteAccount(event: FormEvent) {
    event.preventDefault();
    if (isDeleting || !profile || deleteConfirm.trim().toLowerCase() !== profile.username) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteOwnAccount(deleteConfirm.trim().toLowerCase());
    } catch (err) {
      // Tam silinmedi: oturum açık ve hesap dokunulmamış kalır, nedeni söylenir.
      setDeleteError(err instanceof Error ? err.message : t("settings.deleteAccountFailed"));
      setIsDeleting(false);
      return;
    }
    // Hesap gitti; oturumu ölü, yalnız yerel oturum temizlenir.
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/");
  }

  if (loading || !user) return null;

  return (
    <SettingsSubpage title={t("settings.groupDanger")} description={t("settings.hub.dangerDesc")}>
      <SettingsCard
        as={isModerator ? "div" : "form"}
        onSubmit={handleDeleteAccount}
        title={t("settings.deleteAccountTitle")}
        hint={isModerator ? t("settings.deleteAccountModerator") : t("settings.deleteAccountHint")}
      >
        {!isModerator && profile && (
          <>
            <div>
              <label htmlFor="settings-delete-confirm" className={settingsLabelClassName}>
                {t("settings.deleteAccountConfirmLabel", { username: profile.username })}
              </label>
              <input
                id="settings-delete-confirm"
                type="text"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={isDeleting}
                className={fieldInputClassName}
              />
            </div>
            {deleteError && (
              <p role="alert" className="text-sm text-danger">
                {deleteError}
              </p>
            )}
            <Button type="submit" variant="danger" disabled={isDeleting || deleteConfirm.trim().toLowerCase() !== profile.username}>
              {isDeleting ? t("settings.deleteAccountDeleting") : t("settings.deleteAccountButton")}
            </Button>
          </>
        )}
      </SettingsCard>
    </SettingsSubpage>
  );
}
