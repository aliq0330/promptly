"use client";

import { useEffect, useState } from "react";
import { keyboardFrame, type KeyboardFrame } from "./keyboard-frame";

/** Görünür alanın üst kenarı (iOS klavye açılınca sayfayı kaydırır) ve yüksekliği — `window.visualViewport`. */
export type KeyboardViewport = KeyboardFrame;

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
      const frame = keyboardFrame({ innerHeight: window.innerHeight, viewportHeight: visual.height, viewportOffsetTop: visual.offsetTop });
      setViewport((prev) => (prev && frame && prev.top === frame.top && prev.height === frame.height ? prev : frame));
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
