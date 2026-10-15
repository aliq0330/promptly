"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Tek-uçuş (single-flight) işlem kancası: bir işlem sürerken aynı işlem ikinci kez BAŞLATILAMAZ (çift tıklama /
 * tekrar gönderim), hata yakalanıp kullanıcıya çevrilmiş mesaj olarak verilir, ham SQL metni asla gösterilmez.
 * `run` başarıda sonucu, hatada `undefined` döner.
 */
export function useAsyncAction() {
  const { t } = useTranslation();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        return await task();
      } catch (err) {
        console.error("group action", err);
        // GroupActionError mesajı zaten çevrilmiştir; diğer her hata genel mesaja iner.
        setError(err instanceof Error && err.name === "GroupActionError" ? err.message : t("common.actionFailedRetry"));
        return undefined;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [t],
  );

  return { busy, error, setError, run };
}
