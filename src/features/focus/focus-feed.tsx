"use client";

import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Inbox, Rows3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useStorageSrc } from "@/components/ui/storage-media";
import { ViewModeSwitcher } from "@/features/content/view-mode-switcher";
import { getViewMode, setViewMode } from "@/features/content/view-mode-store";
import { feedItemKey, type FeedItem } from "@/features/feed/types";
import { focusFeedCover, focusFeedIsNear, focusFeedShouldLoadMore, focusFeedStartIndex } from "@/lib/focus-feed";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { FocusFeedSlide } from "./focus-feed-slide";

/**
 * Odak Akışı (docs/history/199-*) — the third mode of the shared Kart | Odak
 * view preference (`view-mode-store.ts`, value `feed`), offered by Ana Sayfa.
 *
 * It is a LAYER over the page's content area, not a new route: the header,
 * the sidebar / bottom nav stay where they are (the layer sits between them),
 * and the card list keeps rendering underneath with its scroll position, so
 * switching back lands on the card of the post that was open. The list data,
 * paging (`useFeedPages`), like / comment / save / share, copy and the auth
 * prompts are the page's and the cards' own — nothing here talks to Supabase
 * except through those shared pieces.
 *
 * Scrolling is native: a vertical `scroll-snap` (mandatory, one stop per post)
 * the browser drives; JS only scrolls on an explicit keyboard / button step.
 * The active post is the one an IntersectionObserver sees ≥ 60% inside the
 * layer; only it and its neighbours mount their pictures, and its picture is
 * mirrored, blurred, into the cross-fading backdrop.
 */

export interface FocusFeedProps {
  items: FeedItem[];
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  /** The list's own empty state (filters / login prompts stay the page's). */
  empty: ReactNode;
  /** The list's own controls shown in the layer's bar (Ana Sayfa: its feed tabs). */
  controls?: ReactNode;
  /** Identifies this feed (tab + filters) for "the post you last had open" during the session. */
  memoryKey: string;
}

/** Last open post per feed — session memory only (a module map; the page reloads when the account changes). */
const lastOpen = new Map<string, string>();

/**
 * Below the sticky 64px header; above the 64px phone nav (+ safe area); right of the 72px rail / 256px sidebar.
 * z 29: over the cards' own raised rows (z-20), under the header (z-30, its menus drop over the layer) and the nav.
 */
const LAYER_CLASS =
  "fixed inset-x-0 top-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[29] flex flex-col overflow-hidden bg-background md:bottom-0 md:left-[72px] lg:left-64";

export function FocusFeed(props: FocusFeedProps) {
  return (
    <FocusFeedBoundary>
      <FocusFeedLayer {...props} />
    </FocusFeedBoundary>
  );
}

/* --------------------------------------------------------------- error boundary */

/**
 * A failure inside Odak Akışı never takes the list down with it: the layer is
 * dropped (the cards underneath are already there) and a small bar explains it,
 * with the switch back to the card view.
 */
class FocusFeedBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FocusFeed", error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <FocusFeedFailedNotice />;
    return this.props.children;
  }
}

function FocusFeedFailedNotice() {
  const { t } = useTranslation();
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:bottom-6 md:left-[72px] lg:left-64">
      <div className="flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-small text-text shadow-pop">
        <span className="min-w-0 flex-1">{t("focusFeed.failed")}</span>
        <Button size="sm" variant="outline" onClick={() => setViewMode("card")}>
          {t("view.card")}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- backdrop */

function BackdropLayer({ url, visible }: { url: string | null; visible: boolean }) {
  // Same signed URL (and so the same cached file) the active slide's picture already uses.
  const { src } = useStorageSrc(url);
  return (
    <div
      aria-hidden
      className={cn(
        "absolute -inset-16 scale-110 bg-cover bg-center blur-3xl saturate-150 transition-opacity duration-700 ease-soft will-change-[opacity] motion-reduce:transition-none",
        visible && src ? "opacity-45 dark:opacity-55" : "opacity-0",
      )}
      style={src ? { backgroundImage: `url("${src}")` } : undefined}
    />
  );
}

/**
 * Two layers that cross-fade: a new active picture goes into the hidden one, which then fades in over the other.
 * Changes only when the ACTIVE post changes; a post without a picture fades the backdrop to the plain token background.
 */
function FocusFeedBackdrop({ url }: { url: string | null }) {
  const [layers, setLayers] = useState<{ a: string | null; b: string | null; front: "a" | "b" }>({ a: url, b: null, front: "a" });
  const current = layers.front === "a" ? layers.a : layers.b;
  if (current !== url) setLayers((prev) => (prev.front === "a" ? { a: prev.a, b: url, front: "b" } : { a: url, b: prev.b, front: "a" }));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <BackdropLayer url={layers.a} visible={layers.front === "a"} />
      <BackdropLayer url={layers.b} visible={layers.front === "b"} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background/90" />
    </div>
  );
}

