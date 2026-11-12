"use client";

import { useEffect, useRef, useState } from "react";
import { TEXT_ENTRY_SELECTOR } from "@/lib/keyboard-open";
import { useKeyboardViewport } from "@/lib/use-keyboard-viewport";
import { Portal } from "./portal";

/**
 * Module-level (not React state) reference-counted body scroll lock — a
 * plain counter survives multiple Modal instances mounting/unmounting in
 * any order without each one needing to know about the others, and never
 * fights over whose `useEffect` runs last. Unlocks only when the count
 * genuinely reaches zero, so closing one modal never re-enables scroll
 * while another is still open.
 */
let lockCount = 0;
let previousBodyOverflow = "";

/** Exported for `ImageLightbox` — the same shared, ref-counted lock, not a second one. */
export function lockBodyScroll() {
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

/**
 * Open modals, oldest first. Escape closes only the TOPMOST one, so a modal
 * opened from inside another (field editor over the preset panel, say) closes
 * alone instead of taking its parent down with it.
 */
const openModals: symbol[] = [];

export function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}

/**
 * Alttan açılan kart (mobil bottom sheet) için aşağı sürükleyerek kapatma. Yalnız dokunmatik: `sheet` varyantında her genişlikte, `dialog`
 * varyantında yalnız `< sm` (ortalanmış pencerede sürükleme yoktur). Sürükleme yalnızca içerik en üstteyken (kaydırılabilir bir ata
 * `scrollTop > 0` ise kaydırma kazanır) ve aşağı yönde başlar; kart parmağı izler, arka plan solar. Eşik (yükseklik/hız) aşılırsa kart
 * aşağı kayarak kapanır ve `onClose` çağrılır, aksi hâlde yaylanarak yerine döner. Textarea/select/aralık kaydırıcısı ve `data-no-sheet-drag`
 * üzerinden başlayan hareket sürükleme sayılmaz (metin seçimi/değer ayarı bozulmasın).
 *
 * Üç basamak: kart %75 yükseklikte açılır; içeriği buna sığmayıp kırpılıyorsa yukarı sürükleyince %90'a genişler (`--sheet-snap`), %90'dayken
 * aşağı sürükleyince %75'e iner, %75'teyken aşağı sürükleyince kapanır. %75'te yukarı hareket önce kartı genişletir, içerik kaydırması
 * genişleyince başlar.
 */
const SHEET_BASE = 0.75;
const SHEET_TALL = 0.9;

