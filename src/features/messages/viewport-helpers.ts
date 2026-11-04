import { useEffect, useRef } from "react";
import { keyboardFrame } from "@/lib/keyboard-frame";

/**
 * Telefonda tam ekran sohbet paneli (`fixed`) ekran klavyesi açıkken GÖRÜNÜR ALANA oturur (docs/history/332-*): üst kenarı
 * `visualViewport.offsetTop`, yüksekliği `visualViewport.height` — başlık ekranın üstünde kaybolmaz, yazma alanı klavyenin hemen
 * üstündedir. Eski yol (`bottom = innerHeight - height - offsetTop`) iOS 26 Safari'de yazma alanıyla klavye arasında boşluk
 * bırakıyordu. Hesap saf `keyboardFrame`'de (birim testli; bu ortamda gerçek iOS klavyesi açılamaz). Panel `fixed` değilse (tablet+,
 * dock) dokunulmaz. Klavye kapanınca satır içi stil temizlenir, panel CSS'ine döner. `onChange` her güncellemede çağrılır (ör. liste
 * sondaysa sonda tut). `panel` bir state'ten gelir (callback ref): sohbet önce yükleniyor ekranı çizer, panel SONRA kurulur — bir
 * `useRef` ile ilk etkide panel henüz yoktu ve kanca hiç bağlanmıyordu.
 */
export function useFitPanelToKeyboard(panel: HTMLElement | null, enabled: boolean, onChange?: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !panel || !vv) return;

    const style = panel.style;
    const isFixed = () => getComputedStyle(panel).position === "fixed";
    let fitted = false;
    const clear = () => {
      for (const prop of ["top", "height", "bottom"]) style.removeProperty(prop);
      fitted = false;
    };

    function update() {
      if (!vv) return;
      const frame = fitted || isFixed()
        ? keyboardFrame({ innerHeight: window.innerHeight, viewportHeight: vv.height, viewportOffsetTop: vv.offsetTop })
        : null;
      if (frame) {
        style.setProperty("top", `${frame.top}px`);
        style.setProperty("height", `${frame.height}px`);
        style.setProperty("bottom", "auto");
        fitted = true;
      } else if (fitted) {
        clear();
      }
      onChangeRef.current?.();
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      clear();
    };
  }, [panel, enabled]);
}
