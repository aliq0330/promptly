"use client";

import Link from "next/link";
import { PenLine, Sparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { ShareComposer } from "./share-composer";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Top of the home page. Signed out: a compact explanation of what Promptly
 * is — deliberately short so the feed starts above the fold. Signed in: the
 * share composer (field + target picker + create button). Never a large hero.
 */
export function HomeIntro() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) return <div className="h-[74px]" aria-hidden />;

  // Signed in: the composer with the share-target picker (`ShareComposer`, docs/history/197-*).
  if (user) return <ShareComposer />;

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
