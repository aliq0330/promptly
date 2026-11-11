"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark, BrandWordmark } from "@/components/layout/brand-mark";
import { AuthShowcase } from "@/features/auth/auth-showcase";
import { LineArtScene } from "@/components/line-art/line-art-scene";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Auth pages: a calm split on desktop (a short statement of what Promptly
 * is with a coverflow of favourite prompts, beside the form) and a single centered form card on mobile.
 * On a tall enough desktop window the panel ends in the "Meydan" line-art scene (docs/history/372-*), edge to edge.
 */
export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden border-r border-border-soft bg-surface p-10 lg:flex">
        <Link href="/" className="flex items-center gap-2" aria-label="Promptly">
          <BrandMark size={34} />
          <BrandWordmark className="text-[1.6rem]" />
        </Link>
        <div className="space-y-5">
          <h2 className="max-w-md text-display text-text">{t("home.heroTitle")}</h2>
          <p className="max-w-sm text-body text-text-secondary">
            {t("auth.taglineDescription")}
          </p>
          <AuthShowcase />
        </div>
        <div>
          <p className="text-caption text-text-muted">{t("nav.tagline")}</p>
          {/* Only where it fits under the coverflow without squeezing it; hidden scenes are not drawn. */}
          <LineArtScene kind="meydan" className="-mx-10 -mb-10 mt-6 hidden aspect-[2/1] border-t border-border-soft [@media(min-height:980px)]:block" />
        </div>
      </aside>

      <main id="main-content" className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden" aria-label="Promptly">
          <BrandMark size={32} />
          <BrandWordmark className="text-[1.5rem]" />
        </Link>
        <div className="w-full max-w-sm animate-rise-in rounded-xl border border-border-soft bg-surface p-6 shadow-card sm:p-8">{children}</div>
      </main>
    </div>
  );
}
