"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { buttonClassName } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { GuestShowcase } from "./guest-showcase";

/**
 * Top of the home page. Signed out: the living showcase (`GuestShowcase`, docs/history/209-*) — the community's most
 * liked pictures drifting by, each opening its prompt — or, when there are too few pictures, a compact explanation of
 * what Promptly is. Signed in: nothing.
 */
export function HomeIntro() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [showcaseUnavailable, setShowcaseUnavailable] = useState(false);
  const fallBack = useCallback(() => setShowcaseUnavailable(true), []);

  // Signed in: nothing here — creating lives in the "+" button / "Oluştur" (the composer row was removed).
  if (loading || user) return null;

  if (!showcaseUnavailable) return <GuestShowcase onUnavailable={fallBack} />;

  return (
    <section className="relative overflow-hidden rounded-xl border border-border-soft bg-surface px-5 py-7 shadow-card sm:px-8 sm:py-9">
      <div className="relative z-10 max-w-xl space-y-3">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-primary">{t("nav.tagline")}</p>
        <h1 className="text-h1 font-semibold text-text sm:text-display">{t("home.heroTitle")}</h1>
        <p className="text-small text-text-secondary sm:text-body">{t("home.heroDescription")}</p>
        <div className="pt-1">
          <QuickActions />
        </div>
      </div>
    </section>
  );
}

function QuickActions() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/create?mode=prompt" className={buttonClassName({ size: "sm" })}>
        <SquareTerminal size={15} />
        {t("home.sharePrompt")}
      </Link>
      <Link href="/requests/new" className={buttonClassName({ size: "sm", variant: "ghost" })}>
        <Sparkles size={15} />
        {t("home.openRequest")}
      </Link>
    </div>
  );
}
