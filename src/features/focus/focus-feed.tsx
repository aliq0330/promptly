"use client";

import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Clock, GalleryVerticalEnd, Images, Inbox, Sparkles, UserCheck, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useStorageSrc } from "@/components/ui/storage-media";
import { useTheme } from "@/components/theme/theme-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { feedItemKey } from "@/features/feed/types";
import { useFeedPages } from "@/features/feed/use-feed-pages";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { focusFeedCover, focusFeedHasMedia, focusFeedIsNear, focusFeedShouldLoadMore, focusFeedStartIndex } from "@/lib/focus-feed";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePrefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { FocusFeedSlide, FocusPlaybackContext, HIDE_WHILE_COMMENTS } from "./focus-feed-slide";
import { FocusCommentsContext, FocusCommentsSheet } from "./focus-comments-sheet";
import type { FeedItem } from "@/features/feed/types";

/**
 * Odak (`/focus`, docs/history/199-*) — everyone's public posts, one per screen, scrolled vertically, full screen (the
 * header, sidebar and bottom nav hide while it is open, like the story viewer). Always on a dark stage in the visitor's
 * own palette. Data is Ana Sayfa's: `feed_page` (newest, every kind; "Takip" = people you follow) through `useFeedPages`,
 * so only published + public, non-community content appears. Like / comment / save / share / copy and the login prompts
 * are the cards' own components.
 *
 * Scrolling is native: a vertical `scroll-snap` (mandatory, one stop per post) the browser drives; JS only scrolls on an
 * explicit keyboard / button step. The active post is the one an IntersectionObserver sees ≥ 60% on screen; only it and its
 * neighbours mount pictures / video / audio, and its picture is mirrored, blurred, into the cross-fading backdrop. The
 * active video / audio plays (muted until the sound switch is turned on), the others pause.
 */

type FocusTab = "newest" | "following";

/** Last open post per feed (tab + filter) — session memory only (a module map; the page reloads when the account changes). */
const lastOpen = new Map<string, string>();

const noSubscribe = () => () => undefined;

export function FocusPage() {
  // The static export prerenders this route without a document: Odak (a portal over <body>) mounts on the client only.
  const isClient = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!isClient) return null;
  return (
    <FocusFeedBoundary>
      <FocusScreen />
    </FocusFeedBoundary>
  );
}

/* ------------------------------------------------------------------------ chrome */

/**
 * Full screen while mounted: the app bars hide (`html[data-focus-open]`, globals.css), the page behind does not scroll, and the
 * browser's own bars (iOS status / toolbar, `theme-color`) take the stage colour instead of the page's; all restored on leave.
 */
function useFullScreenChrome() {
  useEffect(() => {
    const html = document.documentElement;
    const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const saved = { html: html.style.backgroundColor, body: document.body.style.backgroundColor, meta: meta?.content ?? null };
    const stage = getComputedStyle(html).getPropertyValue("--color-story-stage").trim();
    html.dataset.focusOpen = "";
    if (stage) {
      html.style.backgroundColor = stage;
      document.body.style.backgroundColor = stage;
      if (meta) meta.content = stage;
    }
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
      delete html.dataset.focusOpen;
      html.style.backgroundColor = saved.html;
      document.body.style.backgroundColor = saved.body;
      if (meta && saved.meta !== null) meta.content = saved.meta;
    };
  }, []);
}

/** The dark stage in the visitor's palette (`.dark` + `data-palette` re-scope every token for this subtree). */
function Stage({ children, className, commentsOpen = false }: { children: ReactNode; className?: string; commentsOpen?: boolean }) {
  const { palette } = useTheme();
  return (
    <div
      data-focus-feed
      data-palette={palette}
      data-comments-open={commentsOpen ? "" : undefined}
      className={cn("group/stage dark fixed inset-0 z-[45] flex flex-col overflow-hidden bg-background text-text", className)}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- error boundary */

/** A failure inside Odak never leaves a blank screen: a message, a retry, and the way home. */
class FocusFeedBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Focus", error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <FocusFailed onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}

function FocusFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  useFullScreenChrome();
  return createPortal(
    <Stage className="items-center justify-center px-4">
      <EmptyState icon={GalleryVerticalEnd} title={t("focusFeed.failedTitle")} action={{ label: t("common.retry"), onClick: onRetry }} />
      <Button variant="outline" className="mt-3" onClick={() => router.push("/")}>
        {t("focusFeed.backHome")}
      </Button>
    </Stage>,
    document.body,
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
        visible && src ? "opacity-55" : "opacity-0",
      )}
      style={src ? { backgroundImage: `url("${src}")` } : undefined}
    />
  );
}

