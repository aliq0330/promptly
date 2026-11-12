"use client";

import { useEffect } from "react";
import { isKeyboardOpen, TEXT_ENTRY_SELECTOR } from "@/lib/keyboard-open";

/**
 * Ekran klavyesi açıkken `html[data-keyboard-open]` koyar (docs/history/377-*). iOS Safari'de klavye açılınca düzen görünümü küçülmez: alt menü,
 * sabit "Ekle" düğmesi, Mesajlar hapı ve ayrıntı sayfasının eylem satırı klavyenin ya da adres hapının yanında/üstünde asılı kalıp yazma
 * alanını örter ya da alt sayfanın altında bulanık bir şerit olarak görünür. `globals.css` bu öznitelikle o sabit öğeleri gizler; alt
 * sayfa kabuğu (`Modal`) kendi hesabını `useKeyboardViewport`'tan yapar. Durum React'e yazılmaz: tek öznitelik, yeniden çizim yok.
 */
export function KeyboardState() {
  useEffect(() => {
    const root = document.documentElement;
    const visual = window.visualViewport;
    let frame = 0;
    const update = () => {
      frame = 0;
      const active = document.activeElement;
      const focusedIsTextEntry = Boolean(active && active !== document.body && active.matches(TEXT_ENTRY_SELECTOR));
      const open = isKeyboardOpen({
        innerHeight: window.innerHeight,
        viewportHeight: visual?.height ?? window.innerHeight,
        viewportOffsetTop: visual?.offsetTop ?? 0,
        focusedIsTextEntry,
      });
      root.toggleAttribute("data-keyboard-open", open);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      if (frame) cancelAnimationFrame(frame);
      root.removeAttribute("data-keyboard-open");
    };
  }, []);
  return null;
}
