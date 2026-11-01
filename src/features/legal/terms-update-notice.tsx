"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, buttonClassName } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { TERMS_EFFECTIVE_AT, TERMS_VERSION } from "@/features/legal/legal-content";
import { useTranslation } from "@/lib/i18n/language-provider";
import { shouldShowTermsNotice } from "@/lib/legal-notice";

/** Bu tarayıcıda en son görülen koşullar sürümü. Cihaza özgüdür: başka bir cihazda bant bir kez daha çıkar (zararsız). */
export const TERMS_NOTICE_STORAGE_KEY = "promptly-terms-notice";
const SHOW_DELAY_MS = 2500;

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(TERMS_NOTICE_STORAGE_KEY);
  } catch {
    return TERMS_VERSION; // depolama kapalı: kimseyi rahatsız etme
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(TERMS_NOTICE_STORAGE_KEY, TERMS_VERSION);
  } catch {
    /* depolama kapalı — bant bir sonraki ziyarette yeniden çıkabilir */
  }
}

/**
 * "Kullanım Koşulları güncellendi" bandı (docs/history/300-*): koşullar yürürlüğe girmeden önce hesap açmış, oturumlu kullanıcıya
 * sayfanın altında küçük, kapatılabilir bir kart. Gösterme kararı `lib/legal-notice.ts`. "Koşulları oku" ve "Tamam" bu sürümü görülmüş
 * sayar; koşullar sayfasını (`/terms`) açmak da okumak sayılır. Ziyaretçiye (hesabı yok) çıkmaz. `data-app-chrome` taşır: hikâye
 * görüntüleyici ve yazma ekranı açıkken diğer uygulama çubukları gibi gizlenir. Telefonda alt menünün hemen üstünde durur.
 */
export function TermsUpdateNotice() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { profile } = useOwnProfile();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const onTermsPage = /^\/terms\/?$/.test(pathname ?? "");

  // Koşulları açmak okumaktır.
  useEffect(() => {
    if (onTermsPage && user) markSeen();
  }, [onTermsPage, user]);

  const createdAt = profile?.createdAt;
  const ready = !loading && Boolean(user) && Boolean(profile);
  useEffect(() => {
    if (!ready || onTermsPage) return;
    if (!shouldShowTermsNotice({ version: TERMS_VERSION, seenVersion: readSeen(), accountCreatedAt: createdAt, effectiveAt: TERMS_EFFECTIVE_AT })) return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, onTermsPage, createdAt]);

  if (!visible || onTermsPage) return null;

  function dismiss() {
    markSeen();
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label={t("legal.noticeTitle")}
      data-app-chrome=""
      data-terms-notice=""
      className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 animate-fade-in rounded-xl border border-border-soft bg-surface p-4 shadow-pop md:inset-x-auto md:bottom-5 md:right-5 md:w-[22rem]"
    >
      <p className="text-small font-semibold text-text">{t("legal.noticeTitle")}</p>
      <p className="mt-1 text-small text-text-secondary">{t("legal.noticeBody")}</p>
      <div className="mt-3 flex items-center gap-2">
        <Link href="/terms" onClick={dismiss} className={buttonClassName({ size: "sm" })}>
          {t("legal.noticeRead")}
        </Link>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
          {t("legal.noticeDismiss")}
        </Button>
      </div>
    </div>
  );
}
