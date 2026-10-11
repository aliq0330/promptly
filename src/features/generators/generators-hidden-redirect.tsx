"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Generator'ın giriş sayfaları gizlendi (§9.145 Aşama 2): ziyaretçiyi uygun yere gönderir. */
export function GeneratorsHiddenRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}
