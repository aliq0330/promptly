"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ToastBar } from "@/components/ui/toast";

/** Kısa süreli bildirim (sohbet ekranındakiyle aynı görünüm). `node`'u ağaca bir kez koy, `show(mesaj)` ile göster. */
export function useToast(): { node: ReactNode; show: (message: string, durationMs?: number) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((next: string, durationMs = 3200) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), durationMs);
  }, []);

  const node = message ? <ToastBar layer="toast">{message}</ToastBar> : null;

  return { node, show };
}
