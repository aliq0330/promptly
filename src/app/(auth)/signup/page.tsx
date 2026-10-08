"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormIconBadge, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import { translateAuthError } from "@/features/auth/auth-errors";
import { absoluteUrl } from "@/lib/utils";
import { readNextParam } from "@/lib/auth-redirect";
import { useTranslation } from "@/lib/i18n/language-provider";

const PASSWORD_MIN_LENGTH = 6;

/**
 * Real Supabase Auth sign-up. Collects email/password/display name;
 * `handle_new_user` (a database trigger, see `supabase/migrations`)
 * creates the real `profiles` row automatically once `auth.users` gets a
 * new row, reading the display name back out of `user_metadata`.
 */
export default function SignupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!authLoading && session) router.replace(readNextParam() ?? "/");
  }, [authLoading, session, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("auth.passwordMinLengthError", { min: PASSWORD_MIN_LENGTH }));
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: absoluteUrl("/login"),
        },
      });

      if (signUpError) {
        setError(translateAuthError(signUpError.message));
        return;
      }

      // With email confirmation enabled (this project's default), signUp
      // returns a user but no session yet — nothing to redirect into.
      if (data.session) {
        router.push(readNextParam() ?? "/");
      } else {
        setCheckEmail(true);
      }
    } catch {
      // A real network failure throws instead of resolving — see login/page.tsx's comment.
      setError(t("auth.connectionFailedRetry"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <FormIconBadge>
          <MailCheck size={22} />
        </FormIconBadge>
        <h1 className="text-h2 text-text">{t("auth.checkEmailTitle")}</h1>
        <p className="text-sm text-text-muted">
          <strong className="text-text">{email}</strong> {t("auth.checkEmailBodySuffix")}
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 py-4 text-center">
      <FormIconBadge>
        <UserPlus size={22} />
      </FormIconBadge>
      <h1 className="text-h2 text-text">{t("auth.signUp")}</h1>

      <div className="w-full space-y-3 text-left">
        <div>
          <label htmlFor="signup-name" className={fieldLabelClassName}>
            {t("profile.displayNameLabel")}
          </label>
          <input
            id="signup-name"
            type="text"
            required
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
        <div>
          <label htmlFor="signup-email" className={fieldLabelClassName}>
            {t("settings.email")}
          </label>
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
        <div>
          <label htmlFor="signup-password" className={fieldLabelClassName}>
            {t("auth.passwordLabel")}
          </label>
          <input
            id="signup-password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldInputClassName}
          />
          <p className="mt-1 text-xs text-text-muted">{t("auth.minCharsHint", { min: PASSWORD_MIN_LENGTH })}</p>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("auth.creatingAccount") : t("auth.createAccountButton")}
      </Button>
      <p className="text-xs text-text-muted">
        {t("auth.alreadyHaveAccount")}{" "}
        <Link href="/login" className="text-primary hover:underline">
          {t("common.login")}
        </Link>
      </p>
    </form>
  );
}
