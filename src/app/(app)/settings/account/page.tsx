"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClassName } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { translateAuthError } from "@/features/auth/auth-errors";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { SettingsCard, SettingsSubpage, settingsLabelClassName } from "@/features/settings/settings-ui";
import { supabase } from "@/lib/supabase/client";
import { updateOwnUsername, USERNAME_PATTERN } from "@/lib/supabase/profiles";
import { absoluteUrl } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

const PASSWORD_MIN_LENGTH = 6;

/** Ayarlar → Hesap: kullanıcı adı, e-posta, şifre (gerçek Supabase hesabı; profil alanları `/profile/edit`'te). */
export default function AccountSettingsPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const { profile, refresh: refreshProfile } = useOwnProfile();
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [newUsername, setNewUsername] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleChangeEmail(event: FormEvent) {
    event.preventDefault();
    if (isSavingEmail) return;
    setEmailError(null);
    setEmailSent(false);
    const next = newEmail.trim();
    if (!next || next.toLowerCase() === (user?.email ?? "").toLowerCase()) {
      setEmailError(t("settings.emailSame"));
      return;
    }
    setIsSavingEmail(true);
    const { error: updateError } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: absoluteUrl("/settings/account") });
    setIsSavingEmail(false);
    if (updateError) {
      setEmailError(translateAuthError(updateError.message));
      return;
    }
    setNewEmail("");
    setEmailSent(true);
  }

  async function handleChangeUsername(event: FormEvent) {
    event.preventDefault();
    if (isSavingUsername || !user) return;
    setUsernameError(null);
    setUsernameSaved(false);
    const next = (newUsername ?? "").trim().toLowerCase();
    if (next === profile?.username) {
      setUsernameError(t("settings.usernameSame"));
      return;
    }
    if (!USERNAME_PATTERN.test(next)) {
      setUsernameError(t("settings.usernameInvalid"));
      return;
    }
    setIsSavingUsername(true);
    try {
      await updateOwnUsername(user.id, next);
      await refreshProfile();
      setUsernameSaved(true);
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : t("settings.usernameInvalid"));
    } finally {
      setIsSavingUsername(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setSuccess(false);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`${t("settings.passwordTooShortPrefix")} ${PASSWORD_MIN_LENGTH} ${t("settings.passwordTooShortSuffix")}`);
      return;
    }
    if (password !== confirmPassword) {
      setError(t("settings.passwordMismatch"));
      return;
    }
    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);
    if (updateError) {
      setError(translateAuthError(updateError.message));
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  // Rota `RequireAuth` içinde; misafir buraya gelmez.
  if (loading || !user) return null;

  return (
    <SettingsSubpage title={t("settings.groupAccount")} description={t("settings.hub.accountDesc")}>
      <SettingsCard as="form" onSubmit={handleChangeUsername} title={t("settings.usernameTitle")} hint={t("settings.usernameHint")}>
        <div>
          <label htmlFor="settings-username" className={settingsLabelClassName}>
            {t("settings.usernameLabel")}
          </label>
          <input
            id="settings-username"
            type="text"
            required
            minLength={3}
            maxLength={30}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={newUsername ?? profile?.username ?? ""}
            onChange={(event) => setNewUsername(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
        {usernameError && <p className="text-sm text-danger">{usernameError}</p>}
        {usernameSaved && <p className="text-sm text-success">{t("settings.usernameUpdated")}</p>}
        <Button type="submit" size="sm" disabled={isSavingUsername || !profile}>
          {isSavingUsername ? t("settings.updating") : t("settings.updateUsername")}
        </Button>
      </SettingsCard>

      <SettingsCard as="form" onSubmit={handleChangeEmail} title={t("settings.changeEmail")}>
        <div className="rounded-lg bg-surface-soft px-3.5 py-2.5">
          <p className="mb-0.5 text-caption font-medium text-text-muted">{t("settings.email")}</p>
          <p className="break-all text-sm text-text">{user.email}</p>
        </div>
        <div>
          <label htmlFor="settings-new-email" className={settingsLabelClassName}>
            {t("settings.newEmail")}
          </label>
          <input
            id="settings-new-email"
            type="email"
            required
            autoComplete="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
        {emailError && <p className="text-sm text-danger">{emailError}</p>}
        {emailSent && <p className="text-sm text-success">{t("settings.emailConfirmationSent")}</p>}
        <Button type="submit" size="sm" disabled={isSavingEmail}>
          {isSavingEmail ? t("settings.updating") : t("settings.updateEmail")}
        </Button>
      </SettingsCard>

      <SettingsCard as="form" onSubmit={handleChangePassword} title={t("settings.changePassword")}>
        <div>
          <label htmlFor="settings-password" className={settingsLabelClassName}>
            {t("settings.newPassword")}
          </label>
          <input
            id="settings-password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
        <div>
          <label htmlFor="settings-confirm-password" className={settingsLabelClassName}>
            {t("settings.newPasswordConfirm")}
          </label>
          <input
            id="settings-confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {success && <p className="text-sm text-success">{t("settings.passwordUpdated")}</p>}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? t("settings.updating") : t("settings.updatePassword")}
        </Button>
      </SettingsCard>
    </SettingsSubpage>
  );
}
