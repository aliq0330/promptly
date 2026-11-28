"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Adres parametresiyle (`?dlg=` · ikinci düzey `?sdlg=`) açılan sayfa/pencere durumu (docs/history/482-*): proje ve dosya ayarları telefonda tam ekran sayfadır,
 * tarayıcının geri tuşu onu kapatmalı. Açmak geçmişe bir adım ekler (`push`), kapatmak aynı adımı değiştirir (`replace`); durum adresten
 * okunur, yani geri tuşu da pencereyi kapatır. Diğer parametreler (`id`, `tab`, `project`, `file`, `sub`…) olduğu gibi korunur.
 */
export function useUrlDialog<T extends string>(param = "dlg", clears: readonly string[] = []): [T | null, (next: T | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = (params.get(param) as T | null) ?? null;
  const set = useCallback(
    (next: T | null) => {
      const query = new URLSearchParams(params.toString());
      if (next) query.set(param, next);
      else {
        query.delete(param);
        for (const other of clears) query.delete(other);
      }
      const href = `${pathname}?${query.toString()}`;
      if (next) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [params, pathname, router, param, clears],
  );
  return [value, set];
}
