"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { X } from "@/components/icons/x";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";

/** Telefon (`< md`) ile tablet/masaüstü ayrımı: oluşturma akışları telefonda tam ekran sayfa, `md+`'da pencere (docs/history/473-*). */
export const CREATE_PAGE_QUERY = "(max-width: 767px)";

/**
 * Ekip / Topluluk / Space oluşturma kabuğu (telefon): uygulama menüleri gizli (`html[data-compose-open]`), üst çubukta ✕ + ortalı başlık,
 * kayan gövde, altta sabit tam genişlik birincil eylem. `footer` pencerelerdekiyle AYNI düğmelerdir (Vazgeç + Oluştur); telefonda yalnız
 * sonuncusu (birincil) tam genişlik görünür, Vazgeç ✕'in işidir. `md+`'da bu kabuk kullanılmaz: aynı gövde `Modal` içinde çizilir.
 */
export function CreatePageShell({
  title,
  onClose,
  busy,
  onSubmit,
  footer,
  formTestId,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  formTestId?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-compose-open", "");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      root.removeAttribute("data-compose-open");
      document.body.style.overflow = previous;
    };
  }, []);
  const body = (
    <>
      <div data-create-page-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-5">
        {children}
      </div>
      {footer && (
        <div
          data-create-page-footer
          data-keyboard-hide
          className="flex shrink-0 border-t border-border-soft bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 [&>*:not(:last-child)]:hidden [&>*:last-child]:h-12 [&>*:last-child]:w-full"
        >
          {footer}
        </div>
      )}
    </>
  );
  return (
    <div data-create-page role="dialog" aria-modal="false" aria-label={title} className="fixed inset-0 z-(--z-compose) flex flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border-soft bg-surface px-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t("common.close")}
          className="flex h-10 w-10 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-soft disabled:opacity-50"
        >
          <X size={20} aria-hidden />
        </button>
        <h1 className="min-w-0 flex-1 truncate pr-10 text-center text-h3 font-bold text-text">{title}</h1>
      </div>
      {onSubmit ? (
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col" data-testid={formTestId}>
          {body}
        </form>
      ) : (
        body
      )}
    </div>
  );
}

/**
 * Oluştur eylemi: `md+`'da pencereyi açar, telefonda kendi adresi olan tam ekran sayfaya gider (geri tuşu çalışır).
 * `href` yalnız telefonda kullanılır.
 */
export function useCreateEntry(href: string, openModal: () => void): () => void {
  const router = useRouter();
  const phone = useMediaQuery(CREATE_PAGE_QUERY);
  return useCallback(() => {
    if (phone) router.push(href);
    else openModal();
  }, [phone, router, href, openModal]);
}

/** `/…/new` adresi: telefonda sayfa gösterilir; tablet/masaüstünde liste sayfasına `?new=1` ile yönlenir (pencere açılır). */
export function useCreatePageRoute(listHref: string): boolean {
  const router = useRouter();
  const phone = useMediaQuery(CREATE_PAGE_QUERY);
  useEffect(() => {
    if (!window.matchMedia(CREATE_PAGE_QUERY).matches) router.replace(`${listHref}?new=1`);
  }, [router, listHref]);
  return phone;
}

/** Liste sayfası: `?new=1` ile gelindiyse oluşturma penceresini bir kez açar ve parametreyi adresten siler. */
export function useOpenCreateFromQuery(open: () => void, ready = true) {
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    params.delete("new");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- adresten gelen tek seferlik açılış
  }, [ready]);
}
