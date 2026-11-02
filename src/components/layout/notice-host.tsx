"use client";

import { useEffect } from "react";
import { NOTICE_EVENT } from "@/lib/app-notice";
import { useToast } from "@/features/groups/use-toast";

/** Uygulama genelindeki kısa bildirimler (hız sınırı, engel…): `announceNotice(mesaj)` çağrıları burada tek bir toast olarak görünür. */
export function NoticeHost() {
  const { node, show } = useToast();
  useEffect(() => {
    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<string | { message?: unknown; durationMs?: unknown }>).detail;
      if (typeof detail === "string" && detail) show(detail);
      else if (detail && typeof detail === "object" && typeof detail.message === "string" && detail.message) show(detail.message, typeof detail.durationMs === "number" ? detail.durationMs : undefined);
    };
    window.addEventListener(NOTICE_EVENT, onNotice);
    return () => window.removeEventListener(NOTICE_EVENT, onNotice);
  }, [show]);
  return <>{node}</>;
}
