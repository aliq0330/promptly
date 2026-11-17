"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Sohbet açılırken (konuşma + ilk mesaj sayfası gelene dek) çıplak bir "Yükleniyor…" yazısı yerine sohbetin iskeleti: üst çubuk + birkaç
 * baloncuk. Ekran okuyucu için tek `role="status"` metni vardır; sayfa kayması yoktur (sohbetin gerçek yüksekliğini kaplar).
 */
export function ChatLoadingSkeleton({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("common.loadingAriaLabel")} data-chat-loading="" className={cn("flex h-full min-h-[60dvh] flex-col", className)}>
      <span className="sr-only">{t("common.loading")}</span>
      <div aria-hidden className="flex items-center gap-3 border-b border-border-soft px-4 py-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div aria-hidden className="flex flex-1 flex-col justify-end gap-3 px-4 py-4">
        <Skeleton className="h-10 w-2/3 self-start rounded-lg" />
        <Skeleton className="h-10 w-1/2 self-end rounded-lg" />
        <Skeleton className="h-16 w-3/5 self-start rounded-lg" />
        <Skeleton className="h-10 w-2/5 self-end rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Sohbet yüklenemedi (ağ/sunucu hatası): "Yükleniyor…" sonsuza dek kalmaz; kişiye yeniden deneme ve listeye dönüş verilir.
 * Bu "konuşma bulunamadı" DEĞİLDİR — o, sunucunun net cevabıdır; burada cevap hiç gelmedi.
 */
export function ChatLoadFailed({ onRetry, back }: { onRetry: () => void; back: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div role="alert" data-chat-load-failed="" className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="mb-2 text-h2 text-text">{t("messages.chatLoadFailedTitle")}</h1>
      <p className="mb-4 text-small text-text-muted">{t("messages.chatLoadFailedBody")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="primary" size="md" onClick={onRetry}>
          {t("common.retry")}
        </Button>
        {back}
      </div>
    </div>
  );
}
