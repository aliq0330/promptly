"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Portal } from "@/components/ui/portal";

const MARGIN = 8;

/**
 * Bir ekran noktasına (`anchor`) yakın duran, Escape / dışarı tıklama ile
 * kapanan küçük pencere. Ekran dışına taşmaz: yatayda kenara sıkıştırılır,
 * altta yer yoksa ve üstte daha çok yer varsa yukarı açılır. Anchor
 * değişince (kaydırma, yeniden boyutlandırma) konum yeniden hesaplanır.
 */
export function AnchoredPopover({
  anchor,
  onClose,
  label,
  width = 340,
  children,
}: {
  anchor: () => DOMRect | null;
  onClose: () => void;
  label: string;
  width?: number;
  children: React.ReactNode;
}) {
  // Portal çocukları ilk render'dan sonra bağlanır: eleman state (callback ref).
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    elRef.current = el;
  });
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const anchorRef = useRef(anchor);
  useEffect(() => {
    anchorRef.current = anchor;
  });

  useLayoutEffect(() => {
    if (!el) return;
    function place() {
      if (!el) return;
      const rect = anchorRef.current();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - MARGIN * 2);
      const naturalHeight = el.scrollHeight;
      const baseTop = rect ? rect.bottom + 6 : vh / 3;
      const baseLeft = rect ? rect.left : (vw - w) / 2;
      const spaceBelow = vh - baseTop - MARGIN;
      const spaceAbove = (rect ? rect.top : vh) - 6 - MARGIN;
      const openUp = spaceBelow < Math.min(naturalHeight, 280) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(openUp ? spaceAbove : spaceBelow, 460));
      const height = Math.min(naturalHeight, maxHeight);
      const top = openUp ? Math.max(MARGIN, (rect ? rect.top : vh) - 6 - height) : baseTop;
      const left = Math.max(MARGIN, Math.min(baseLeft, vw - w - MARGIN));
      setPosition({ top, left, maxHeight });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [width, el]);

  // Konumlanana kadar gizli olduğu için `autoFocus` işe yaramaz: görünür olunca odakla.
  const positioned = position !== null;
  useEffect(() => {
    if (positioned) el?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [positioned, el]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element;
      // Açan düğme kendi toggle'ını yönetir (tıklama kapatır, yeniden açmaz).
      if (target.closest?.("[data-insert-trigger]")) return;
      if (elRef.current && !elRef.current.contains(target)) onCloseRef.current();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <Portal>
      <div
        ref={setEl}
        role="dialog"
        aria-label={label}
        data-insert-popover
        style={{
          position: "fixed",
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          width: Math.min(width, typeof window === "undefined" ? width : window.innerWidth - MARGIN * 2),
          maxHeight: position?.maxHeight ?? 460,
          visibility: position ? "visible" : "hidden",
        }}
        className="z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-pop animate-pop-in"
      >
        {children}
      </div>
    </Portal>
  );
}
