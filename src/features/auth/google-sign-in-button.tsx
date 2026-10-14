"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { absoluteUrl } from "@/lib/utils";
import { safeNextPath } from "@/lib/auth-redirect";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Google's multicolour "G". The four fills are Google's mandatory brand colours, so
 * they are the one place hex values are allowed (everything else uses theme tokens).
 */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

/** "veya / or" separator between the email form and the Google button. */
export function AuthDivider() {
  const { t } = useTranslation();
  return (
    <div className="flex w-full items-center gap-3 text-caption text-text-muted" role="separator">
      <span className="h-px flex-1 bg-border-soft" />
      {t("auth.orDivider")}
      <span className="h-px flex-1 bg-border-soft" />
    </div>
  );
}

/**
 * Sign in / sign up with Google through Supabase Auth (the same button for both —
 * Supabase creates the account on first use). The browser is sent to Google and
 * comes back to `/login/`, which already forwards a signed-in visitor to `next`
 * (or home); the session in the returned URL is picked up by supabase-js and
 * `AuthProvider`. `handle_new_user` then creates the profile row.
 *
 * Needs the Google provider enabled in Supabase (Authentication → Providers) and
 * the site URL in the redirect allow-list — see supabase/README.md.
 */
export function GoogleSignInButton({ next }: { next?: string | null }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const safeNext = safeNextPath(next);
      const redirectTo = absoluteUrl(safeNext ? `/login/?next=${encodeURIComponent(safeNext)}` : "/login/");
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } },
      });
      // On success the browser is already navigating to Google; only a failed start returns here.
      if (oauthError) throw oauthError;
    } catch (err) {
      console.error("signInWithOAuth", err);
      setError(t("auth.googleFailed"));
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-2">
      <Button type="button" variant="outline" className="w-full gap-2" onClick={handleClick} disabled={busy}>
        <GoogleLogo />
        {busy ? t("auth.googleRedirecting") : t("auth.continueWithGoogle")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