/**
 * Two layers that cross-fade: a new active picture goes into the hidden one, which then fades in over the other.
 * Changes only when the ACTIVE post changes; a post without a picture fades the backdrop to the plain stage.
 */
function FocusFeedBackdrop({ url }: { url: string | null }) {
  const [layers, setLayers] = useState<{ a: string | null; b: string | null; front: "a" | "b" }>({ a: url, b: null, front: "a" });
  const current = layers.front === "a" ? layers.a : layers.b;
  if (current !== url) setLayers((prev) => (prev.front === "a" ? { a: prev.a, b: url, front: "b" } : { a: url, b: prev.b, front: "a" }));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <BackdropLayer url={layers.a} visible={layers.front === "a"} />
      <BackdropLayer url={layers.b} visible={layers.front === "b"} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/35 to-background/85" />
    </div>
  );
}

/**
 * The on-screen box of a slide's picture / video as actually painted (`object-contain` letterboxes it inside its element),
 * or `null` when the slide has none (yet).
 */
function mediaBox(slide: HTMLElement): DOMRect | null {
  const media = slide.querySelector<HTMLImageElement | HTMLVideoElement>("article video, article img");
  if (!media) return null;
  const rect = media.getBoundingClientRect();
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!width || !height || !rect.width || !rect.height) return rect.width && rect.height ? rect : null;
  const fit = Math.min(rect.width / width, rect.height / height);
  const w = width * fit;
  const h = height * fit;
  return new DOMRect(rect.left + (rect.width - w) / 2, rect.top + (rect.height - h) / 2, w, h);
}

/* ------------------------------------------------------------------------ screen */

function FocusScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<FocusTab>("newest");
  const [mediaOnly, setMediaOnly] = useState(false);
  const [muted, setMuted] = useState(true);
  // The post whose comments are open (docs/history/200-*): the sheet slides up, the post shrinks above it and keeps playing.
  const [commentsItem, setCommentsItem] = useState<FeedItem | null>(null);
  const openComments = useCallback((item: FeedItem) => setCommentsItem(item), []);
  const closeComments = useCallback(() => setCommentsItem(null), []);
  const contentRef = useRef<HTMLDivElement>(null);
  const [shrink, setShrink] = useState<{ scale: number; x: number; y: number } | null>(null);
  const playback = useMemo(() => ({ muted, setMuted }), [muted]);
  useFullScreenChrome();

  // "Takip" needs an account: a guest gets the login prompt and no request is made (while the session restores we wait).
  const waitingForAuth = tab === "following" && authLoading;
  const needsLogin = tab === "following" && !authLoading && !user;
  const feed = useFeedPages({ scope: tab === "following" ? "following" : "all", order: "newest", kind: "all", taxonomy: EMPTY_TAXONOMY_FILTER }, !needsLogin && !waitingForAuth);
  const items = useMemo(() => (mediaOnly ? feed.items.filter(focusFeedHasMedia) : feed.items), [feed.items, mediaOnly]);
  const loading = !needsLogin && (feed.loading || waitingForAuth);
  const memoryKey = `${tab}:${mediaOnly ? "media" : "all"}`;

  const close = useCallback(() => {
    // Back to where Odak was opened from; a directly opened /focus goes home.
    if (window.history.length > 1) router.back();
    else router.push("/");
  }, [router]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Which list (tab + filter) the slides were positioned for — a new list opens at its own start.
  const positionedFor = useRef<string | null>(null);
  const total = items.length;

  // First items of a list: open on the post last open in it this session, instantly, before paint.
  useLayoutEffect(() => {
    if (loading || total === 0 || positionedFor.current === memoryKey) return;
    positionedFor.current = memoryKey;
    const start = focusFeedStartIndex(items.map(feedItemKey), lastOpen.get(memoryKey));
    setActive(start);
    const scroller = scrollerRef.current;
    const slide = scroller?.querySelector<HTMLElement>(`[data-slide-index="${start}"]`);
    if (scroller && slide) scroller.scrollTop = slide.offsetTop;
    scroller?.focus({ preventScroll: true });
  }, [loading, total, memoryKey, items]);

  // A reloading list forgets the old position (a new tab / filter already differs from `positionedFor`).
  useEffect(() => {
    if (loading) positionedFor.current = null;
  }, [loading]);

  // Active post = the slide that is ≥ 60% on screen.
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
    if (activeKey) lastOpen.set(memoryKey, activeKey);
  }, [activeKey, memoryKey]);

  // Next page a few posts before the end (Ana Sayfa's own paging). The raw count is a dependency too: with "Medya" a page
  // can add no slide at all, and paging must still continue.
  const { hasMore, loadingMore, failed, loadMore } = feed;
  const rawCount = feed.items.length;
  useEffect(() => {
    if (loading || needsLogin) return;
    if (focusFeedShouldLoadMore(active, total, { hasMore, loadingMore, failed })) void loadMore();
  }, [active, total, rawCount, hasMore, loadingMore, failed, loadMore, loading, needsLogin]);

  // Phone: with the sheet open the post's MEDIA (its picture / video as actually shown — `object-contain`) is fitted into the
  // space above the sheet and centred there, Instagram-style; a post without media fits as a whole. Measured on open and on
  // resize; from `md` the sheet is a side panel and nothing is scaled.
  useEffect(() => {
    if (!commentsItem) return;
    const measure = () => {
      const content = contentRef.current;
      const sheetBox = content?.parentElement?.querySelector<HTMLElement>("[data-focus-comments]");
      const slide = content?.querySelector<HTMLElement>(`[data-slide-index="${active}"]`);
      if (!content || !sheetBox || !slide || !window.matchMedia("(max-width: 767.98px)").matches) {
        setShrink(null);
        return;
      }
      const origin = content.getBoundingClientRect();
      const box = mediaBox(slide) ?? slide.getBoundingClientRect();
      const safeTop = parseFloat(getComputedStyle(content).getPropertyValue("--focus-safe-top")) || 0;
      const top = safeTop + 8;
      const bottom = sheetBox.getBoundingClientRect().top - 8;
      const scale = Math.min(1, (bottom - top) / box.height, (origin.width - 16) / box.width);
      // Transform origin is the content box's top-left: map the media box's centre to the centre of the free area.
      const cx = box.left - origin.left + box.width / 2;
      const cy = box.top - origin.top + box.height / 2;
      setShrink({ scale, x: origin.width / 2 - cx * scale, y: (top + bottom) / 2 - origin.top - cy * scale });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [commentsItem, active]);

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

  // ↑ ↓ / PageUp PageDown / j k / Home End step through the posts; Esc closes Odak.
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
        Escape: close,
      };
      const action = keys[event.key];
      // Arrow keys inside a tab list move between tabs (Tabs' own roving focus), not posts.
      if (!action || (target?.closest('[role="tablist"]') && event.key.startsWith("Arrow"))) return;
      event.preventDefault();
      action();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, go, close]);

  const backdropUrl = activeItem && !loading ? (focusFeedCover(activeItem)?.url ?? null) : null;
  const barButton =
    "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  // Rendered into <body>, over the whole app (client only — see `FocusPage`).
  return createPortal(
    <Stage commentsOpen={Boolean(commentsItem)}>
      <FocusPlaybackContext.Provider value={playback}>
      <FocusCommentsContext.Provider value={openComments}>
        <FocusFeedBackdrop url={backdropUrl} />

        {/* Floating bar: over the posts on a phone (a soft scrim keeps it legible), the same from `md`. */}
        <div className={cn(HIDE_WHILE_COMMENTS, "md:group-data-[comments-open]/stage:right-[420px]", "absolute inset-x-0 top-0 z-30 flex min-w-0 items-center gap-2 bg-gradient-to-b from-black/55 to-transparent px-3 pb-6 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-5")}>
          <button type="button" onClick={close} aria-label={t("focusFeed.close")} title={t("focusFeed.close")} className={cn(barButton, "w-10")}>
            <X size={20} aria-hidden />
          </button>
          <span className="hidden shrink-0 font-display text-h3 font-bold tracking-[-0.03em] text-white sm:inline">{t("nav.focus")}</span>
          <div className="scrollbar-none min-w-0 flex-1 overflow-x-auto sm:flex sm:justify-center">
            <Tabs
              items={[
                { key: "newest" as const, label: t("home.tabNewest"), icon: Clock },
                { key: "following" as const, label: t("nav.following"), icon: UserCheck },
              ]}
              active={tab}
              onChange={(next) => {
                setCommentsItem(null);
                setTab(next);
              }}
              ariaLabel={t("feed.viewAriaLabel")}
              variant="segmented"
              className="w-max bg-black/35 backdrop-blur-md"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setCommentsItem(null);
              setMediaOnly((value) => !value);
            }}
            aria-pressed={mediaOnly}
            title={t("focusFeed.mediaOnlyTitle")}
            className={cn(barButton, "w-10 sm:w-auto sm:px-3.5", mediaOnly && "border-white/60 bg-white text-black hover:bg-white/90")}
          >
            <Images size={18} aria-hidden />
            <span className="max-sm:sr-only text-label font-semibold">{t("focusFeed.mediaOnly")}</span>
          </button>
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-pressed={!muted}
            aria-label={muted ? t("focusFeed.soundOn") : t("focusFeed.soundOff")}
            title={muted ? t("focusFeed.soundOn") : t("focusFeed.soundOff")}
            className={cn(barButton, "w-10")}
          >
            {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
          </button>
          {total > 0 && !loading && (
            <span
              className="hidden shrink-0 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-caption font-semibold tabular-nums text-white/85 backdrop-blur-md md:inline"
              aria-label={t("focusFeed.position", { current: Math.min(active + 1, total), total })}
            >
              {String(Math.min(active + 1, total)).padStart(2, "0")}
              <span aria-hidden className="px-1 text-white/50">/</span>
              {String(total).padStart(2, "0")}
              {hasMore ? "+" : ""}
            </span>
          )}
        </div>

        {loading ? (
          <div className="relative flex min-h-0 flex-1 items-center justify-center md:px-6 md:pb-5 md:pt-16" aria-busy="true">
            <div className="grid h-full w-full max-w-[1000px] grid-cols-[minmax(0,1fr)_auto] items-center gap-5 max-md:block">
              <Skeleton className="h-full max-h-[880px] rounded-none opacity-40 md:rounded-xl md:opacity-100" />
              <div className="flex w-14 flex-col items-center gap-4 max-md:hidden">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-11 w-11 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        ) : needsLogin ? (
          <CenteredState>
            <EmptyState icon={UserCheck} title={t("feed.emptyFollowingTitle")} description={t("feed.emptyFollowingDescription")} action={{ label: t("common.login"), href: "/login" }} />
          </CenteredState>
        ) : failed && total === 0 && !hasMore ? (
          <CenteredState>
            <EmptyState icon={Sparkles} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: feed.retry }} />
          </CenteredState>
        ) : total === 0 && !hasMore ? (
          <CenteredState>
            <EmptyState
              icon={Inbox}
              title={mediaOnly ? t("focusFeed.noMediaTitle") : tab === "following" ? t("feed.emptyFollowingNoPosts") : t("feed.emptyDefault")}
              description={tab === "following" && !mediaOnly ? t("feed.emptyFollowingHint") : undefined}
            />
          </CenteredState>
        ) : (
          <div
            ref={contentRef}
            className={cn(
              "relative min-h-0 flex-1 origin-top-left transition-transform duration-300 ease-soft [--focus-safe-top:env(safe-area-inset-top)] motion-reduce:transition-none",
              commentsItem && "md:mr-[420px]",
            )}
            style={commentsItem && shrink ? { transform: `translate(${shrink.x}px, ${shrink.y}px) scale(${shrink.scale})` } : undefined}
          >
            <div
              ref={scrollerRef}
              tabIndex={-1}
              role="region"
              aria-label={t("focusFeed.ariaLabel")}
              aria-describedby="focus-feed-hint"
              aria-busy={loadingMore}
              className={cn(
                "scrollbar-none absolute inset-0 snap-y snap-mandatory overscroll-contain outline-none",
                commentsItem ? "overflow-hidden" : "overflow-y-auto",
              )}
            >
              {items.map((item, index) => (
                <FocusFeedSlide key={feedItemKey(item)} item={item} index={index} active={index === active} near={focusFeedIsNear(index, active)} />
              ))}
              <FeedEndSlide index={total} hasMore={hasMore} loadingMore={loadingMore} failed={failed} onRetry={() => void loadMore()} onTop={() => go(0)} onClose={close} />
            </div>

            <div className="pointer-events-none absolute bottom-5 right-4 hidden flex-col gap-2 lg:flex">
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
        {commentsItem && (
          <>
            {/* Phone: the shrunken post above the sheet — tapping it closes the comments (the sheet has its own X / Esc). */}
            <button type="button" tabIndex={-1} aria-hidden onClick={closeComments} className="absolute inset-x-0 top-0 z-30 h-[35dvh] md:hidden" />
            <FocusCommentsSheet key={feedItemKey(commentsItem)} item={commentsItem} onClose={closeComments} />
          </>
        )}
      </FocusCommentsContext.Provider>
      </FocusPlaybackContext.Provider>
    </Stage>,
    document.body,
  );
}

function CenteredState({ children }: { children: ReactNode }) {
  return <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pt-16">{children}</div>;
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
function FeedEndSlide({
  index,
  hasMore,
  loadingMore,
  failed,
  onRetry,
  onTop,
  onClose,
}: {
  index: number;
  hasMore: boolean;
  loadingMore: boolean;
  failed: boolean;
  onRetry: () => void;
  onTop: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section data-slide-index={index} className="flex h-full snap-start snap-always items-center justify-center px-4">
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
            <Button onClick={onClose}>
              <X size={16} aria-hidden />
              {t("focusFeed.close")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
