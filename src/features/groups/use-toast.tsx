"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Portal } from "@/components/ui/portal";

/** Kısa süreli bildirim (sohbet ekranındakiyle aynı görünüm). `node`'u ağaca bir kez koy, `show(mesaj)` ile göster. */
export function useToast(): { node: ReactNode; show: (message: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((next: string) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3200);
  }, []);

  const node = message ? (
    <Portal>
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-6">
        <div className="animate-pop-in rounded-md bg-text px-3.5 py-2 text-small text-background shadow-pop">{message}</div>
      </div>
    </Portal>
  ) : null;

  return { node, show };
}
