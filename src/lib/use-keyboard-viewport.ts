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
    // iOS reports the visible area in steps while the keyboard slides in, and a layer whose input was focused on mount misses the first
    // events — so besides every `visualViewport` event the frame is measured again shortly after mount, on focus changes and on resize.
    let timers: number[] = [];
    const settle = () => {
      update();
      timers.forEach((id) => window.clearTimeout(id));
      timers = [120, 350, 800].map((ms) => window.setTimeout(update, ms));
    };
    settle();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", settle);
    document.addEventListener("focusin", settle);
    document.addEventListener("focusout", settle);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", settle);
      document.removeEventListener("focusin", settle);
      document.removeEventListener("focusout", settle);
    };
  }, []);
  return viewport;
}
