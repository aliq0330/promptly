"use client";

import { useEffect, useState } from "react";

/** Ekran klavyesi bu kadar pikselden fazla yer kaplıyorsa "açık" sayılır (adres çubuğu/araç çubuğu oynamaları klavye değildir). */
const KEYBOARD_MIN = 120;

export interface KeyboardViewport {
  /** Görünür alanın üst kenarı (iOS klavye açılınca sayfayı kaydırır) ve yüksekliği — `window.visualViewport`. */
  top: number;
  height: number;
}

/**
 * Ekran klavyesi açıkken görünür alan (`visualViewport`), yoksa `null`. iOS Safari'de klavye açılınca düzen görünümü küçülmez: `fixed`
 * bir alt sayfa klavyenin altında ya da ekranın üstünde kalır, başlığı görünmez olur. Alt sayfa/pencere kabuğu bu alana oturtulursa
 * (üst + yükseklik) her alan klavyenin üstünde görünür kalır.
 */
export function useKeyboardViewport(): KeyboardViewport | null {
  const [viewport, setViewport] = useState<KeyboardViewport | null>(null);
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => {
      const covered = window.innerHeight - visual.height - visual.offsetTop;
      const shrunk = window.innerHeight - visual.height;
      setViewport(shrunk > KEYBOARD_MIN || covered > KEYBOARD_MIN ? { top: Math.round(visual.offsetTop), height: Math.round(visual.height) } : null);
    };
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, []);
  return viewport;
}
