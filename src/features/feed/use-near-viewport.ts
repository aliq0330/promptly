"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Öğe görünür alana `rootMargin` kadar yaklaştığı ilk andan itibaren `true` (ve öyle kalır) — docs/history/466-* (Keşfet'in tembel bölümleri).
 * `useInViewOnce`'tan farkı: callback ref'tir, öğe SONRADAN bağlansa da (arama kapanınca geri gelen içerik, veriyle çizilen kap) gözlenir.
 * IntersectionObserver yoksa hemen `true`.
 */
export function useNearViewportOnce<T extends Element>(rootMargin = "600px"): [(element: T | null) => void, boolean] {
  const [element, setElement] = useState<T | null>(null);
  const [near, setNear] = useState(false);
  const ref = useCallback((node: T | null) => setElement(node), []);

  useEffect(() => {
    if (near || !element) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, near, rootMargin]);

  return [ref, near];
}
