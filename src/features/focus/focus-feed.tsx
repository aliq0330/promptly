"use client";

import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown } from "@/components/icons/chevron-down";
import { ChevronLeft } from "@/components/icons/chevron-left";
import { ChevronRight } from "@/components/icons/chevron-right";
import { ChevronUp } from "@/components/icons/chevron-up";
import { Focus } from "@/components/icons/focus";
import { Images } from "@/components/icons/images";
import { Inbox } from "@/components/icons/inbox";
import { MoreVertical } from "@/components/icons/more-vertical";
import { UserCheck } from "@/components/icons/user-check";
import { Volume2 } from "@/components/icons/volume-2";
import { VolumeX } from "@/components/icons/volume-x";
import { X } from "@/components/icons/x";
import { AlertCircle } from "@/components/icons/alert-circle";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useStorageSrc } from "@/components/ui/storage-media";
import { holdDarkMode } from "@/components/theme/theme-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { feedItemKey } from "@/features/feed/types";
import { useFeedPages } from "@/features/feed/use-feed-pages";
import { type ContentTypeId } from "@/lib/content-taxonomy";
import { FOCUS_CHANNELS, focusFeedCover, focusFeedImages, focusFeedIsNear, focusFeedLayout, focusFeedShouldLoadMore, focusFeedShown, focusFeedStartIndex, type FocusChannel } from "@/lib/focus-feed";
import { focusActiveIndex, focusKeyAction, focusResultStep, focusSheetStep, type FocusSheetState, type FocusTabId } from "@/lib/focus-sheet";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePrefersReducedMotion } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { isPostItem, type PostFeedItem } from "@/features/feed/types";
import { FocusPanelContext, FocusPlaybackContext, HIDE_WHILE_FULL, type FocusPanelApi } from "./focus-context";
import { FocusFillProvider, usePromptFill } from "./focus-fill";
import { FocusFillPicker } from "./focus-fill-picker";
import { FocusFilterMenu, type FocusTab } from "./focus-filter-menu";
import { FocusPostSheet, FocusSidePanel } from "./focus-post-card";
import { FocusFeedSlide } from "./focus-scene";

/**
 * Odak (`/focus`, docs/history/199-*, 435-*) — everyone's public posts, one per screen, full screen (the header, sidebar and bottom nav
 * hide while it is open, like the story viewer). Always on a dark stage (the site's one palette, dark mode). Data is Ana Sayfa's: `feed_page`
 * (newest, every kind; "Takip" = people you follow) through `useFeedPages`, so only published + public, non-community content appears.
 *
 * Since 435 the feed is VERTICAL (A, "Sahne"): a native `scroll-snap` column of full-screen posts the browser drives (JS only scrolls on an explicit
 * keyboard / button step); sideways a post pages through its own results. A post's card (C, "Prompt sahnesi") opens from the prompt strip at the
 * screen's foot — a bottom sheet on a phone (half → full), the persistent side panel from `md`. The post type and the source are chosen in the
 * bar's one filter menu (docs/history/245-*). The active post is the one the column rests on; only it and its neighbours mount pictures / video /
 * audio, and its picture is mirrored, blurred, into the cross-fading backdrop (desktop). The active video / audio plays (muted until the sound
 * switch is turned on), the others pause.
 */

/**
 * Last open post per feed (tab + filter), kept for the browser session: Odak is entered by a full page load (docs/history/249-*), so a
 * module variable would be gone every time — `sessionStorage` carries it (the map is the fallback when storage is blocked). Account
 * changes reload the page and storage is per tab, so another account's position can not leak in.
 */
const lastOpenFallback = new Map<string, string>();
const LAST_OPEN_PREFIX = "promptly-focus-last:";
const lastOpen = {
  get(key: string): string | undefined {
    try {
      return window.sessionStorage.getItem(LAST_OPEN_PREFIX + key) ?? lastOpenFallback.get(key);
    } catch {
      return lastOpenFallback.get(key);
    }
  },
  set(key: string, value: string) {
    lastOpenFallback.set(key, value);
    try {
      window.sessionStorage.setItem(LAST_OPEN_PREFIX + key, value);
    } catch {
      /* storage blocked — the fallback map still remembers within this page load */
    }
  },
};

const noSubscribe = () => () => undefined;

export function FocusPage() {
  // The static export prerenders this route without a document: Odak (a portal over <body>) mounts on the client only.
  const isClient = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!isClient) return null;
  return (
    <FocusFeedBoundary>
      <FocusFillProvider>
        <FocusScreen />
      </FocusFillProvider>
    </FocusFeedBoundary>
  );
}

