"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Auth pages: a calm split on desktop (a short statement of what Promptly
 * is, beside the form) and a single centered form card on mobile.
 */
export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden border-r border-border-soft bg-surface p-10 lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="font-serif text-[1.35rem] font-semibold tracking-[-0.02em] text-text">Promptly</span>
        </Link>
        <div className="space-y-5">
          <h2 className="max-w-md text-display text-text">{t("home.heroTitle")}</h2>
          <p className="max-w-sm text-body text-text-secondary">
            {t("auth.taglineDescription")}
          </p>
          <div aria-hidden className="space-y-2 pt-2">
            {["cinematic portrait, neon rain, 85mm", "system: you are a senior reviewer…", "lo-fi hip hop, 80 bpm, vinyl crackle"].map(
              (line, index) => (
                <div
                  key={line}
                  className="prompt-text flex max-w-sm items-center gap-2 rounded-lg border border-border-soft bg-surface-soft px-3 py-2 text-text-muted shadow-xs"
                  style={{ opacity: 1 - index * 0.25 }}
                >
                  <span className="text-primary">›</span>
                  {line}
                </div>
              ),
            )}
          </div>
        </div>
        <p className="text-caption text-text-muted">{t("nav.tagline")}</p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
          <BrandMark size={30} />
          <span className="font-serif text-[1.3rem] font-semibold tracking-[-0.02em] text-text">Promptly</span>
        </Link>
        <div className="w-full max-w-sm animate-rise-in rounded-xl border border-border-soft bg-surface p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </div>
  );
}
