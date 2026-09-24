"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { LogIn, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import { translateAuthError } from "@/features/auth/auth-errors";
import { fetchOwnMessagePrivacy, updateMessagePrivacy, type MessagePrivacy } from "@/lib/supabase/profiles";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Language, TranslationKey } from "@/lib/i18n/translations";
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

  if (loading) return null;

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-surface text-primary">
            <Settings size={28} />
          </div>
          <h1 className="text-h1 font-semibold text-text">{t("settings.pageTitle")}</h1>
          <p className="max-w-sm text-sm text-text-muted">{t("settings.notLoggedInBody")}</p>
          <Link
            href="/login"
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
          >
            <LogIn size={14} />
            {t("settings.login")}
          </Link>
        </div>

        <AppearanceSection t={t} />
        <LanguageSection t={t} language={language} setLanguage={setLanguage} />
      </div>
    );
  }

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
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t("settings.email")}
          </p>
          <p className="text-sm text-text">{user.email}</p>
        </div>

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
