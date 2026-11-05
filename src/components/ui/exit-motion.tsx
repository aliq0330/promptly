"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/motion";

/** Çıkış animasyonunun toplam süresi (ms): 200 ms kayıp solma + 260 ms yükseklik kapanması, ikisi ardışık (`.mi-exit` kuralları). */
export const EXIT_MS = 460;

/**
 * Silinen öğenin çıkışı (docs/history/335-*): `leaving` olunca öğe sağa kayıp solar, sonra yüksekliği kapanır ve alttakiler yerine yükselir.
 * Gerçek kaldırma (`useExitMotion().exit` içindeki `commit`) animasyon bitince yapılır, bu bileşen yalnız görünümü sürer.
 * `collapse={false}`: yükseklik kapanmaz, öğe küçülüp solar — masonry kartlarında kullanılır (sütunlar `useFlipReorder` ile yeniden dizilir).
 * Dinlenmede içerik kırpılmaz (açılır menüler dışarı taşabilir); kırpma yalnız çıkış sırasında devreye girer.
 */
export function ExitMotion({
  leaving,
  collapse = true,
  className,
  children,
}: {
  leaving: boolean;
  collapse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mi-exit", className)} data-leaving={leaving} data-collapse={collapse}>
      <div className="mi-exit-in">{children}</div>
    </div>
  );
}

/**
 * Kaldırma işini animasyonun ARDINA erteler: `exit(id, commit)` önce `id`yi "çıkıyor" işaretler, `EXIT_MS` sonra `commit`'i çalıştırır.
 * Hareketi azalt açıksa (ya da `commit` hemen gerekiyorsa) animasyonsuz, anında çalıştırır. Bileşen sökülürse bekleyen işler yine de yapılır
 * (silme kullanıcının kararıdır; animasyon yüzünden kaybolmaz).
 */
export function useExitMotion() {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(new Map<string, () => void>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timerSet = timers.current;
    const pendingMap = pending.current;
    return () => {
      timerSet.forEach(clearTimeout);
      timerSet.clear();
      for (const commit of pendingMap.values()) commit();
      pendingMap.clear();
    };
  }, []);

  const exit = useCallback((id: string, commit: () => void) => {
    if (typeof window === "undefined" || prefersReducedMotion() || pending.current.has(id)) {
      commit();
      return;
    }
    const run = () => {
      pending.current.delete(id);
      setLeaving((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      commit();
    };
    pending.current.set(id, run);
    setLeaving((prev) => new Set(prev).add(id));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (pending.current.get(id) === run) run();
    }, EXIT_MS);
    timers.current.add(timer);
  }, []);

  /** Çıkış yarıda kesilirse (sunucu reddetti, geri al): öğeyi geri getirir, bekleyen `commit` çalışmaz. */
  const cancel = useCallback((id: string) => {
    pending.current.delete(id);
    setLeaving((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isLeaving = useCallback((id: string) => leaving.has(id), [leaving]);
  return { exit, cancel, isLeaving };
}
