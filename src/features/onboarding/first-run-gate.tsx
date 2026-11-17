"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "@/components/icons/loader-2";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { firstRunRequired, markFirstRunDone, readFirstRunDone } from "@/lib/first-run-setup";
import { FirstRunSetup } from "./first-run-setup";

/**
 * The gate in front of the whole signed-in app (docs/history/424-*): while a brand-new account has not picked its topics, NOTHING else
 * of the site is rendered — no header, no menus, no page, no feed request — only `FirstRunSetup`. The decision is `firstRunRequired`
 * (account created after the release date, fewer than two topics). Once the gate has opened it stays up until the setup itself finishes, even
 * though saving the topics already makes the profile "complete" (the optional people step still follows).
 *
 * To avoid a flash of the app before the profile is known, a signed-in user with no "done" mark on this device sees a quiet loading screen
 * until the profile arrives; the mark is written as soon as the profile says the setup is not (or no longer) needed, so every later load
 * on that device renders the app at once. A guest, or a session that is still being restored, is never held back.
 */
export function FirstRunGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile, loading } = useOwnProfile();
  const userId = user?.id ?? null;
  const [active, setActive] = useState(false);
  // Remembers a decision per account, so signing in as someone else re-evaluates instead of inheriting the previous one.
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const done = userId !== null && (doneFor === userId || readFirstRunDone(userId));

  const required = Boolean(userId) && !loading && profile !== null && firstRunRequired(profile, done);

  useEffect(() => {
    if (required) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the gate latches open once the profile says it is required
      setActive(true);
    }
  }, [required]);

  useEffect(() => {
    // The profile is known and needs no setup: remember it so this device never waits for the profile again.
    if (userId && !loading && profile !== null && !required && !active) markFirstRunDone(userId);
  }, [userId, loading, profile, required, active]);

  useEffect(() => {
    // Signing out (or switching account) closes a latched gate.
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no signed-in user: nothing to gate
      setActive(false);
    }
  }, [userId]);

  const finish = useCallback(() => {
    if (userId) {
      markFirstRunDone(userId);
      setDoneFor(userId);
    }
    setActive(false);
  }, [userId]);

  if (active && userId) return <FirstRunSetup onDone={finish} />;

  // Signed in, profile still loading, and this device has never confirmed the account: do not show the app yet.
  if (userId && loading && !done) {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center bg-background text-text-muted">
        <Loader2 size={24} className="animate-spin" aria-hidden />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  return <>{children}</>;
}
