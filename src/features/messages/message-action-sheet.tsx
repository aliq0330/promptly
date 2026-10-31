"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { alignInBounds, computeSheetLayout } from "@/lib/message-sheet-layout";
import type { Box } from "@/lib/popover-position";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Message } from "@/types";
import { EmojiPicker } from "./emoji-picker";
import { MessageActionMenu } from "./message-action-menu";
import type { MessageBubbleActions } from "./message-bubble-types";

/** Kenarlardan bırakılan boşluk (px). */
const EDGE_MARGIN = 12;
/** Açılışta parmak kalkışından doğan `click` (uzun basma) kapatma sayılmasın. */
const IGNORE_CLICK_MS = 300;

interface Placed {
  top: number;
  shift: number;
  cloneMaxHeight: number | null;
  cloneWidth: number;
  barLeft: number;
  cloneLeft: number;
  menuLeft: number;
}

function samePlacement(a: Placed | null, b: Placed): boolean {
  return a !== null && (Object.keys(b) as (keyof Placed)[]).every((key) => a[key] === b[key]);
}

/**
 * Uzun basma / ⋮ ile açılan mesaj sayfası (docs/history/288-*): bulanık bir zemin, mesajın yerinde duran net kopyası, üstünde tepki
 * çubuğu (sohbetin altı hızlı emojisi + "+"), altında işlem menüsü. Gerçek baloncuk açıkken gizlenir (kopya aynı yerde durur);
 * kopya, baloncuğun o anki DOM'unun `cloneNode`'u olduğu için metin, kart, fotoğraf ve tepki çipi dahil her mesaj türü aynı görünür
 * (kopya `inert` ve `aria-hidden`, kimlik öznitelikleri silinir). Yerleşim `message-sheet-layout.ts`'tedir: grup görünür alana sığacak
 * kadar kayar, ekrandan uzun mesaj kırpılır; klavye/adres çubuğu (görsel görünüm alanı) değişince yeniden yerleşir.
 */
