"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { PenLine, Sparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { GuestShowcase } from "./guest-showcase";

/**
 * Top of the home page. Signed out: the living showcase (`GuestShowcase`, docs/history/209-*) — the community's most
 * liked pictures drifting by, each opening its prompt — or, when there are too few pictures, a compact explanation of
 * what Promptly is. Signed in: a composer row (avatar + "share" field + the creation paths), never a large hero.
 */
export function HomeIntro() {
  const { user, loading } = useAuth();
  const { profile } = useOwnProfile();
  const { t } = useTranslation();
  const [showcaseUnavailable, setShowcaseUnavailable] = useState(false);
  const fallBack = useCallback(() => setShowcaseUnavailable(true), []);

  if (loading) return <div className="h-14 sm:h-[74px]" aria-hidden />;

  if (user) {
    // Meydan (docs/history/190-*): a composer row instead of a greeting card — the
    // whole row opens the create form, the two buttons pick the kind directly. On a phone it is a bare row, no card (docs/history/227-*).
    return (
      <section aria-label={t("home.sharePrompt")} className="flex items-center gap-3 sm:rounded-xl sm:border sm:border-border-soft sm:bg-surface sm:p-4">
        <Avatar src={profile?.avatarUrl ?? null} alt={profile?.displayName ?? ""} size={42} />
        <Link
          href="/create?mode=prompt"
          className="min-w-0 flex-1 truncate rounded-full bg-surface-soft px-4 py-3 text-small text-text-muted sm:py-2.5 transition-colors hover:bg-border-soft hover:text-text-secondary"
        >
          {t("home.composerPlaceholder")}
        </Link>
        <div className="hidden sm:block">
          <QuickActions />
        </div>
      </section>
    );
  }

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
        <PenLine size={15} />
        {t("home.sharePrompt")}
      </Link>
      <Link href="/requests/new" className={buttonClassName({ size: "sm", variant: "ghost" })}>
        <Sparkles size={15} />
        {t("home.openRequest")}
      </Link>
    </div>
  );
}