/* ------------------------------------------------------------------------ chrome */

/**
 * Full screen while mounted: the route has no app bars at all (`AppShell` renders none on `/focus`), the page behind does not scroll, and the
 * browser's own bars (iOS status / toolbar, `theme-color`) take the stage colour instead of the page's; all restored on leave. The WHOLE site
 * goes dark while Odak is open (`holdDarkMode`) and returns to what it was on leave: iOS Safari tints its bars by the document's mode, and
 * the stage's own `.dark` scope is not enough for it (docs/history/246-*, 247-*).
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
    const releaseDark = holdDarkMode();
    return () => {
      releaseDark();
      unlockBodyScroll();
      delete html.dataset.focusOpen;
      html.style.backgroundColor = saved.html;
      document.body.style.backgroundColor = saved.body;
      if (meta && saved.meta !== null) meta.content = saved.meta;
    };
  }, []);
}

/** The dark stage (`.dark` re-scopes every token for this subtree, globals.css). `data-sheet` = the card state over a post (phone): half · full · fill. */
function Stage({ children, className, sheet }: { children: ReactNode; className?: string; sheet?: string }) {
  return (
    <div
      data-focus-feed
      data-sheet={sheet}
      className={cn("group/stage dark fixed inset-0 z-(--z-fullscreen) flex overflow-hidden bg-background text-text", className)}
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
    <Stage className="flex-col items-center justify-center px-4">
      <EmptyState scene="focusJam" icon={Focus} title={t("focusFeed.failedTitle")} action={{ label: t("common.retry"), onClick: onRetry }} />
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
/* ------------------------------------------------------------------------- menu */

function MenuSwitch({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("relative ml-auto h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-border-strong")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left]", on ? "left-[1.125rem]" : "left-0.5")} />
    </span>
  );
}

/** The bar's ⋮ menu (docs/history/238-*): "Medya" (only posts with media) and the one sound switch. */
function FocusMenu({ mediaOnly, onToggleMedia, muted, onToggleMuted }: { mediaOnly: boolean; onToggleMedia: () => void; muted: boolean; onToggleMuted: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Esc closes the menu first (captured before Odak's own Esc = close); a press outside closes it too.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const item =
    "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-label font-medium text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("focusFeed.menu")}
        title={t("focusFeed.menu")}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-on-art backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MoreVertical size={20} aria-hidden />
        {!muted && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-lg border border-border-soft bg-surface-elevated p-1.5 shadow-pop animate-pop-in">
          <button type="button" role="menuitemcheckbox" aria-checked={mediaOnly} title={t("focusFeed.mediaOnlyTitle")} onClick={onToggleMedia} className={item}>
            <Images size={20} aria-hidden className="text-text-secondary" />
            {t("focusFeed.mediaOnly")}
            <MenuSwitch on={mediaOnly} />
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={!muted} onClick={onToggleMuted} className={item}>
            {muted ? <VolumeX size={20} aria-hidden className="text-text-secondary" /> : <Volume2 size={20} aria-hidden className="text-text-secondary" />}
            {muted ? t("focusFeed.soundOn") : t("focusFeed.soundOff")}
            <MenuSwitch on={!muted} />
          </button>
        </div>
      )}
    </div>
  );
}
/* ------------------------------------------------------------------------ screen */

function FocusScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const { user, loading: authLoading } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [tab, setTab] = useState<FocusTab>("newest");
  // "Yalnız görselliler" is OFF from the start (docs/history/435-*): a post without a picture is a scene of its own (its words, brief, parameters, chain), so
  // text prompts and workflows belong in the feed; turning the switch on brings back the old "only posts with something to look at".
  const [mediaOnly, setMediaOnly] = useState(false);
  const [channel, setChannel] = useState<FocusChannel>("all");
  // Görsel · Metin · Ses · Video süzgeci (docs/history/305-*): sunucuda `p_content_type`; null = hepsi.
  const [contentType, setContentType] = useState<ContentTypeId | null>(null);
  const taxonomy = useMemo(() => ({ contentType, category: null, subcategory: null }), [contentType]);
  // Which way the last type change went (1 = further down the menu's list) — only for the entrance animation; 0 = none yet.
  const [channelShift, setChannelShift] = useState<0 | 1 | -1>(0);
  const [muted, setMuted] = useState(true);
  // The card over a post (phone): half / full + its tab; `null` = closed (the prompt strip). From `md` the card is the side panel: `panelOpen` + its tab.
  const [sheet, setSheet] = useState<{ state: FocusSheetState; tab: FocusTabId } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<FocusTabId>("main");
  // The `{variable}` of a text prompt the picker is open on (phone), keyed by post.
  const [fillEdit, setFillEdit] = useState<{ key: string; name: string } | null>(null);
  const playback = useMemo(() => ({ muted, setMuted }), [muted]);
  useFullScreenChrome();

  // "Takip" needs an account: a guest gets the login prompt and no request is made (while the session restores we wait).
  const waitingForAuth = tab === "following" && authLoading;
  const needsLogin = tab === "following" && !authLoading && !user;
  // "Yalnız görselliler" is decided by the database (docs/history/254-*): a page is full of posts with something to look at, not empty because thousands of text prompts come first.
  const feed = useFeedPages({ scope: tab === "following" ? "following" : "all", order: "newest", kind: channel, taxonomy, hasMedia: mediaOnly }, !needsLogin && !waitingForAuth);
  // Odak plays posts; a Space shared to the feed has its own page (docs/history/215-*).
  const items = useMemo(() => {
    const posts = feed.items.filter(isPostItem);
    return posts.filter((post) => focusFeedShown(post, mediaOnly));
  }, [feed.items, mediaOnly]);
  const loading = !needsLogin && (feed.loading || waitingForAuth);
  const memoryKey = `${tab}:${channel}:${contentType ?? "any"}:${mediaOnly ? "media" : "all"}`;

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

  // Scroll position that puts a slide at the top of the column (each post is one screen high).
  const slideTop = (slide: HTMLElement) => slide.offsetTop;

  // First items of a list: open on the post last open in it this session, instantly, before paint.
  useLayoutEffect(() => {
    if (loading || total === 0 || positionedFor.current === memoryKey) return;
    positionedFor.current = memoryKey;
    const start = focusFeedStartIndex(items.map(feedItemKey), lastOpen.get(memoryKey));
    setActive(start);
    const scroller = scrollerRef.current;
    const slide = scroller?.querySelector<HTMLElement>(`[data-slide-index="${start}"]`);
    if (scroller && slide) scroller.scrollTop = slideTop(slide);
    scroller?.focus({ preventScroll: true });
  }, [loading, total, memoryKey, items]);

  // A reloading list forgets the old position (a new tab / filter already differs from `positionedFor`).
  useEffect(() => {
    if (loading) positionedFor.current = null;
  }, [loading]);

  // Active post = the screen the column rests on (every post is one screen high, so the index is arithmetic).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || total === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setActive(focusActiveIndex(scroller.scrollTop, scroller.clientHeight, scroller.querySelectorAll("[data-slide-index]").length));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [total, loading]);

  const activeIndex = Math.min(active, Math.max(0, total - 1));
  const activeItem: PostFeedItem | undefined = items[activeIndex];
  const activeKey = activeItem ? feedItemKey(activeItem) : null;
  const activePrompt = activeItem?.kind === "prompt" ? activeItem.data : null;
  const activeFill = usePromptFill(activePrompt, true);
  useEffect(() => {
    if (activeKey) lastOpen.set(memoryKey, activeKey);
  }, [activeKey, memoryKey]);

  // A new post starts on its main tab; a picker / sheet of the previous post never carries over.
  const [tabFor, setTabFor] = useState<string | null>(activeKey);
  if (tabFor !== activeKey) {
    setTabFor(activeKey);
    setPanelTab("main");
  }

  // Next page a few posts before the end (Ana Sayfa's own paging). The raw count is a dependency too: with "Yalnız görselliler" a page
  // can add no slide at all, and paging must still continue.
  const { hasMore, loadingMore, failed, loadMore } = feed;
  const rawCount = feed.items.length;
  useEffect(() => {
    if (loading || needsLogin) return;
    if (focusFeedShouldLoadMore(active, total, { hasMore, loadingMore, failed })) void loadMore();
  }, [active, total, rawCount, hasMore, loadingMore, failed, loadMore, loading, needsLogin]);

  const go = useCallback(
    (index: number) => {
      const scroller = scrollerRef.current;
      const last = scroller ? scroller.querySelectorAll("[data-slide-index]").length - 1 : -1;
      const target = Math.max(0, Math.min(index, last));
      const slide = scroller?.querySelector<HTMLElement>(`[data-slide-index="${target}"]`);
      if (scroller && slide) scroller.scrollTo({ top: slideTop(slide), behavior: reducedMotion ? "auto" : "smooth" });
    },
    [reducedMotion],
  );

  // ← → page through the active post's results (a sideways row of pictures); posts without one ignore the key.
  const stepResult = useCallback(
    (direction: 1 | -1) => {
      const row = scrollerRef.current?.querySelector<HTMLElement>(`[data-slide-index="${activeIndex}"] [data-results-row]`);
      if (!row || row.clientWidth === 0) return;
      const count = Number(row.dataset.count ?? 0);
      const next = focusResultStep(Math.round(row.scrollLeft / row.clientWidth), count, direction);
      row.scrollTo({ left: next * row.clientWidth, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [activeIndex, reducedMotion],
  );
  const activeResults = activeItem && focusFeedLayout(activeItem) === "visual" ? focusFeedImages(activeItem).length : 0;

  const closeOverlays = useCallback(() => {
    setSheet(null);
    setFillEdit(null);
  }, []);

  // The post type is picked in the bar's filter menu (docs/history/245-*); each type is its own server query, so it opens at its
  // own start. Same type picked again = nothing happens.
  const pickChannel = useCallback(
    (next: FocusChannel) => {
      if (next === channel) return;
      closeOverlays();
      setChannelShift(FOCUS_CHANNELS.indexOf(next) > FOCUS_CHANNELS.indexOf(channel) ? 1 : -1);
      setChannel(next);
    },
    [channel, closeOverlays],
  );

  // What a post's face can ask of the screen: open the card on a tab, or edit one variable of the active text prompt.
  const panelApi = useMemo<FocusPanelApi>(
    () => ({
      openSheet: (_item, next = "main") => {
        void _item;
        if (isDesktop) {
          setPanelOpen(true);
          setPanelTab(next);
          return;
        }
        setFillEdit(null);
        setSheet({ state: next === "main" ? "half" : "full", tab: next });
      },
      editVariable: (item, name) => {
        if (isDesktop) {
          setPanelOpen(true);
          setPanelTab("main");
          const variable = activeFill?.variables.find((entry) => entry.name === name);
          if (variable) requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`pv-${variable.id}`)?.focus()));
          return;
        }
        setSheet(null);
        setFillEdit({ key: feedItemKey(item), name });
      },
    }),
    [isDesktop, activeFill],
  );

  const stepSheet = useCallback((direction: "up" | "down") => {
    setSheet((current) => {
      const next = focusSheetStep(current?.state ?? null, direction);
      if (!next) return null;
      return { state: next, tab: next === "half" ? "main" : (current?.tab ?? "main") };
    });
  }, []);

  // ↑ ↓ / PageUp PageDown / j k step through the posts, ← → / h l through the active post's results, P the card, C copies, Esc closes Odak.
  // Ignored while a dialog (save / share / the card itself / login) is open or a field has focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const action = focusKeyAction(event.key);
      // Arrow keys inside a tab list move between tabs (Tabs' own roving focus), not posts.
      if (!action || (target?.closest('[role="tablist"]') && event.key.startsWith("Arrow"))) return;
      const run: Record<string, () => void> = {
        next: () => go(activeIndex + 1),
        prev: () => go(activeIndex - 1),
        first: () => go(0),
        last: () => go(Number.MAX_SAFE_INTEGER),
        resultNext: () => stepResult(1),
        resultPrev: () => stepResult(-1),
        close,
        panel: () => {
          if (!activeItem) return;
          if (isDesktop) setPanelOpen((open) => !open);
          else setSheet((current) => (current ? null : { state: "half", tab: "main" }));
        },
        copy: () => {
          if (activeItem?.kind !== "prompt") return;
          const button = document.querySelector<HTMLElement>(
            isDesktop ? "[data-focus-panel] [data-focus-action-bar] button" : `[data-slide-index="${activeIndex}"] [data-focus-peek-action="copy"] button`,
          );
          button?.click();
        },
      };
      event.preventDefault();
      run[action]();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeIndex, activeItem, isDesktop, go, stepResult, close]);

  const backdropUrl = activeItem && !loading ? (focusFeedCover(activeItem)?.url ?? null) : null;
  // Albüm (docs/history/203-*): one roomy row — round 44px buttons on the ends, the feed filter between.
  const barButton =
    "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/10 text-on-art backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const phoneSheetOpen = !isDesktop && sheet !== null;
  const locked = phoneSheetOpen || (!isDesktop && fillEdit !== null);
  const stageSheet = !isDesktop ? (sheet ? sheet.state : fillEdit ? "fill" : undefined) : undefined;
  const editingFor = (item: PostFeedItem) => (fillEdit && fillEdit.key === feedItemKey(item) ? fillEdit.name : null);

  // Rendered into <body>, over the whole app (client only — see `FocusPage`).
  return createPortal(
    <Stage sheet={stageSheet}>
      <FocusPlaybackContext.Provider value={playback}>
        <FocusPanelContext.Provider value={panelApi}>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <FocusFeedBackdrop url={backdropUrl} />

            {/* Floating bar: over the posts on a phone (a soft scrim keeps it legible), the same from `md`. */}
            <div className={cn(HIDE_WHILE_FULL, "absolute inset-x-0 top-0 z-30 flex min-w-0 items-center gap-2 art-scrim-top px-3 pb-7 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:gap-3 sm:px-5")}>
              <button type="button" onClick={close} aria-label={t("focusFeed.close")} title={t("focusFeed.close")} className={cn(barButton, "w-11")}>
                <X size={20} aria-hidden />
              </button>
              <span className="hidden shrink-0 font-display text-h3 font-bold tracking-[-0.03em] text-on-art sm:inline">{t("nav.focus")}</span>
              <div className="flex min-w-0 flex-1 justify-center">
                <FocusFilterMenu
                  channel={channel}
                  tab={tab}
                  onChannel={pickChannel}
                  contentType={contentType}
                  onContentType={(next) => {
                    if (next === contentType) return;
                    closeOverlays();
                    setContentType(next);
                  }}
                  onTab={(next) => {
                    if (next === tab) return;
                    closeOverlays();
                    setTab(next);
                  }}
                />
              </div>
              {total > 0 && !loading && (
                <span
                  className="hidden shrink-0 rounded-full border border-white/15 bg-art-chip px-2.5 py-1 text-caption font-semibold tabular-nums text-on-art backdrop-blur-md md:inline"
                  aria-label={t("focusFeed.position", { current: Math.min(active + 1, total), total })}
                >
                  {String(Math.min(active + 1, total)).padStart(2, "0")}
                  <span aria-hidden className="px-1 text-on-art-faint">/</span>
                  {String(total).padStart(2, "0")}
                  {hasMore ? "+" : ""}
                </span>
              )}
              <FocusMenu
                mediaOnly={mediaOnly}
                onToggleMedia={() => {
                  closeOverlays();
                  setMediaOnly((value) => !value);
                }}
                muted={muted}
                onToggleMuted={() => setMuted(!muted)}
              />
            </div>

            <div
              key={channel}
              data-channel-area
              className={cn(
                "relative flex min-h-0 flex-1 flex-col motion-reduce:animate-none",
                channelShift === 1 && "animate-channel-down",
                channelShift === -1 && "animate-channel-up",
              )}
            >
              {loading ? (
                <div className="relative flex min-h-0 flex-1 justify-center px-6 pb-5 pt-[calc(5rem+env(safe-area-inset-top))] md:pt-[6rem]" aria-busy="true">
                  <div className="flex h-full w-full max-w-[36rem] flex-col gap-4">
                    <Skeleton className="min-h-0 flex-1 rounded-xl" />
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-7 w-5/6" />
                    <Skeleton className="h-12 w-full rounded-full" />
                  </div>
                </div>
              ) : needsLogin ? (
                <CenteredState>
                  <EmptyState scene="following" icon={UserCheck} title={t("feed.emptyFollowingTitle")} description={t("feed.emptyFollowingDescription")} action={{ label: t("common.login"), href: "/login" }} />
                </CenteredState>
              ) : failed && total === 0 && !hasMore ? (
                <CenteredState>
                  <EmptyState scene="focusJam" icon={AlertCircle} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: feed.retry }} />
                </CenteredState>
              ) : total === 0 && !hasMore ? (
                <CenteredState>
                  <EmptyState
                    scene={tab === "following" ? "following" : "shelf"}
                    icon={Inbox}
                    title={mediaOnly ? t("focusFeed.noMediaTitle") : tab === "following" ? t("feed.emptyFollowingNoPosts") : t("feed.emptyDefault")}
                    description={tab === "following" && !mediaOnly ? t("feed.emptyFollowingHint") : undefined}
                  />
                </CenteredState>
              ) : (
                <div className="relative min-h-0 flex-1">
                  <div
                    ref={scrollerRef}
                    tabIndex={-1}
                    role="region"
                    aria-label={t("focusFeed.ariaLabel")}
                    aria-describedby="focus-feed-hint"
                    aria-busy={loadingMore}
                    className={cn(
                      "scrollbar-none absolute inset-0 snap-y snap-mandatory overscroll-y-contain outline-none",
                      locked ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden",
                    )}
                  >
                    {items.map((item, index) => (
                      <FocusFeedSlide key={feedItemKey(item)} item={item} index={index} active={index === active} near={focusFeedIsNear(index, active)} editing={editingFor(item)} />
                    ))}
                    <FeedEndSlide index={total} hasMore={hasMore} loadingMore={loadingMore} failed={failed} onRetry={() => void loadMore()} onTop={() => go(0)} onClose={close} />
                  </div>

                  {/* From `md`: ‹ › page through a post's results; ↑ ↓ step between posts. */}
                  {activeResults > 1 && (
                    <div className="pointer-events-none absolute inset-x-4 top-1/2 hidden -translate-y-1/2 justify-between md:flex">
                      <StepButton label={t("focusFeed.prevResult")} onClick={() => stepResult(-1)}>
                        <ChevronLeft size={20} aria-hidden />
                      </StepButton>
                      <StepButton label={t("focusFeed.nextResult")} onClick={() => stepResult(1)}>
                        <ChevronRight size={20} aria-hidden />
                      </StepButton>
                    </div>
                  )}
                  <div className="pointer-events-none absolute bottom-5 right-4 hidden flex-col gap-2 md:flex">
                    <StepButton label={t("focusFeed.prevPost")} disabled={active <= 0} onClick={() => go(active - 1)}>
                      <ChevronUp size={20} aria-hidden />
                    </StepButton>
                    <StepButton label={t("focusFeed.nextPost")} disabled={active >= total} onClick={() => go(active + 1)}>
                      <ChevronDown size={20} aria-hidden />
                    </StepButton>
                  </div>
                  <p id="focus-feed-hint" className="sr-only">
                    {t("focusFeed.keyboardHint")}
                  </p>
                  <p aria-hidden className="pointer-events-none absolute bottom-5 left-5 hidden h-9 items-center gap-4 rounded-full bg-art-chip px-4 text-caption font-medium text-on-art-muted md:flex" data-focus-keys="">
                    <span>{t("focusFeed.keysPosts")}</span>
                    <span>{t("focusFeed.keysResults")}</span>
                    <span>{t("focusFeed.keysCopy")}</span>
                    <span>{t("focusFeed.keysPanel")}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Phone: the card over the post (half / full) or the variable picker in the strip's place. */}
            {!isDesktop && activeItem && sheet && (
              <FocusPostSheet
                key={feedItemKey(activeItem)}
                item={activeItem}
                fill={activeFill}
                state={sheet.state}
                tab={sheet.tab}
                onTab={(next) => setSheet((current) => (current ? { ...current, tab: next } : current))}
                onStep={stepSheet}
                onClose={() => setSheet(null)}
              />
            )}
            {!isDesktop && activeFill && fillEdit && fillEdit.key === activeKey && (
              <FocusFillPicker fill={activeFill} name={fillEdit.name} onClose={() => setFillEdit(null)} onPick={(name) => setFillEdit({ key: fillEdit.key, name })} />
            )}

            {isDesktop && !panelOpen && activeItem && (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                aria-label={t("focusSheet.showPanel")}
                title={t("focusSheet.showPanel")}
                className="absolute right-4 top-24 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-on-art backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
            )}
          </div>

          {isDesktop && panelOpen && activeItem && (
            <FocusSidePanel key={feedItemKey(activeItem)} item={activeItem} fill={activeFill} tab={panelTab} onTab={setPanelTab} onHide={() => setPanelOpen(false)} />
          )}
        </FocusPanelContext.Provider>
      </FocusPlaybackContext.Provider>
    </Stage>,
    document.body,
  );
}

function CenteredState({ children }: { children: ReactNode }) {
  return <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pt-16">{children}</div>;
}

function StepButton({ label, disabled = false, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-on-art backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
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
    <section data-slide-index={index} className="relative flex h-full shrink-0 snap-start snap-always items-center justify-center px-6">
      {failed ? (
        <EmptyState scene="focusJam" icon={AlertCircle} title={t("feed.loadFailed")} action={{ label: t("common.retry"), onClick: onRetry }} />
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