function useSheetDismiss(mode: "dialog" | "sheet" | "side", onCloseRef: React.MutableRefObject<() => void>) {
  // Portal içeriği ilk işlemeden SONRA bağlandığı için ref değil state: öğeler gelince etki yeniden çalışır.
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [sheet, setSheet] = useState<HTMLDivElement | null>(null);
  // 0 = ilk yükseklik (%75), 1 = genişletilmiş (%90). Etki yeniden kurulsa da korunur.
  const levelRef = useRef<0 | 1>(0);

  useEffect(() => {
    if (mode === "side" || !overlay || !sheet) return;

    let tracking = false;
    let dragging = false;
    let closing = false;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let height = 1;
    // Üç hareket: `dismiss` (ilk yükseklikte aşağı → kapanır), `expand` (ilk yükseklikte yukarı → %90), `shrink` (%90'dayken aşağı → ilk yükseklik).
    let gesture: "dismiss" | "expand" | "shrink" | null = null;
    let expandable = false;
    let startHeight = 0;
    let animating = false;
    let raf = 0;

    const snapPx = (fraction: number) => {
      const reserved = parseFloat(getComputedStyle(overlay).getPropertyValue("--sheet-max-h"));
      const cap = Number.isFinite(reserved) ? reserved : Infinity;
      return Math.round(Math.min(fraction * window.innerHeight, cap));
    };
    const setSnap = (px: number) => sheet.style.setProperty("--sheet-snap", `${px}px`);
    const commitLevel = (level: 0 | 1) => {
      levelRef.current = level;
      if (level === 1) sheet.style.setProperty("--sheet-snap", `${SHEET_TALL * 100}dvh`);
      else sheet.style.removeProperty("--sheet-snap");
    };
    const animateSnap = (from: number, to: number, level: 0 | 1) => {
      if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        commitLevel(level);
        return;
      }
      animating = true;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 220);
        setSnap(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(step);
        else {
          animating = false;
          commitLevel(level);
        }
      };
      raf = requestAnimationFrame(step);
    };

    const enabled = () => mode === "sheet" || window.matchMedia("(max-width: 639px)").matches;
    const blocked = (target: EventTarget | null) => {
      let el = target as HTMLElement | null;
      if (el?.closest?.("textarea, select, input[type=range], [data-no-sheet-drag]")) return true;
      while (el) {
        if (el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) {
          const overflowY = getComputedStyle(el).overflowY;
          if (overflowY === "auto" || overflowY === "scroll") return true;
        }
        if (el === overlay) break;
        el = el.parentElement;
      }
      return false;
    };
    const dim = (progress: number) => {
      overlay.style.backgroundColor = `rgb(10 8 20 / ${(0.45 * (1 - Math.min(1, progress))).toFixed(3)})`;
    };
    const settle = () => {
      sheet.style.transition = "transform 220ms var(--ease-soft)";
      sheet.style.transform = "translateY(0)";
      overlay.style.transition = "background-color 220ms";
      overlay.style.backgroundColor = "";
      window.setTimeout(() => {
        sheet.style.transition = "";
        sheet.style.transform = "";
        overlay.style.transition = "";
      }, 240);
    };

    let skipDrag = false;
    const onStart = (event: TouchEvent) => {
      if (closing || animating || event.touches.length !== 1 || !enabled()) {
        tracking = false;
        return;
      }
      tracking = true;
      dragging = false;
      gesture = null;
      skipDrag = blocked(event.target);
      startY = lastY = event.touches[0].clientY;
      lastT = event.timeStamp;
      velocity = 0;
      height = sheet.getBoundingClientRect().height || 1;
      startHeight = height;
      // Yalnız içeriği ilk yüksekliğe sığmayıp kırpılan kart genişleyebilir (kısa bir onay penceresi boşuna uzamaz).
      expandable = levelRef.current === 0 && height >= snapPx(SHEET_BASE) - 3;
    };
    const onMove = (event: TouchEvent) => {
      if (!tracking || skipDrag) return;
      const y = event.touches[0].clientY;
      if (!dragging) {
        const delta = y - startY;
        const level = levelRef.current;
        if (delta < -4 && !expandable) {
          tracking = false;
          return;
        }
        if (Math.abs(delta) <= 8) return;
        gesture = delta > 0 ? (level === 1 ? "shrink" : "dismiss") : "expand";
        dragging = true;
        startY = y;
        sheet.style.animation = "none";
        sheet.style.transition = "none";
        overlay.style.transition = "none";
      }
      event.preventDefault();
      const dt = event.timeStamp - lastT;
      if (dt > 0) velocity = (y - lastY) / dt;
      lastY = y;
      lastT = event.timeStamp;
      if (gesture === "expand") {
        setSnap(Math.min(snapPx(SHEET_TALL), Math.max(snapPx(SHEET_BASE), startHeight + (startY - y))));
        return;
      }
      if (gesture === "shrink") {
        setSnap(Math.min(snapPx(SHEET_TALL), Math.max(snapPx(SHEET_BASE), startHeight - (y - startY))));
        return;
      }
      const dy = Math.max(0, y - startY);
      sheet.style.transform = `translateY(${dy}px)`;
      dim(dy / height);
    };
    const onEnd = () => {
      if (!tracking || !dragging) {
        tracking = false;
        return;
      }
      tracking = false;
      dragging = false;
      if (gesture === "expand") {
        const open = startY - lastY > 40 || velocity < -0.4;
        animateSnap(Math.round(sheet.getBoundingClientRect().height), open ? snapPx(SHEET_TALL) : snapPx(SHEET_BASE), open ? 1 : 0);
        return;
      }
      if (gesture === "shrink") {
        const range = Math.max(0, startHeight - snapPx(SHEET_BASE));
        const down = lastY - startY > Math.min(60, range * 0.4) || velocity > 0.5;
        animateSnap(Math.round(sheet.getBoundingClientRect().height), down ? snapPx(SHEET_BASE) : snapPx(SHEET_TALL), down ? 0 : 1);
        return;
      }
      const dy = Math.max(0, lastY - startY);
      if (dy > Math.min(140, height * 0.3) || velocity > 0.6) {
        closing = true;
        sheet.style.transition = "transform 220ms cubic-bezier(0.4, 0, 1, 1)";
        sheet.style.transform = `translateY(${height + 40}px)`;
        overlay.style.transition = "background-color 220ms";
        overlay.style.backgroundColor = "transparent";
        window.setTimeout(() => onCloseRef.current(), 210);
        // Üst bileşen kapatmayı reddederse (ör. "değişiklikler silinsin mi?") kart yerine döner.
        window.setTimeout(() => {
          if (!sheet.isConnected) return;
          closing = false;
          settle();
        }, 450);
      } else {
        settle();
      }
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      cancelAnimationFrame(raf);
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [mode, overlay, sheet, onCloseRef]);

  return { overlayRef: setOverlay, sheetRef: setSheet };
}

