"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import { translateAuthError } from "@/features/auth/auth-errors";
import {
  fetchOwnMessagePrivacy,
  updateMessagePrivacy,
  updateOwnUsername,
  USERNAME_PATTERN,
  type MessagePrivacy,
} from "@/lib/supabase/profiles";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { absoluteUrl } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Language, TranslationKey } from "@/lib/i18n/translations";
import { useIsModerator } from "@/features/moderation/use-is-moderator";
import { AppearancePicker } from "@/components/theme/appearance-picker";

const PASSWORD_MIN_LENGTH = 6;

/**
 * Real account settings — shows the actual Supabase-authenticated user's
 * email, a genuinely working password change, and sign out. Profile fields
 * (display name/bio/avatar/interests) live separately at `/profile/edit`,
 * which edits the real `profiles` row.
 */
export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { t, language, setLanguage } = useTranslation();
  const isModerator = useIsModerator();
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
  const [isSigningOut, setIsSigningOut] = useState(false);
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
    const { error: updateError } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: absoluteUrl("/settings") },
    );
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

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
  }

  // The route is wrapped in <RequireAuth>, so a guest never gets here.
  if (loading || !user) return null;

  return (
    <div className="mx-auto max-w-md px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <h1 className="mb-1 text-h1 font-semibold text-text">{t("settings.pageTitle")}</h1>
      <p className="mb-6 text-sm text-text-muted">
        {t("settings.profileHintBefore")}{" "}
        <Link href="/profile/edit" className="text-primary hover:underline">
          {t("settings.profileHintLink")}
        </Link>{" "}
        {t("settings.profileHintAfter")}
      </p>

      <div className="space-y-6">
        {isModerator && (
          <Link
            href="/moderation"
            className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm font-medium text-text hover:bg-surface-soft"
          >
            <ShieldCheck size={18} className="text-primary" />
            {t("nav.moderation")}
          </Link>
        )}
        <form onSubmit={handleChangeUsername} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text">{t("settings.usernameTitle")}</p>
          <p className="text-xs text-text-muted">{t("settings.usernameHint")}</p>
          <div>
            <label htmlFor="settings-username" className="mb-1.5 block text-sm text-text-muted">
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
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
          {usernameError && <p className="text-sm text-danger">{usernameError}</p>}
          {usernameSaved && <p className="text-sm text-primary">{t("settings.usernameUpdated")}</p>}
          <Button type="submit" size="sm" disabled={isSavingUsername || !profile}>
            {isSavingUsername ? t("settings.updating") : t("settings.updateUsername")}
          </Button>
        </form>

        <form onSubmit={handleChangeEmail} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text">{t("settings.changeEmail")}</p>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t("settings.email")}
            </p>
            <p className="text-sm text-text">{user.email}</p>
          </div>
          <div>
            <label htmlFor="settings-new-email" className="mb-1.5 block text-sm text-text-muted">
              {t("settings.newEmail")}
            </label>
            <input
              id="settings-new-email"
              type="email"
              required
              autoComplete="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
          {emailError && <p className="text-sm text-danger">{emailError}</p>}
          {emailSent && <p className="text-sm text-primary">{t("settings.emailConfirmationSent")}</p>}
          <Button type="submit" size="sm" disabled={isSavingEmail}>
            {isSavingEmail ? t("settings.updating") : t("settings.updateEmail")}
          </Button>
        </form>

        <form onSubmit={handleChangePassword} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text">{t("settings.changePassword")}</p>
          <div>
            <label htmlFor="settings-password" className="mb-1.5 block text-sm text-text-muted">
              {t("settings.newPassword")}
            </label>
            <input
              id="settings-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
          <div>
            <label htmlFor="settings-confirm-password" className="mb-1.5 block text-sm text-text-muted">
              {t("settings.newPasswordConfirm")}
            </label>
            <input
              id="settings-confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          {success && <p className="text-sm text-primary">{t("settings.passwordUpdated")}</p>}
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? t("settings.updating") : t("settings.updatePassword")}
          </Button>
        </form>

        <h2 className="pt-2 text-h3 font-semibold text-text">{t("settings.privacyTitle")}</h2>
        <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text">{t("settings.messagePrivacyTitle")}</p>
          <p className="text-xs text-text-muted">{t("settings.messagePrivacyQuestion")}</p>
          {messagePrivacy === null ? (
            <p className="text-xs text-text-muted">{t("settings.loadingEllipsis")}</p>
          ) : (
            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2 text-sm text-text">
                <input
                  type="radio"
                  name="message-privacy"
                  checked={messagePrivacy === "everyone"}
                  onChange={() => handlePrivacyChange("everyone")}
                  className="mt-0.5"
                />
                <span>
                  {t("settings.everyone")}
                  <span className="block text-xs text-text-muted">{t("settings.everyoneHint")}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-text">
                <input
                  type="radio"
                  name="message-privacy"
                  checked={messagePrivacy === "followers_only"}
                  onChange={() => handlePrivacyChange("followers_only")}
                  className="mt-0.5"
                />
                <span>
                  {t("settings.followersOnly")}
                  <span className="block text-xs text-text-muted">{t("settings.followersOnlyHint")}</span>
                </span>
              </label>
            </div>
          )}
        </div>

        <Link href="/settings/blocked" className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
          <span>
            <span className="block text-sm font-medium text-text">{t("settings.blockedUsers")}</span>
            <span className="block text-xs text-text-muted">{t("settings.blockedUsersHint")}</span>
          </span>
          <ChevronRight size={16} className="text-text-muted" />
        </Link>

        <AppearanceSection t={t} />
        <LanguageSection t={t} language={language} setLanguage={setLanguage} />

        <Button type="button" variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
          <LogOut size={14} />
          {isSigningOut ? t("settings.signingOut") : t("settings.signOut")}
        </Button>
      </div>
    </div>
  );
}

/** Palette + light/dark mode — client-only, same storage model as the language preference. */
function AppearanceSection({ t }: { t: (key: TranslationKey) => string }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-medium text-text">{t("settings.appearanceTitle")}</p>
        <p className="text-xs text-text-muted">{t("settings.appearanceHint")}</p>
      </div>
      <AppearancePicker />
    </div>
  );
}

/**
 * Client-only language preference (no `profiles` column, no migration —
 * same localStorage-backed pattern as `ThemeProvider`/`ThemeToggle`).
 * Rendered both signed-in and signed-out: unlike account fields, this
 * isn't tied to a real Supabase user.
 */
function LanguageSection({
  t,
  language,
  setLanguage,
}: {
  t: (key: TranslationKey) => string;
  language: Language;
  setLanguage: (language: Language) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm font-medium text-text">{t("settings.languageTitle")}</p>
      <p className="text-xs text-text-muted">{t("settings.languageHint")}</p>
      <div className="space-y-2 pt-1">
        {/* Language names are shown in their own native form (not translated via t()) —
            switching to English shouldn't relabel "Türkçe" as "Turkish", or a user in
            English mode would have no way to tell which option gets them back. */}
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name="language"
            checked={language === "tr"}
            onChange={() => setLanguage("tr")}
          />
          Türkçe
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name="language"
            checked={language === "en"}
            onChange={() => setLanguage("en")}
          />
          English
        </label>
      </div>
    </div>
  );
}
