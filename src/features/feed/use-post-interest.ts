"use client";

import { useCallback, useEffect, useState } from "react";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchContentInterests, interestKey, setContentInterest, type InterestTarget, type InterestValue } from "@/lib/supabase/content-interest";
import { friendlyServerMessage } from "@/lib/supabase/server-errors";

/**
 * Bir gönderinin ⋮ menüsündeki "İlgimi çekiyor / çekmiyor" (docs/history/480-*): akış listesi dışında (profil, arama, koleksiyon…) de çalışsın diye menü kendi
 * cevabını okur ve yazar. Cevap YALNIZ "Sana özel"i etkiler (docs/history/275-*). `target` null iken (menü kapalı ya da satır yok) hiçbir istek atılmaz.
 * Sana özel / Keşfet akışı kendi durumunu `useInterestFeedback` ile yönetir ve satırları ekstra olarak getirir; o zaman bu kanca kullanılmaz.
 */
export function usePostInterest(target: InterestTarget | null) {
  const { t } = useTranslation();
  const kind = target?.kind ?? null;
  const id = target?.id ?? null;
  const [loaded, setLoaded] = useState<{ key: string; value: InterestValue | null } | null>(null);
  const [override, setOverride] = useState<{ key: string; value: InterestValue | null } | null>(null);
  const key = kind && id ? interestKey({ kind, id }) : null;

  useEffect(() => {
    if (!kind || !id || !key) return;
    let cancelled = false;
    fetchContentInterests([{ kind, id }])
      .then((found) => !cancelled && setLoaded({ key, value: found[key] ?? null }))
      .catch((err) => {
        // Cevap okunamadı: satırlar yine çalışır (işaretsiz görünür); ikinci kez sormaz.
        console.error("fetchContentInterests", err);
        if (!cancelled) setLoaded({ key, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, id, key]);

  const status: InterestValue | null = override && override.key === key ? override.value : loaded && loaded.key === key ? loaded.value : null;

  const answer = useCallback(
    (value: InterestValue | null) => {
      if (!kind || !id || !key) return;
      const previous = status;
      setOverride({ key, value });
      setContentInterest({ kind, id }, value).catch((err: unknown) => {
        console.error("setContentInterest", err);
        setOverride({ key, value: previous });
        // Bilinen bir sunucu kodu (hız sınırı) istek katmanında zaten duyuruldu.
        const message = err instanceof Error ? err.message : "";
        if (message !== friendlyServerMessage("rate_limit")) announceNotice(t("interest.failed"));
      });
    },
    [kind, id, key, status, t],
  );

  return { status, answer, ready: key !== null && loaded?.key === key };
}
