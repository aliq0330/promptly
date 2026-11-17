"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Taşınmış bir sayfanın eski adresi: yeni yerine yönlendirir (statik dışa aktarmada sunucu yönlendirmesi yok). */
export function RedirectTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return null;
}
