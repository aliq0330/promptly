import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";

/**
 * Auth pages: a calm split on desktop (a short statement of what Promptly
 * is, beside the form) and a single centered form card on mobile.
 */
export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden border-r border-border-soft bg-surface p-10 lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="font-display text-[1.2rem] font-semibold tracking-tight text-text">Promptly</span>
        </Link>
        <div className="space-y-5">
          <h2 className="text-display font-semibold text-text">Promptları keşfet, geliştir, paylaş.</h2>
          <p className="max-w-sm text-body text-text-secondary">
            Görsel, metin, kod, video ve müzik promptlarını paylaşan; generatorlarla yapılandırılmış prompt oluşturan bir topluluk.
          </p>
          <div aria-hidden className="space-y-2 pt-2">
            {["cinematic portrait, neon rain, 85mm", "system: you are a senior reviewer…", "lo-fi hip hop, 80 bpm, vinyl crackle"].map(
              (line, index) => (
                <div
                  key={line}
                  className="prompt-text flex max-w-sm items-center gap-2 rounded-md border border-border-soft bg-surface-soft px-3 py-2 text-text-muted"
                  style={{ opacity: 1 - index * 0.25 }}
                >
                  <span className="text-primary">›</span>
                  {line}
                </div>
              ),
            )}
          </div>
        </div>
        <p className="text-caption text-text-muted">Prompt topluluğu</p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
          <BrandMark size={30} />
          <span className="font-display text-[1.15rem] font-semibold tracking-tight text-text">Promptly</span>
        </Link>
        <div className="w-full max-w-sm rounded-lg border border-border-soft bg-surface p-6 shadow-card sm:p-7">{children}</div>
      </div>
    </div>
  );
}
