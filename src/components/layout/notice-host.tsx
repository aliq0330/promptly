"use client";

import { useEffect } from "react";
import { NOTICE_EVENT } from "@/lib/app-notice";
import { useToast } from "@/features/groups/use-toast";

/** Uygulama genelindeki kısa bildirimler (hız sınırı, engel…): `announceNotice(mesaj)` çağrıları burada tek bir toast olarak görünür. */
export function NoticeHost() {
  const { node, show } = useToast();
  useEffect(() => {
    const onNotice = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (typeof message === "string" && message) show(message);
    };
    window.addEventListener(NOTICE_EVENT, onNotice);
    return () => window.removeEventListener(NOTICE_EVENT, onNotice);
  }, [show]);
  return <>{node}</>;
}
