"use client";

import Link from "next/link";
import { Blocks, PenLine, Sparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";

/**
 * Top of the home page. Signed out: a compact explanation of what Promptly
 * is — deliberately short so the feed starts above the fold. Signed in: a
 * one-line greeting with the three creation paths. Never a large hero.
 */
export function HomeIntro() {
  const { user, loading } = useAuth();
  const { profile } = useOwnProfile();

  if (loading) return <div className="h-[92px]" aria-hidden />;

  if (user) {
    return (
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 font-semibold text-text">
            Merhaba{profile ? `, ${profile.displayName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-small text-text-muted">Bugün hangi promptu paylaşacaksın?</p>
        </div>
        <QuickActions />
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-lg border border-border-soft bg-surface px-5 py-6 shadow-card sm:px-7 sm:py-7">
      <div className="relative z-10 max-w-xl space-y-3">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-primary">Prompt topluluğu</p>
        <h1 className="text-h1 font-semibold text-text sm:text-display">Promptları keşfet, geliştir, paylaş.</h1>
        <p className="text-small text-text-secondary sm:text-body">
          Görsel, metin, kod, video ve müzik için promptlar; generatorlarla yapılandırılmış prompt oluşturma ve
          topluluktan prompt istekleri — hepsi tek yerde.
        </p>
        <div className="pt-1">
          <QuickActions />
        </div>
      </div>
      <PromptMotif />
    </section>
  );
}

function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/create?mode=prompt" className={buttonClassName({ size: "sm" })}>
        <PenLine size={15} />
        Prompt paylaş
      </Link>
      <Link href="/generators" className={buttonClassName({ size: "sm", variant: "outline" })}>
        <Blocks size={15} />
        Generator kullan
      </Link>
      <Link href="/requests/new" className={buttonClassName({ size: "sm", variant: "ghost" })}>
        <Sparkles size={15} />
        İstek aç
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
