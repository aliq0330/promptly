"use client";

import Link from "next/link";
import { Blocks, PenLine, Sparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { HeaderArt } from "@/components/ui/header-art";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Top of the home page. Signed out: a compact explanation of what Promptly
 * is — deliberately short so the feed starts above the fold. Signed in: a
 * one-line greeting with the three creation paths. Never a large hero.
 */
export function HomeIntro() {
  const { user, loading } = useAuth();
  const { profile } = useOwnProfile();
  const { t } = useTranslation();

  if (loading) return <div className="h-[92px]" aria-hidden />;

  if (user) {
    return (
      <section className="relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border-soft bg-surface px-4 py-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <HeaderArt variant="home" className="absolute right-0 top-0 hidden h-full opacity-80 lg:block" />
        <div className="relative z-10">
          <h1 className="text-h2 font-semibold text-text">
            {t("home.greeting")}{profile ? `, ${profile.displayName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-small text-text-muted">{t("home.greetingSubtitle")}</p>
        </div>
        <div className="relative z-10 lg:mr-56">
          <QuickActions />
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-lg border border-border-soft bg-surface px-5 py-6 shadow-card sm:px-7 sm:py-7">
      <div className="relative z-10 max-w-xl space-y-3">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-primary">{t("nav.tagline")}</p>
        <h1 className="text-h1 font-semibold text-text sm:text-display">{t("home.heroTitle")}</h1>
        <p className="text-small text-text-secondary sm:text-body">{t("home.heroDescription")}</p>
        <div className="pt-1">
          <QuickActions />
        </div>
      </div>
      <PromptMotif />
      <HeaderArt variant="home" className="absolute -right-3 -top-1 h-24 opacity-50 sm:h-full sm:opacity-90 lg:hidden" />
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
      <Link href="/generators" className={buttonClassName({ size: "sm", variant: "outline" })}>
        <Blocks size={15} />
        {t("home.useGenerator")}
      </Link>
      <Link href="/requests/new" className={buttonClassName({ size: "sm", variant: "ghost" })}>
        <Sparkles size={15} />
        {t("home.openRequest")}
      </Link>
    </div>
  );
}

/** Decorative only: a stack of prompt lines — the platform's subject, not a picture. */
function PromptMotif() {
  const lines = [
    "cinematic portrait, neon rain, 85mm",
    "system: you are a senior reviewer…",
    "lo-fi hip hop, 80 bpm, vinyl crackle",
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute right-6 top-1/2 hidden w-[320px] -translate-y-1/2 space-y-2 lg:block">
      {lines.map((line, index) => (
        <div
          key={line}
          className="prompt-text flex items-center gap-2 rounded-md border border-border-soft bg-surface-soft px-3 py-2 text-text-muted"
          style={{ marginLeft: index * 18, opacity: 1 - index * 0.22 }}
        >
          <span className="text-primary">›</span>
          <span className="truncate">{line}</span>
          {index === 0 && <span className="ml-auto h-3.5 w-1.5 animate-pulse rounded-[1px] bg-primary" />}
        </div>
      ))}
    </div>
  );
}