export function MessageActionSheet({
  message,
  isMe,
  sourceRef,
  myReaction,
  onReact,
  canEditOrDelete,
  actions,
  onReply,
  onClose,
}: {
  message: Message;
  isMe: boolean;
  /** The bubble's own content element: cloned, positioned against, and hidden while the sheet is open. */
  sourceRef: RefObject<HTMLElement | null>;
  myReaction: string | null;
  onReact: (emoji: string) => void;
  canEditOrDelete: boolean;
  actions: MessageBubbleActions;
  onReply: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cloneRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [entered, setEntered] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // 1) Kopya + gerçek baloncuğu gizle. Kopya, gizlemeden ÖNCE alınır.
  useLayoutEffect(() => {
    const source = sourceRef.current;
    const host = cloneRef.current;
    if (!source || !host) return;
    openedAt.current = Date.now();
    const copy = source.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[id],[data-message-id],[data-message-actions]").forEach((node) => {
      node.removeAttribute("id");
      node.removeAttribute("data-message-id");
    });
    copy.setAttribute("inert", "");
    copy.setAttribute("aria-hidden", "true");
    copy.style.width = "100%";
    copy.style.maxWidth = "none";
    host.style.width = `${source.getBoundingClientRect().width}px`;
    host.replaceChildren(copy);
    const previous = source.style.visibility;
    source.style.visibility = "hidden";
    return () => {
      source.style.visibility = previous;
      host.replaceChildren();
    };
  }, [sourceRef]);

  // 2) Yerleşim: açılışta ve görünür alan / çubuk / menü boyutu değişince.
  const measure = useCallback(() => {
    const source = sourceRef.current;
    const root = rootRef.current;
    const bar = barRef.current;
    const host = cloneRef.current;
    const menu = menuRef.current;
    if (!source || !root || !bar || !host || !menu) return;
    const vv = window.visualViewport;
    const viewport: Box = vv
      ? { top: vv.offsetTop, left: vv.offsetLeft, bottom: vv.offsetTop + vv.height, right: vv.offsetLeft + vv.width }
      : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
    const style = window.getComputedStyle(root);
    const bounds: Box = {
      top: viewport.top + (parseFloat(style.paddingTop) || 0) + EDGE_MARGIN,
      bottom: viewport.bottom - (parseFloat(style.paddingBottom) || 0) - EDGE_MARGIN,
      left: viewport.left + EDGE_MARGIN,
      right: viewport.right - EDGE_MARGIN,
    };
    const rect = source.getBoundingClientRect();
    const align = isMe ? "end" : "start";
    const layout = computeSheetLayout({
      bounds,
      bubbleTop: rect.top,
      bubbleHeight: host.scrollHeight,
      barHeight: bar.offsetHeight,
      menuHeight: menu.offsetHeight,
    });
    const next: Placed = {
      top: layout.top,
      shift: layout.shift,
      cloneMaxHeight: layout.cloneMaxHeight,
      cloneWidth: rect.width,
      barLeft: alignInBounds({ anchorLeft: rect.left, anchorRight: rect.right, width: bar.offsetWidth, bounds, align }),
      cloneLeft: alignInBounds({ anchorLeft: rect.left, anchorRight: rect.right, width: rect.width, bounds, align: "start" }),
      menuLeft: alignInBounds({ anchorLeft: rect.left, anchorRight: rect.right, width: menu.offsetWidth, bounds, align }),
    };
    setPlaced((previous) => (samePlacement(previous, next) ? previous : next));
  }, [isMe, sourceRef]);

  useLayoutEffect(() => {
    measure();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const vv = window.visualViewport;
    window.addEventListener("resize", schedule);
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (barRef.current) observer?.observe(barRef.current);
    if (menuRef.current) observer?.observe(menuRef.current);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, [measure]);

  // 3) Açılış hareketi: grup mesajın gerçek yerinden (kayma kadar) başlayıp oturur.
  const firstPlacement = placed !== null;
  useEffect(() => {
    if (!firstPlacement) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [firstPlacement]);

  // 4) Klavye, kaydırma kilidi, odak.
  useEffect(() => {
    const root = rootRef.current;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();
    root?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")].filter((el) => el.closest("[inert]") === null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      unlockBodyScroll();
      // Odak, sayfa kapanırken başka bir yere taşınmadıysa (örn. düzenleme alanı) onu açan düğmeye döner.
      if (returnTo?.isConnected && (document.activeElement === document.body || root?.contains(document.activeElement))) returnTo.focus({ preventScroll: true });
    };
  }, []);

  function onRootClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (Date.now() - openedAt.current < IGNORE_CLICK_MS) return;
    if ((event.target as Element).closest("[data-sheet-panel]")) return;
    onClose();
  }

  const hidden = placed === null;
  const style = placed
    ? {
        top: placed.top,
        transform: entered ? "none" : `translateY(${placed.shift}px)`,
        transition: entered ? "transform 280ms var(--ease-soft, ease), top 200ms var(--ease-soft, ease)" : "none",
      }
    : undefined;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("messages.messageOptionsAriaLabel")}
      tabIndex={-1}
      data-message-sheet
      onClick={onRootClick}
      // `fixed inset-0` scroller: when even the clipped group is taller than a very short visible area, the sheet itself scrolls.
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-background/55 outline-none backdrop-blur-xl animate-fade-in"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 flex flex-col gap-2.5"
        style={{ ...style, visibility: hidden ? "hidden" : "visible" }}
      >
        <div
          ref={barRef}
          data-sheet-panel
          className="pointer-events-auto w-[min(22rem,calc(100%_-_1.5rem))]"
          style={{ marginLeft: placed?.barLeft ?? 0 }}
        >
          <EmojiPicker variant="bar" myReaction={myReaction} onSelect={onReact} />
        </div>
        {/* The message copy: not interactive (taps fall through to the scrim and close the sheet). */}
        <div
          ref={cloneRef}
          data-sheet-clone
          className="flow-root"
          style={{
            marginLeft: placed?.cloneLeft ?? 0,
            maxHeight: placed?.cloneMaxHeight ?? undefined,
            overflow: placed?.cloneMaxHeight ? "hidden" : undefined,
            WebkitMaskImage: placed?.cloneMaxHeight ? "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)" : undefined,
            maskImage: placed?.cloneMaxHeight ? "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)" : undefined,
          }}
        />
        <div ref={menuRef} data-sheet-panel className="pointer-events-auto w-fit max-w-[calc(100%_-_1.5rem)]" style={{ marginLeft: placed?.menuLeft ?? 0 }}>
          <MessageActionMenu
            message={message}
            isMe={isMe}
            canEditOrDelete={canEditOrDelete}
            actions={actions}
            onReply={onReply}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