/** Sürükleme tutamacı (görsel ipucu; dokunma hedefi değil — hareket kartın her yerinden başlar). */
function SheetGrabber({ always }: { always: boolean }) {
  // İç içe: sarmalayıcı doğrudan çocuk olduğu için `*:` kurallarını (gölge/dolgu) alır; çubuğun kendisi almaz.
  return (
    <div aria-hidden style={{ boxShadow: "none" }} className={"pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center" + (always ? "" : " sm:hidden")}>
      <span className="mt-1.5 block h-1 w-9 rounded-full bg-border-strong/70" />
    </div>
  );
}

/**
 * Shared modal shell: portals to `document.body` (see portal.tsx — this is
 * what actually fixes a modal opened from inside a prompt card rendering
 * behind/under other cards' content, since it's no longer trapped in that
 * card's `relative z-10` footer stacking context), dims + blocks the
 * background, locks page scroll while open, and closes on Escape or a
 * backdrop click. `children` is the modal panel itself (its own
 * `bg-surface`/width/`onClick` stopPropagation) — this component only owns
 * the parts that were actually broken (stacking, scroll, escape), not the
 * panel's own layout, so each modal keeps its own content shape.
 */
export function Modal({
  onClose,
  labelledBy,
  children,
  variant = "dialog",
  overLayers = false,
  centered = false,
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  /** Tam ekran katmanların (hikâye görüntüleyici z-60) ÜSTÜNDE açılır — o katmandan açılan pencereler için. */
  overLayers?: boolean;
  /**
   * `dialog` (varsayılan): mobilde alt sayfa, `sm`+ ortalanmış pencere.
   * `sheet`: HER genişlikte alta yapışık alt sayfa (Bottom Sheet) — çocuk
   *   kendi `max-h`/kaydırmasını verir.
   * `side`: sağa yapışık, tam yükseklikte panel (masaüstü/yatay tablet).
   */
  variant?: "dialog" | "sheet" | "side";
  /**
   * Küçük seçim/onay pencereleri: telefonda da ekranın ORTASINDA açılır (alt sayfa değil), sürükleyerek kapanmaz. Yalnız `dialog`
   * varyantında anlamlıdır.
   */
  centered?: boolean;
}) {
  // Registered once per mount (not per `onClose` identity) so a parent
  // re-rendering never re-orders the stack and steals Escape from its child.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const { overlayRef, sheetRef } = useSheetDismiss(centered && variant === "dialog" ? "side" : variant, onCloseRef);
  // Ekran klavyesi açıkken (iOS Safari) katman görünür alana oturur: alt sayfa klavyenin ÜSTÜNDE kalır, başlığı ekranın dışına kaçmaz.
  const keyboard = useKeyboardViewport();
  // `--sheet-max-h`: klavye açıkken kartın en çok yüksekliği görünür alanı (klavyenin üstünü) aşmaz; kapalıyken %75 sınırı geçerlidir.
  const overlayStyle =
    keyboard && variant !== "side"
      ? ({ top: keyboard.top, height: keyboard.height, bottom: "auto", "--sheet-max-h": `${keyboard.height}px`, "--sheet-snap": `${keyboard.height}px` } as React.CSSProperties)
      : undefined;
  // Klavye açılınca odaktaki yazma alanı kartın kaydırılan gövdesinde görünür kalır (klavye alanı örtmesin).
  // Yazarken arka yer görünmesin (docs/history/378-*, mockup K4): telefonda klavye açıkken pencere görünür alanın TAMAMINI kaplar (opak zemin, kartın
  // yüksekliği/köşesi/kenarlığı kalkar); başlık üstte, düğmeler klavyenin hemen üstünde, gövde kayar.
  const cover = keyboard && variant !== "side" ? "max-sm:h-full max-sm:*:!h-full max-sm:*:!max-w-none max-sm:*:!rounded-none max-sm:*:!border-0 max-sm:*:!shadow-none" : "";
  const coverOverlay = keyboard && variant !== "side" ? "max-sm:!bg-surface " : "";
  const keyboardHeight = keyboard?.height ?? 0;
  useEffect(() => {
    if (!keyboardHeight) return;
    const timer = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && active.matches(TEXT_ENTRY_SELECTOR) && active.closest("[role=dialog]")) active.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [keyboardHeight]);
  useEffect(() => {
    lockBodyScroll();
    const id = Symbol("modal");
    openModals.push(id);
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && openModals[openModals.length - 1] === id) onCloseRef.current();
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      const index = openModals.indexOf(id);
      if (index >= 0) openModals.splice(index, 1);
      unlockBodyScroll();
    };
  }, []);

  // Layout: a vertical flex column where the panel row uses auto margins
  // (never `items-center`/`items-end`, which clip the top of a panel taller
  // than the viewport so it can't be scrolled into view).
  //   - mobile (<sm): the panel docks to the bottom edge as a sheet —
  //     full width, square bottom corners, slides up.
  //   - sm and up:   a centered dialog that fades + scales in.
  // Every panel in the app is `w-full max-w-* rounded-lg border ... shadow-lg`,
  // so the sheet treatment is applied with direct-child (`*:`) variants here
  // instead of editing each modal.
  if (variant !== "dialog") {
    const isSide = variant === "side";
    return (
      <Portal>
        <div
          ref={overlayRef}
          className={
            "fixed inset-0 flex animate-fade-in bg-[rgb(10_8_20/0.45)] " +
            coverOverlay +
            (keyboard ? "" : "backdrop-blur-[2px] ") +
            (overLayers ? "z-[70] " : "z-50 ") +
            (isSide ? "justify-end" : "flex-col justify-end")
          }
          style={overlayStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          onClick={onClose}
        >
          <div
            ref={sheetRef}
            className={isSide ? "flex h-full animate-panel-in" : "relative flex w-full justify-center animate-sheet-up *:!max-h-[min(var(--sheet-snap,75dvh),var(--sheet-max-h,100dvh))] " + cover}
            onClick={(event) => event.stopPropagation()}
          >
            {!isSide && <SheetGrabber always />}
            {children}
          </div>
        </div>
      </Portal>
    );
  }

  if (centered) {
    return (
      <Portal>
        <div
          ref={overlayRef}
          className={"fixed inset-0 flex flex-col overflow-y-auto bg-[rgb(10_8_20/0.45)] p-4 animate-fade-in " + coverOverlay + (keyboard ? "max-sm:!p-0 " : "") + (keyboard ? "" : "backdrop-blur-[2px] ") + (overLayers ? "z-[70]" : "z-50")}
          style={overlayStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          onClick={onClose}
        >
          <div ref={sheetRef} className={"relative my-auto flex w-full justify-center animate-pop-in *:shadow-pop " + (keyboard ? "max-sm:my-0 max-sm:h-full " : "") + cover} onClick={(event) => event.stopPropagation()}>
            {children}
          </div>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div
        ref={overlayRef}
        className={"fixed inset-0 flex flex-col overflow-y-auto bg-[rgb(10_8_20/0.45)] animate-fade-in sm:p-4 " + coverOverlay + (keyboard ? "" : "backdrop-blur-[2px] ") + (overLayers ? "z-[70]" : "z-50")}
        style={overlayStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={onClose}
      >
        <div
          ref={sheetRef}
          className={
            "relative mt-auto flex w-full justify-center animate-sheet-up sm:mb-auto sm:animate-pop-in " + cover + " " +
            "*:shadow-pop max-sm:*:max-w-none max-sm:*:rounded-b-none max-sm:*:border-x-0 max-sm:*:border-b-0 " +
            // Alttan açılan kart en çok ekranın %75'i: üstteki çeyrek hep görünür (docs/history/242-*). Başlık/düğme satırı sabit, ortası kayar:
            // kartın kendisi `flex flex-col` + kaydırılan gövde (`SheetFrame`) olmalı.
            "max-sm:*:!max-h-[min(var(--sheet-snap,75dvh),var(--sheet-max-h,100dvh))] " +
            // Klavye açıkken alt güvenli alan yoktur: kartın altı klavyeye yapışır (altta bulanık/boş şerit kalmaz).
            (keyboard ? "max-sm:*:pb-2" : "max-sm:*:pb-[max(1.25rem,env(safe-area-inset-bottom))]")
          }
        >
          <SheetGrabber always={false} />
          {children}
        </div>
      </div>
    </Portal>
  );
}