/* ------------------------------------------------------------------------- layer */

/** The card the visitor is looking at in the list underneath (only once they have scrolled it): Odak Akışı opens there. */
function visibleCardKey(): string | null {
  if (typeof window === "undefined" || window.scrollY < 120) return null;
  for (const element of document.querySelectorAll<HTMLElement>("[data-feed-key]")) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom > 96 && rect.top < window.innerHeight) return element.dataset.feedKey ?? null;
  }
  return null;
}

/** Back on a list: put the card of the post that was open at the top, under the header. */
function revealCard(key: string) {
  const element = document.querySelector<HTMLElement>(`[data-feed-key="${CSS.escape(key)}"]`);
  if (!element) return;
  window.scrollTo({ top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - 88), behavior: "auto" });
}

function FocusFeedLayer({ items, loading, failed, hasMore, loadingMore, onLoadMore, onRetry, empty, controls, memoryKey }: FocusFeedProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Which list (tab + filters) the slides were positioned for — a new list opens at its own start.
  const positionedFor = useRef<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const total = items.length;

  // The page underneath must not scroll behind the layer (shared, ref-counted lock — same as the modals),
  // nor be reachable with Tab / a screen reader while it is covered.
  useEffect(() => {
    lockBodyScroll();
    const main = document.getElementById("main-content");
    main?.setAttribute("inert", "");
    return () => {
      main?.removeAttribute("inert");
      unlockBodyScroll();
      // Unmounted because the view was switched (not because the page was left): show that post's card.
      const key = activeKeyRef.current;
      if (key && getViewMode() !== "feed") requestAnimationFrame(() => revealCard(key));
    };
  }, []);

  // First items of a list: open on the card in view / the remembered post, instantly, before paint.
  useLayoutEffect(() => {
    if (loading || total === 0) return;
    if (positionedFor.current === memoryKey) return;
    positionedFor.current = memoryKey;
    const start = focusFeedStartIndex(items.map(feedItemKey), { visibleKey: visibleCardKey(), rememberedKey: lastOpen.get(memoryKey) });
    setActive(start);
    const scroller = scrollerRef.current;
    const slide = scroller?.querySelector<HTMLElement>(`[data-slide-index="${start}"]`);
    if (scroller && slide) scroller.scrollTop = slide.offsetTop;
    scroller?.focus({ preventScroll: true });
  }, [loading, total, memoryKey, items]);

  // While a new list loads, forget the old position.
  useEffect(() => {
    if (loading) positionedFor.current = null;
  }, [loading]);

  // Active post = the slide that is ≥ 60% inside the layer.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || total === 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = Number((entry.target as HTMLElement).dataset.slideIndex);
            if (Number.isFinite(index)) setActive(index);
          }
        }
      },
      { root: scroller, threshold: [0.6, 0.85] },
    );
    scroller.querySelectorAll("[data-slide-index]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [total, loading]);

  const activeItem = items[Math.min(active, Math.max(0, total - 1))];
  const activeKey = activeItem ? feedItemKey(activeItem) : null;
  useEffect(() => {
    activeKeyRef.current = activeKey;
    if (activeKey) lastOpen.set(memoryKey, activeKey);
  }, [activeKey, memoryKey]);

  // Next page a few posts before the end (the same `loadMore` as the list's own button).
  useEffect(() => {
    if (focusFeedShouldLoadMore(active, total, { hasMore, loadingMore, failed })) onLoadMore();
  }, [active, total, hasMore, loadingMore, failed, onLoadMore]);

  const go = useCallback(
    (index: number) => {
      const scroller = scrollerRef.current;
      const last = scroller ? scroller.querySelectorAll("[data-slide-index]").length - 1 : -1;
      const target = Math.max(0, Math.min(index, last));
      const slide = scroller?.querySelector<HTMLElement>(`[data-slide-index="${target}"]`);
      if (scroller && slide) scroller.scrollTo({ top: slide.offsetTop, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [reducedMotion],
  );

  // ↑ ↓ / PageUp PageDown / j k / Home End step through the posts; Esc goes back to the cards.
  // Ignored while a dialog (save / share / prompt / login) is open or a field has focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const keys: Record<string, () => void> = {
        ArrowDown: () => go(active + 1),
        PageDown: () => go(active + 1),
        j: () => go(active + 1),
        ArrowUp: () => go(active - 1),
        PageUp: () => go(active - 1),
        k: () => go(active - 1),
        Home: () => go(0),
        End: () => go(Number.MAX_SAFE_INTEGER),
        Escape: () => setViewMode("card"),
      };
      const action = keys[event.key];
      // Arrow keys inside a tab list move between tabs (Tabs' own roving focus), not posts.
      if (!action || (target?.closest('[role="tablist"]') && event.key.startsWith("Arrow"))) return;
      event.preventDefault();
      action();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, go]);

  const backdropUrl = activeItem ? (focusFeedCover(activeItem)?.url ?? null) : null;

  // Rendered into <body> (outside the inert <main>). Only ever mounted on the client after hydration:
  // the view preference reads "card" until then (`useViewMode`'s server snapshot).
  return createPortal(
    <div className={LAYER_CLASS} data-focus-feed>
      <FocusFeedBackdrop url={loading ? null : backdropUrl} />

      <div className="relative z-10 flex min-w-0 items-center gap-2 px-3 pb-1 pt-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => setViewMode("card")}
          aria-label={t("view.switchToCard")}
          title={t("view.switchToCard")}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-soft bg-surface/80 text-text-secondary backdrop-blur-md transition-colors hover:bg-surface hover:text-text md:hidden"
        >
          <Rows3 size={18} strokeWidth={1.9} aria-hidden />
        </button>
        <div className="scrollbar-none min-w-0 flex-1 overflow-x-auto">{controls}</div>
        {total > 0 && !loading && (
          <span
            className="shrink-0 rounded-full border border-border-soft bg-surface/80 px-2.5 py-1 text-caption font-semibold tabular-nums text-text-secondary backdrop-blur-md"
            aria-label={t("focusFeed.position", { current: Math.min(active + 1, total), total })}
          >
            {String(Math.min(active + 1, total)).padStart(2, "0")}
            <span aria-hidden className="px-1 text-text-muted">/</span>
            {String(total).padStart(2, "0")}
            {hasMore ? "+" : ""}
          </span>
        )}
        <ViewModeSwitcher allowFeed className="bg-surface/80 backdrop-blur-md max-md:hidden" />
      </div>

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-3 sm:px-6" aria-busy="true">
          <div className="grid h-full w-full max-w-[1000px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-5">
            <Skeleton className="h-full max-h-[880px] rounded-xl" />
            <div className="flex w-12 flex-col items-center gap-4 sm:w-14">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-11 rounded-full" />
              ))}
            </div>
          </div>
        </div>
      ) : failed && total === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">
          <EmptyState icon={Sparkles} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: onRetry }} />
        </div>
      ) : total === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">{empty}</div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollerRef}
            tabIndex={-1}
            role="region"
            aria-label={t("focusFeed.ariaLabel")}
            aria-describedby="focus-feed-hint"
            aria-busy={loadingMore}
            className="scrollbar-none absolute inset-0 snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none"
          >
            {items.map((item, index) => (
              <FocusFeedSlide key={feedItemKey(item)} item={item} index={index} active={index === active} near={focusFeedIsNear(index, active)} />
            ))}
            <FeedEndSlide index={total} hasMore={hasMore} loadingMore={loadingMore} failed={failed} onRetry={onLoadMore} onTop={() => go(0)} />
          </div>

          <div className="pointer-events-none absolute bottom-4 right-3 hidden flex-col gap-2 lg:flex">
            <StepButton label={t("focusFeed.prevPost")} disabled={active <= 0} onClick={() => go(active - 1)}>
              <ChevronUp size={18} aria-hidden />
            </StepButton>
            <StepButton label={t("focusFeed.nextPost")} disabled={active >= total} onClick={() => go(active + 1)}>
              <ChevronDown size={18} aria-hidden />
            </StepButton>
          </div>
          <p id="focus-feed-hint" className="sr-only">
            {t("focusFeed.keyboardHint")}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-soft bg-surface/85 text-text-secondary shadow-sm backdrop-blur-md transition-colors hover:bg-surface hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The last snap point: the next page loading, a retry after a failed page, or the end of the feed. */
function FeedEndSlide({ index, hasMore, loadingMore, failed, onRetry, onTop }: { index: number; hasMore: boolean; loadingMore: boolean; failed: boolean; onRetry: () => void; onTop: () => void }) {
  const { t } = useTranslation();
  return (
    <section data-slide-index={index} className="flex h-full snap-center snap-always items-center justify-center px-4">
      {failed ? (
        <EmptyState icon={Sparkles} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: onRetry }} />
      ) : hasMore || loadingMore ? (
        <p role="status" className="text-small text-text-muted">
          {t("common.loadingMore")}
        </p>
      ) : (
        <div className="space-y-4 text-center">
          <EmptyState icon={Inbox} title={t("focusFeed.endTitle")} description={t("focusFeed.endDescription")} />
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={onTop}>
              <ChevronUp size={16} aria-hidden />
              {t("focusFeed.backToTop")}
            </Button>
            <Button onClick={() => setViewMode("card")}>
              <Rows3 size={16} aria-hidden />
              {t("view.switchToCard")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
