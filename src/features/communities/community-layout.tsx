"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Topluluk sayfalarının ORTAK yerleşimi (docs/history/186-*). Tek kaynak burasıdır: sayfa genişliği, ana sütun + sağ yardımcı sütun,
 * gönderi akışı ve kompakt başlık. Akış Ana Sayfa'nınkiyle aynıdır (Meydan Faz 6): tek sütun, kutusuz, okunur genişlikte.
 *
 * Genişlik kuralı: sayfa ≤ 1120px (uygulamanın `PageContainer` 1400px'inden bilerek dar — içerik akışı okunur kalsın). `xl`+ (≥1280px)
 * ekranda yardımcı sütun (16.5rem) ana sütunun yanına gelir; daha dar ekranda hiç çizilmez (ana içerik genişliğini bozmaz).
 */
export function CommunityLayout({ children, aside, asideLabel, className }: { children: ReactNode; aside?: ReactNode; asideLabel?: string; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1120px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8", className)}>
      <div className={cn(aside && "xl:grid xl:grid-cols-[minmax(0,1fr)_16.5rem] xl:items-start xl:gap-6")}>
        <div className="min-w-0 space-y-4 sm:space-y-5">{children}</div>
        {aside && (
          <aside className="hidden space-y-3 xl:sticky xl:top-20 xl:block" aria-label={asideLabel} data-testid="community-aside">
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Okuma/form genişliği: ayar, üye, hakkında gibi form ve liste içerikleri geniş ekranda uzamasın. */
export function CommunityReadingColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-3xl", className)}>{children}</div>;
}

/** Kompakt sayfa başlığı: tek satırda başlık + eylemler; açıklama en çok iki satır. */
export function CommunityPageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    // Meydan (docs/history/190-*): a large bold title like every other page header; no icon.
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3" data-testid="community-page-header">
      <div className="min-w-0 flex-1 basis-60 space-y-1">
        <h1 className="break-words text-h1 font-bold leading-tight text-text">{title}</h1>
        {description && <p className="line-clamp-2 max-w-2xl text-small text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * Gönderi akışı (Meydan, docs/history/190-* Faz 6): tek sütun, kutusuz akış — liste `ContentStream` (çizgilerle ayrılmış tek yüzey) ile
 * çizilir, kartlar kendi kutularını bırakır. Akış okunur genişlikte kalır (≤ 3xl; topluluk sayfasında özet ve paylaş satırı da aynı sütunda);
 * geniş ekranda yanında yardımcı sütun durur.
 */
export const FEED_STREAM_CLASS = "max-w-3xl";
/** Akıştaki gönderinin üstündeki bağlam satırı (topluluk adı, "Sabit"): kartın kimlik satırıyla aynı iç boşluk. */
export const FEED_ITEM_CONTEXT_CLASS = "-mb-2 flex items-center gap-2 px-4 pt-3 text-caption text-text-muted";
