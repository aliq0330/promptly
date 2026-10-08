"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormIconBadge, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import { translateAuthError } from "@/features/auth/auth-errors";
import { readNextParam } from "@/lib/auth-redirect";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Real Supabase Auth sign-in (CLAUDE.md section 17) — genuinely
 * authenticates against the connected Supabase project, not mock data.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already signed in — a login form has nothing to do here.
  useEffect(() => {
    if (!authLoading && session) router.replace(readNextParam() ?? "/");
  }, [authLoading, session, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const identifier = email.trim();
      if (identifier.includes("@")) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: identifier,
          password,
        });
        if (signInError) {
          setError(translateAuthError(signInError.message));
          return;
        }
      } else {
        // Username login: resolved server-side (the email never reaches the
        // browser); only a session comes back.
        const { data, error: fnError } = await supabase.functions.invoke("username-login", {
          body: { identifier, password },
        });
        if (fnError || !data?.access_token) {
          const status = (fnError as { context?: Response } | null)?.context?.status;
          setError(
            status === 429 ? t("auth.tooManyAttempts") : t("auth.invalidCredentials"),
          );
          return;
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) {
          setError(t("auth.invalidCredentials"));
          return;
        }
      }
      router.push(readNextParam() ?? "/");
    } catch {
      // A real network failure (not a structured Supabase AuthError) throws
      // instead of resolving — without this, the button would freeze on
      // "Giriş yapılıyor..." forever with no visible error at all.
      setError(t("auth.connectionFailedRetry"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 py-4 text-center">
      <FormIconBadge>
        <LogIn size={22} />
      </FormIconBadge>
      <h1 className="text-h2 text-text">{t("common.login")}</h1>

      <div className="w-full space-y-3 text-left">
        <div>
          <label htmlFor="login-email" className={fieldLabelClassName}>
            {t("auth.emailOrUsername")}
          </label>
          <input
            id="login-email"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="block text-label font-medium text-text">
              {t("auth.passwordLabel")}
            </label>
            <Link href="/reset-password" className="text-xs text-primary hover:underline">
              {t("auth.forgotPassword")}
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("auth.loggingIn") : t("common.login")}
      </Button>
      <p className="text-xs text-text-muted">
        {t("auth.noAccountYet")}{" "}
        <Link href="/signup" className="text-primary hover:underline">
          {t("auth.signUp")}
        </Link>
      </p>
    </form>
  );
}
