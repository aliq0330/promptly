"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, fieldInputClassName } from "@/components/ui/field";
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
import { Eyebrow } from "@/features/content/detail-parts";

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
    <div className="mx-auto w-full max-w-xl animate-fade-in px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-10">
      <header className="mb-8 space-y-2">
        <h1 className="text-h1 text-text">{t("settings.pageTitle")}</h1>
        <p className="text-small text-text-secondary">
          {t("settings.profileHintBefore")}{" "}
          <Link href="/profile/edit" className="font-medium text-primary hover:underline">
            {t("settings.profileHintLink")}
          </Link>{" "}
          {t("settings.profileHintAfter")}
        </p>
      </header>

      <div className="space-y-9">
        {isModerator && (
          <SettingsLinkRow
            href="/moderation"
            icon={<ShieldCheck size={18} className="text-primary" />}
            title={t("nav.moderation")}
          />
        )}

        <SettingsGroup id="settings-account" title={t("settings.groupAccount")}>
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
        </SettingsGroup>

        <SettingsGroup id="settings-privacy" title={t("settings.privacyTitle")}>
          <SettingsCard title={t("settings.messagePrivacyTitle")} hint={t("settings.messagePrivacyQuestion")}>
            {messagePrivacy === null ? (
              <p className="text-xs text-text-muted">{t("settings.loadingEllipsis")}</p>
            ) : (
              <div className="space-y-2">
                <ChoiceCard>
                  <input
                    type="radio"
                    name="message-privacy"
                    checked={messagePrivacy === "everyone"}
                    onChange={() => handlePrivacyChange("everyone")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{t("settings.everyone")}</span>
                    <span className="block text-xs text-text-muted">{t("settings.everyoneHint")}</span>
                  </span>
                </ChoiceCard>
                <ChoiceCard>
                  <input
                    type="radio"
                    name="message-privacy"
                    checked={messagePrivacy === "followers_only"}
                    onChange={() => handlePrivacyChange("followers_only")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{t("settings.followersOnly")}</span>
                    <span className="block text-xs text-text-muted">{t("settings.followersOnlyHint")}</span>
                  </span>
                </ChoiceCard>
              </div>
            )}
          </SettingsCard>

          <SettingsLinkRow href="/settings/blocked" title={t("settings.blockedUsers")} hint={t("settings.blockedUsersHint")} />
        </SettingsGroup>

        <SettingsGroup id="settings-preferences" title={t("settings.groupPreferences")}>
          <SettingsCard title={t("settings.appearanceTitle")} hint={t("settings.appearanceHint")}>
            <AppearancePicker />
          </SettingsCard>
          <LanguageSection t={t} language={language} setLanguage={setLanguage} />
        </SettingsGroup>

        <div className="border-t border-border-soft pt-6">
          <Button type="button" variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
            <LogOut size={14} />
            {isSigningOut ? t("settings.signingOut") : t("settings.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}

const settingsLabelClassName = "mb-1.5 block text-small text-text-secondary";

/** A titled group of setting cards — the editorial eyebrow over a stack. */
function SettingsGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <Eyebrow as="h2" id={id} className="px-1">
        {title}
      </Eyebrow>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** One raised settings card; renders as a `<form>` when it submits. */
function SettingsCard({
  as = "div",
  onSubmit,
  title,
  hint,
  children,
}: {
  as?: "div" | "form";
  onSubmit?: (event: FormEvent) => void;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const Tag = as;
  return (
    <Tag
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="space-y-1">
        <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-text">{title}</h3>
        {hint && <p className="text-xs leading-relaxed text-text-muted">{hint}</p>}
      </div>
      {children}
    </Tag>
  );
}

/** A full-width navigational settings row (moderation, blocked users). */
function SettingsLinkRow({
  href,
  icon,
  title,
  hint,
}: {
  href: string;
  icon?: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card transition-colors duration-200 ease-soft hover:border-border-strong sm:px-5"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold tracking-[-0.01em] text-text">{title}</span>
        {hint && <span className="block text-xs text-text-muted">{hint}</span>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform duration-200 ease-soft group-hover:translate-x-0.5" />
    </Link>
  );
}

/**
 * Client-only language preference (no `profiles` column, no migration —
 * same localStorage-backed pattern as `ThemeProvider`/`ThemeToggle`).
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
    <SettingsCard title={t("settings.languageTitle")} hint={t("settings.languageHint")}>
      <div className="grid gap-2 sm:grid-cols-2">
        {/* Language names are shown in their own native form (not translated via t()) —
            switching to English shouldn't relabel "Türkçe" as "Turkish", or a user in
            English mode would have no way to tell which option gets them back. */}
        <ChoiceCard className="items-center">
          <input type="radio" name="language" checked={language === "tr"} onChange={() => setLanguage("tr")} />
          <span className="font-medium">Türkçe</span>
        </ChoiceCard>
        <ChoiceCard className="items-center">
          <input type="radio" name="language" checked={language === "en"} onChange={() => setLanguage("en")} />
          <span className="font-medium">English</span>
        </ChoiceCard>
      </div>
    </SettingsCard>
  );
}
