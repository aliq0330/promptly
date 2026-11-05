"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { prefersReducedMotion } from "@/lib/motion";
import { consumePublished } from "@/lib/publish-celebration";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Paylaşım sonrası açılan sayfanın ortasında bir kez: halka çizilir, tik gelir, bir yankı halkası yayılır, sonra söner (docs/history/335-*). Tıklamayı engellemez. */
export function PublishCelebration() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!consumePublished() || prefersReducedMotion()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sayfa değişince bir kez gösterilen, zamanlayıcıyla kapanan kutlama
    setShown(true);
    const timer = setTimeout(() => setShown(false), 1500);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!shown) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center">
      <div className="mi-celebrate flex flex-col items-center gap-2 rounded-2xl bg-surface px-7 py-6 shadow-pop">
        <svg width="68" height="68" viewBox="0 0 68 68" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="overflow-visible text-success">
          <circle className="mi-pulse" cx="34" cy="34" r="28" stroke="currentColor" strokeWidth="2" />
          <circle className="mi-ring" cx="34" cy="34" r="28" stroke="currentColor" strokeWidth="3" pathLength={1} />
          <path className="mi-tick" d="M22 35l8.5 8.5L47 26" stroke="currentColor" strokeWidth="3.4" pathLength={1} />
        </svg>
        <span className="text-label font-semibold text-text">{t("motion.published")}</span>
      </div>
    </div>
  );
}
