"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft } from "@/components/icons/chevron-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import { coverflowCardSize, coverflowPose, coverflowTransform, stepIndex, wrapOffset } from "@/lib/coverflow";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 3200;
/** Horizontal travel (px) that counts as a swipe rather than a tap. */
const SWIPE_PX = 40;
const TAP_SLOP_PX = 8;

/**
 * 3D coverflow (docs/history/346-*): the centre card stands upright, its neighbours tilt back in perspective. A tap on a
 * neighbour brings it to the centre; arrow keys and swipes step through the loop. The stage takes its size from the box it is
 * put in (`className` sets the height), so the same component serves a hero, a login side panel and a gallery.
 *
 * Controlled: the parent owns `active`. Cards hold whatever `renderCard` draws; only the centre card's content can be focused or
 * clicked (the rest is `inert`), so a tap on a side card always means "bring it forward". A tap on the centre card is the
 * parent's business — either its own control inside the card, or `onActiveClick` (also fired by Enter on the focused stage).
 * Autoplay is decoration only: it pauses on hover and focus and never runs with reduced motion.
 */
export function Coverflow<T>({
  items,
  active,
  onActiveChange,
  itemKey,
  itemLabel,
  renderCard,
  onActiveClick,
  label,
  aspect = 0.8,
  widthShare,
  autoplay = false,
  className,
}: {
  items: T[];
  active: number;
  onActiveChange: (index: number) => void;
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  renderCard: (item: T, state: { active: boolean }) => ReactNode;
  onActiveClick?: (item: T) => void;
  /** Accessible name of the whole gallery. */
  label: string;
  /** Card width ÷ height. */
  aspect?: number;
  /** Widest a card may get, as a fraction of the stage width. */
  widthShare?: number;
  autoplay?: boolean;
  /** Sets the stage height (e.g. `h-[22rem]`). */
  className?: string;
}) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [animate, setAnimate] = useState(false);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const swipe = useRef<{ x: number } | null>(null);
  const suppressTap = useRef(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The first layout must not animate from nothing: transitions switch on two frames after the first measurement.
  const measured = size !== null;
  useEffect(() => {
    if (!measured) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [measured]);

  useEffect(() => {
    if (!autoplay || reduced || paused || count < 2) return;
    // One timeout per active card: a manual move restarts the wait instead of racing the timer.
    const id = window.setTimeout(() => onActiveChange(stepIndex(active, 1, count)), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [autoplay, reduced, paused, count, active, onActiveChange]);

  const step = (delta: number) => onActiveChange(stepIndex(active, delta, count));

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Enter" && onActiveClick && event.target === event.currentTarget && items[active]) {
      event.preventDefault();
      onActiveClick(items[active]);
    }
  }

  function onPointerDown(event: PointerEvent) {
    swipe.current = { x: event.clientX };
    suppressTap.current = false;
  }
  function onPointerMove(event: PointerEvent) {
    if (swipe.current && Math.abs(event.clientX - swipe.current.x) > TAP_SLOP_PX) suppressTap.current = true;
  }
  function onPointerUp(event: PointerEvent) {
    const start = swipe.current;
    swipe.current = null;
    if (start && Math.abs(event.clientX - start.x) > SWIPE_PX) step(event.clientX < start.x ? 1 : -1);
    // The click that follows a swipe fires right after `pointerup`; clear the flag once it has passed.
    window.setTimeout(() => {
      suppressTap.current = false;
    }, 0);
  }

  const card = size ? coverflowCardSize(size.width, size.height, aspect, widthShare) : null;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription={t("coverflow.roleDescription")}
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipe.current = null;
      }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      data-testid="coverflow"
      className={cn("relative w-full select-none overflow-hidden outline-none [touch-action:pan-y] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", className)}
      style={card ? { perspective: `${Math.round(card.width * 4.2)}px` } : undefined}
    >
      {card && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d]" style={{ width: card.width, height: card.height }}>
          {items.map((item, index) => {
            const pose = coverflowPose(wrapOffset(index, active, count), card.width);
            const isActive = index === active;
            return (
              <div
                key={itemKey(item)}
                role="group"
                aria-label={itemLabel(item)}
                aria-hidden={pose.visible ? undefined : true}
                data-coverflow-card={index}
                data-active={isActive || undefined}
                onClick={() => {
                  if (suppressTap.current) return;
                  if (!isActive) onActiveChange(index);
                  else if (onActiveClick) onActiveClick(item);
                }}
                className={cn("absolute left-1/2 top-1/2 overflow-hidden rounded-lg bg-surface-soft shadow-card-hover [transform-style:preserve-3d]", isActive && !onActiveClick ? "cursor-default" : "cursor-pointer")}
                style={{
                  width: card.width,
                  height: card.height,
                  transform: coverflowTransform(pose),
                  opacity: pose.visible ? 1 : 0,
                  pointerEvents: pose.visible ? "auto" : "none",
                  transition: animate ? "transform var(--motion-emphasis) var(--ease-soft), opacity var(--motion-emphasis) var(--ease-soft)" : "none",
                }}
              >
                <div className="absolute inset-0" inert={!isActive}>
                  {renderCard(item, { active: isActive })}
                </div>
                <div
                  aria-hidden
                  className={cn("pointer-events-none absolute inset-0 bg-black", isActive ? "opacity-0" : "opacity-40")}
                  style={{ transition: animate ? "opacity var(--motion-emphasis) var(--ease-soft)" : "none" }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Previous / next buttons for a coverflow, for people who do not swipe or use arrow keys. */
export function CoverflowArrows({ onPrev, onNext, className }: { onPrev: () => void; onNext: () => void; className?: string }) {
  const { t } = useTranslation();
  const button = "flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text transition-colors hover:border-primary hover:text-primary";
  return (
    <div className={cn("flex shrink-0 gap-1.5", className)}>
      <button type="button" onClick={onPrev} aria-label={t("coverflow.prev")} className={button}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <button type="button" onClick={onNext} aria-label={t("coverflow.next")} className={button}>
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );
}
