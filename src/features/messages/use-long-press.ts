import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** Basılı tutma süresi (ms) ve bu süre içinde parmağın oynayabileceği en çok mesafe (px) — daha fazlası kaydırma sayılır. */
export const LONG_PRESS_MS = 400;
export const LONG_PRESS_MOVE_TOLERANCE = 10;
/** Baloncuk yalnız bu kadar sonra "basılıyor" görünümüne geçer: kısa dokunuşta ve kaydırmada titremesin. */
const PRESSING_AFTER_MS = 120;
/** Parmak kalktıktan sonra gelen `click` yutulur (mesajdaki bağlantı/fotoğraf açılmasın, satırın dokunma anahtarı tersine dönmesin); bu pencere kalkıştan sonra kapanır. */
const CLICK_SUPPRESS_AFTER_RELEASE_MS = 350;
/** Kalkış olayı hiç gelmezse (kayıp olay) yutma kendiliğinden biter. */
const CLICK_SUPPRESS_FALLBACK_MS = 2500;
/** Android Chrome uzun basmada kendi `contextmenu`'sünü bu kadar sonra gönderir; zaten açıldıysa ikinci açılış yok. */
const NATIVE_CONTEXT_MENU_WINDOW_MS = 1000;

/**
 * Mesaj baloncuğunda uzun basma (docs/history/288-*). iOS Safari uzun basmada güvenilir bir `contextmenu` olayı vermez, bu yüzden
 * dokunmatik/kalem için `pointerdown` + zamanlayıcı kullanılır; fare yalnızca sağ tıkla (`contextmenu`) açar (basılı tutup metin
 * seçmeyi bozmasın). Parmak oynarsa ya da liste kaymaya başlarsa (`pointercancel`) iptal olur. Android Chrome uzun basmada ayrıca
 * `contextmenu` gönderir: zaten açıldıysa yalnız varsayılanı engellenir (çifte açılış yok).
 *
 * Dönen `handlers` baloncuğun kendisine yayılır. Safari'nin kendi metin seçimi/bağlantı önizlemesi CSS ile kapatılır
 * (`-webkit-touch-callout: none`, `user-select: none` — bileşende).
 */
export function useLongPress({ onLongPress, enabled = true }: { onLongPress: () => void; enabled?: boolean }) {
  const [pressing, setPressing] = useState(false);
  const timers = useRef<{ hold: number; visual: number }>({ hold: 0, visual: 0 });
  const start = useRef<{ x: number; y: number } | null>(null);
  const firedAt = useRef(0);
  const suppressClick = useRef(false);
  const suppressTimer = useRef(0);
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  });

  const cancel = useCallback(() => {
    window.clearTimeout(timers.current.hold);
    window.clearTimeout(timers.current.visual);
    timers.current = { hold: 0, visual: 0 };
    start.current = null;
    setPressing(false);
  }, []);

  // Uzun basma açıldıysa, parmak kalkınca (ya da olay iptal olunca) kısa süre sonra `click` yutmayı bırak.
  const release = useCallback(() => {
    cancel();
    if (!suppressClick.current) return;
    window.clearTimeout(suppressTimer.current);
    suppressTimer.current = window.setTimeout(() => {
      suppressClick.current = false;
    }, CLICK_SUPPRESS_AFTER_RELEASE_MS);
  }, [cancel]);

  // Bileşen kalkarken bekleyen zamanlayıcı açık kalmasın.
  useEffect(
    () => () => {
      cancel();
      window.clearTimeout(suppressTimer.current);
    },
    [cancel],
  );

  const fire = useCallback(() => {
    cancel();
    firedAt.current = Date.now();
    // Android'de kısa bir dokunsal geri bildirim; iOS Safari `vibrate`'i desteklemez, özellik denetimiyle atlanır.
    try {
      navigator.vibrate?.(8);
    } catch {
      /* desteklenmiyorsa geri bildirim yok */
    }
    callback.current();
  }, [cancel]);

  const fireFromTouch = useCallback(() => {
    suppressClick.current = true;
    window.clearTimeout(suppressTimer.current);
    suppressTimer.current = window.setTimeout(() => {
      suppressClick.current = false;
    }, CLICK_SUPPRESS_FALLBACK_MS);
    fire();
  }, [fire]);

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!enabled || event.pointerType === "mouse" || !event.isPrimary) return;
      if ((event.target as Element).closest("[data-no-long-press]")) return;
      cancel();
      start.current = { x: event.clientX, y: event.clientY };
      timers.current.visual = window.setTimeout(() => setPressing(true), PRESSING_AFTER_MS);
      timers.current.hold = window.setTimeout(fireFromTouch, LONG_PRESS_MS);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const origin = start.current;
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > LONG_PRESS_MOVE_TOLERANCE) cancel();
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: cancel,
    onContextMenu(event: MouseEvent<HTMLElement>) {
      if (!enabled) return;
      if ((event.target as Element).closest("[data-no-long-press]")) return;
      event.preventDefault();
      if (Date.now() - firedAt.current < NATIVE_CONTEXT_MENU_WINDOW_MS) return;
      fire();
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (suppressClick.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };

  return { handlers, pressing };
}
