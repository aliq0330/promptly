"use client";

import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ErrorInfo, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronUp, Clock, GalleryVerticalEnd, Images, Inbox, LayoutGrid, MoreVertical, SlidersHorizontal, Sparkles, SquareTerminal, UserCheck, Volume2, VolumeX, Workflow as WorkflowIcon, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageImg, useStorageSrc } from "@/components/ui/storage-media";
import { useTheme } from "@/components/theme/theme-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { feedItemKey } from "@/features/feed/types";
import { useFeedPages } from "@/features/feed/use-feed-pages";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { FOCUS_CHANNELS, focusChannelStep, focusFeedCover, focusFeedIsNear, focusFeedShouldLoadMore, focusFeedShown, focusFeedStartIndex, type FocusChannel } from "@/lib/focus-feed";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePrefersReducedMotion } from "@/lib/motion";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { FOCUS_SLIDE_WIDTH, FocusFeedSlide, FocusInfoContext, FocusPlaybackContext, HIDE_WHILE_COMMENTS } from "./focus-feed-slide";
import { FocusInfoSheet } from "./focus-info-sheet";
import { FocusCommentsContext, FocusCommentsSheet } from "./focus-comments-sheet";
import { isPostItem, type PostFeedItem } from "@/features/feed/types";

/**
 * Odak (`/focus`, docs/history/199-*) — everyone's public posts, one per screen, scrolled vertically, full screen (the
 * header, sidebar and bottom nav hide while it is open, like the story viewer). Always on a dark stage in the visitor's
 * own palette. Data is Ana Sayfa's: `feed_page` (newest, every kind; "Takip" = people you follow) through `useFeedPages`,
 * so only published + public, non-community content appears. Like / comment / save / share / copy and the login prompts
 * are the cards' own components.
 *
 * Scrolling is native: a HORIZONTAL `scroll-snap` carousel (docs/history/238-*; mandatory, one stop per post, the neighbours'
 * edges peeking) the browser drives; JS only scrolls on an explicit keyboard / button / thumbnail step. The active post is the one nearest the carousel's centre; only it and its
 * neighbours mount pictures / video / audio, and its picture is mirrored, blurred, into the cross-fading backdrop. The
 * active video / audio plays (muted until the sound switch is turned on), the others pause.
 */

type FocusTab = "newest" | "following";

/** Scroll position that centres a slide in the carousel (the scroller is the slide's `offsetParent`). */
function slideScrollLeft(scroller: HTMLElement, slide: HTMLElement): number {
  return slide.offsetLeft + slide.offsetWidth / 2 - scroller.clientWidth / 2;
}

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

/** The two feeds as one glassy capsule (Albüm, docs/history/203-*): the chosen one lifted, with its icon. */
function FocusTabs<K extends string>({
  items,
  active,
  onChange,
  ariaLabel,
}: {
  items: { key: K; label: string; icon: LucideIcon }[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex h-11 min-w-0 shrink-0 items-center gap-0.5 rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur-md">
      {items.map((item) => {
        const selected = item.key === active;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-label font-semibold transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected ? "bg-white/20 text-white" : "text-white/70 hover:text-white",
            )}
          >
            {selected && <Icon size={15} aria-hidden />}
            {item.label}
          </button>
        );
      })}
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
  const art = slide.querySelector<HTMLElement>("[data-album-art]");
  if (!art) return null;
  const media = art instanceof HTMLImageElement || art instanceof HTMLVideoElement ? art : art.querySelector<HTMLImageElement | HTMLVideoElement>("video, img");
  // A post without a picture: its own card (text / steps / request / parameters) is what shrinks into view.
  if (!media) return art.getBoundingClientRect();
  const rect = media.getBoundingClientRect();
  const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!width || !height || !rect.width || !rect.height) return rect.width && rect.height ? rect : null;
  const fit = Math.min(rect.width / width, rect.height / height);
  const w = width * fit;
  const h = height * fit;
  return new DOMRect(rect.left + (rect.width - w) / 2, rect.top + (rect.height - h) / 2, w, h);
}

/* ----------------------------------------------------------------------- strip */

/** Thumbnails this far either side of the active post are mounted (the rest are empty room in the strip). */
const STRIP_RADIUS = 14;

function thumbIcon(item: PostFeedItem): LucideIcon {
  switch (item.kind) {
    case "prompt":
      return CONTENT_TYPE_META[item.data.contentType].icon;
    case "workflow":
      return WorkflowIcon;
    case "preset":
      return SlidersHorizontal;
    case "request":
      return Sparkles;
  }
}

/**
 * The thumbnail strip above the carousel (docs/history/238-*): every post as a small square (its cover, or its kind's icon),
 * the active one taller with a white ring and centred — the strip glides as the posts do; tapping a thumbnail goes to it.
 * Positioned with CSS only (`--ts` = one thumbnail's step), so a long feed costs only the ±14 thumbnails around the active one.
 */
function FocusStrip({ items, active, onGo }: { items: PostFeedItem[]; active: number; onGo: (index: number) => void }) {
  const { t } = useTranslation();
  const from = Math.max(0, active - STRIP_RADIUS);
  const to = Math.min(items.length - 1, active + STRIP_RADIUS);
  return (
    <div
      role="group"
      aria-label={t("focusFeed.strip")}
      data-focus-strip
      className={cn(HIDE_WHILE_COMMENTS, "pointer-events-none absolute inset-x-0 top-[calc(4.25rem+env(safe-area-inset-top))] z-20 h-[4.75rem] overflow-hidden [--ts:3rem] md:top-[4.75rem] md:h-[5.75rem] md:[--ts:4rem]")}
    >
      <div
        className="absolute left-1/2 top-2 h-full transition-transform duration-300 ease-soft motion-reduce:transition-none"
        style={{ transform: `translateX(calc(var(--ts) * ${-active} - (var(--ts) - 0.5rem) / 2))` }}
      >
        {items.slice(from, to + 1).map((item, offset) => {
          const index = from + offset;
          const cover = focusFeedCover(item);
          const Icon = thumbIcon(item);
          const on = index === active;
          return (
            <button
              key={feedItemKey(item)}
              type="button"
              tabIndex={-1}
              aria-current={on ? "true" : undefined}
              aria-label={item.data.title}
              onClick={() => onGo(index)}
              style={{ left: `calc(var(--ts) * ${index})`, width: "calc(var(--ts) - 0.5rem)" }}
              className={cn(
                "pointer-events-auto absolute top-0 overflow-hidden rounded-lg bg-white/15 transition-[height,opacity] duration-300 ease-soft motion-reduce:transition-none",
                on ? "h-[calc((var(--ts)-0.5rem)*1.35)] opacity-100 ring-2 ring-white ring-offset-2 ring-offset-transparent" : "h-[calc(var(--ts)-0.5rem)] opacity-75 hover:opacity-100",
              )}
            >
              {cover ? (
                <StorageImg src={cover.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-white/80">
                  <Icon size={18} aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </div>
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
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MoreVertical size={20} aria-hidden />
        {!muted && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-xl border border-border-soft bg-surface-elevated p-1.5 shadow-pop animate-pop-in">
          <button type="button" role="menuitemcheckbox" aria-checked={mediaOnly} title={t("focusFeed.mediaOnlyTitle")} onClick={onToggleMedia} className={item}>
            <Images size={18} aria-hidden className="text-text-secondary" />
            {t("focusFeed.mediaOnly")}
            <MenuSwitch on={mediaOnly} />
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={!muted} onClick={onToggleMuted} className={item}>
            {muted ? <VolumeX size={18} aria-hidden className="text-text-secondary" /> : <Volume2 size={18} aria-hidden className="text-text-secondary" />}
            {muted ? t("focusFeed.soundOn") : t("focusFeed.soundOff")}
            <MenuSwitch on={!muted} />
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- channels */

const CHANNEL_META: Record<FocusChannel, { icon: LucideIcon; label: TranslationKey }> = {
  all: { icon: LayoutGrid, label: "focusFeed.all" },
  prompt: { icon: SquareTerminal, label: "nav.prompts" },
  request: { icon: Sparkles, label: "nav.requestsShort" },
  workflow: { icon: WorkflowIcon, label: "nav.workflows" },
  preset: { icon: SlidersHorizontal, label: "nav.presets" },
};

/**
 * The five sections as dots down the left edge (docs/history/239-*): swiping up / down (or the wheel, ↑ ↓) moves between
 * Tümü · Prompt · İstek · Workflow · Hazır ayar, the active one a tall pill. Nearly invisible at rest (`visible` = while a
 * vertical swipe is under way and for a moment after a section change; hovering or focusing it shows it too). No words here — the name shows briefly in a
 * toast while switching (`ChannelToast`); each dot is also a button with the name for assistive tech and as a tooltip.
 */
function FocusChannelRail({ channel, onPick, visible }: { channel: FocusChannel; onPick: (channel: FocusChannel) => void; visible: boolean }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("focusFeed.channels")} className={cn(HIDE_WHILE_COMMENTS, "absolute left-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center transition-opacity duration-300 ease-soft hover:opacity-100 focus-within:opacity-100", visible ? "opacity-100" : "opacity-[0.12]", "md:left-3")}>
      {FOCUS_CHANNELS.map((key) => {
        const active = key === channel;
        const label = t(CHANNEL_META[key].label);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            aria-label={label}
            title={label}
            aria-current={active ? "true" : undefined}
            className="relative h-7 w-6 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:w-7"
          >
            {/* Fixed slot, instant size swap: a size transition left neighbours half-grown when the section changed fast. */}
            <span className={cn("absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full bg-white", active ? "h-6 w-1.5" : "h-1.5 w-1.5 opacity-45")} />
          </button>
        );
      })}
    </nav>
  );
}

/** The section's name, in the middle of the screen for a moment after a swipe. */
function ChannelToast({ channel, shown }: { channel: FocusChannel; shown: boolean }) {
  const { t } = useTranslation();
  const Icon = CHANNEL_META[channel].icon;
  return (
    <div role="status" className={cn("pointer-events-none absolute inset-x-0 top-[40%] z-30 flex justify-center transition-opacity duration-300 ease-soft", shown ? "opacity-100" : "opacity-0")}>
      <span className="inline-flex h-12 animate-pop-in items-center gap-2.5 rounded-full bg-white/95 px-5 text-body font-extrabold text-black shadow-pop">
        <Icon size={20} strokeWidth={2.25} aria-hidden />
        {t(CHANNEL_META[channel].label)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------ screen */

function FocusScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<FocusTab>("newest");
  // "Medya" is on from the start (docs/history/239-*): prompts and workflows with nothing to look at stay out until it is turned off.
  const [mediaOnly, setMediaOnly] = useState(true);
  const [channel, setChannel] = useState<FocusChannel>("all");
  // Which way the last section change went (1 = down the list) — only for the entrance animation; 0 = none yet.
  const [channelShift, setChannelShift] = useState<0 | 1 | -1>(0);
  const [toast, setToast] = useState<{ key: number; channel: FocusChannel; shown: boolean } | null>(null);
  const [muted, setMuted] = useState(true);
  // The post whose comments are open (docs/history/200-*): the sheet slides up, the post shrinks above it and keeps playing.
  // The sheet over the post (comments or info, docs/history/239-*): one at a time.
  const [panel, setPanel] = useState<{ kind: "comments" | "info"; item: PostFeedItem } | null>(null);
  const openComments = useCallback((item: PostFeedItem) => setPanel({ kind: "comments", item }), []);
  const openInfo = useCallback((item: PostFeedItem) => setPanel({ kind: "info", item }), []);
  const closePanel = useCallback(() => setPanel(null), []);
  const contentRef = useRef<HTMLDivElement>(null);
  const [shrink, setShrink] = useState<{ scale: number; x: number; y: number } | null>(null);
  const playback = useMemo(() => ({ muted, setMuted }), [muted]);
  useFullScreenChrome();

  // "Takip" needs an account: a guest gets the login prompt and no request is made (while the session restores we wait).
  const waitingForAuth = tab === "following" && authLoading;
  const needsLogin = tab === "following" && !authLoading && !user;
  const feed = useFeedPages({ scope: tab === "following" ? "following" : "all", order: "newest", kind: channel, taxonomy: EMPTY_TAXONOMY_FILTER }, !needsLogin && !waitingForAuth);
  // Odak plays posts; a Space shared to the feed has its own page (docs/history/215-*).
  const items = useMemo(() => {
    const posts = feed.items.filter(isPostItem);
    return posts.filter((post) => focusFeedShown(post, mediaOnly));
  }, [feed.items, mediaOnly]);
  const loading = !needsLogin && (feed.loading || waitingForAuth);
  const memoryKey = `${tab}:${channel}:${mediaOnly ? "media" : "all"}`;

  const close = useCallback(() => {
    // Back to where Odak was opened from; a directly opened /focus goes home.
    if (window.history.length > 1) router.back();
    else router.push("/");
  }, [router]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  // The area under the strip (posts, loading, empty and error states alike): the section gestures work on all of them.
  const areaRef = useRef<HTMLDivElement>(null);
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
    if (scroller && slide) scroller.scrollLeft = slideScrollLeft(scroller, slide);
    scroller?.focus({ preventScroll: true });
  }, [loading, total, memoryKey, items]);

  // A reloading list forgets the old position (a new tab / filter already differs from `positionedFor`).
  useEffect(() => {
    if (loading) positionedFor.current = null;
  }, [loading]);

  // Active post = the slide nearest the carousel's centre. With neighbours peeking several slides can be mostly on screen at
  // once, so (unlike a full-screen snap) "≥ 60% visible" is no rule; the slides are evenly spaced, so the index is arithmetic.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || total === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const all = scroller.querySelectorAll<HTMLElement>("[data-slide-index]");
      const first = all[0];
      if (!first) return;
      const step = all[1] ? all[1].offsetLeft - first.offsetLeft : 0;
      const index = step > 0 ? Math.round((scroller.scrollLeft - slideScrollLeft(scroller, first)) / step) : 0;
      setActive(Math.max(0, Math.min(index, all.length - 1)));
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
    if (!panel) return;
    const measure = () => {
      const content = contentRef.current;
      const sheetBox = content?.closest("[data-focus-feed]")?.querySelector<HTMLElement>("[data-focus-sheet]");
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
  }, [panel, active]);

  const go = useCallback(
    (index: number) => {
      const scroller = scrollerRef.current;
      const last = scroller ? scroller.querySelectorAll("[data-slide-index]").length - 1 : -1;
      const target = Math.max(0, Math.min(index, last));
      const slide = scroller?.querySelector<HTMLElement>(`[data-slide-index="${target}"]`);
      if (scroller && slide) scroller.scrollTo({ left: slideScrollLeft(scroller, slide), behavior: reducedMotion ? "auto" : "smooth" });
    },
    [reducedMotion],
  );

  // Sections (docs/history/239-*): up / down moves `delta` steps through Tümü · Prompt · İstek · Workflow · Hazır ayar; the
  // name shows for a moment. Each section is its own server query, so it opens at its own start.
  const lastChange = useRef(0);
  const changeChannel = useCallback(
    (delta: number) => {
      const next = focusChannelStep(channel, delta);
      if (next === channel) return;
      // One section per gesture: a fling that fires twice (or a quick second swipe) must not skip a section.
      const now = performance.now();
      if (now - lastChange.current < 350) return;
      lastChange.current = now;
      setPanel(null);
      setChannelShift(delta > 0 ? 1 : -1);
      setChannel(next);
      setToast({ key: Date.now(), channel: next, shown: true });
    },
    [channel],
  );
  const toastKey = toast?.key ?? null;
  useEffect(() => {
    if (toastKey === null) return;
    const hide = setTimeout(() => setToast((current) => (current ? { ...current, shown: false } : null)), 1100);
    const remove = setTimeout(() => setToast(null), 1450);
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, [toastKey]);

  // A touch swipe that is mostly vertical changes the section (the scroller is `touch-action: pan-x`, so the browser keeps
  // the sideways scroll and leaves vertical moves to us). Mouse drags do nothing: the wheel and ↑ ↓ are the desktop's way.
  const [swiping, setSwiping] = useState(false);
  const swipe = useRef<{ x: number; y: number; t: number; axis: "v" | "h" | null } | null>(null);
  const swipeHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" || panel) return;
      swipe.current = { x: event.clientX, y: event.clientY, t: performance.now(), axis: null };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const start = swipe.current;
      if (!start || start.axis) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
        start.axis = Math.abs(dy) > Math.abs(dx) * 1.2 ? "v" : "h";
        if (start.axis === "v") setSwiping(true);
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const start = swipe.current;
      swipe.current = null;
      setSwiping(false);
      if (!start || start.axis !== "v") return;
      const dy = event.clientY - start.y;
      const velocity = Math.abs(dy) / Math.max(1, performance.now() - start.t);
      if (Math.abs(dy) > 60 || velocity > 0.5) changeChannel(dy < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      swipe.current = null;
      setSwiping(false);
    },
  };

  // ← → / PageUp PageDown / h l / Home End step through the posts, ↑ ↓ / k j through the sections; Esc closes Odak.
  // Ignored while a dialog (save / share / prompt / login) is open or a field has focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const keys: Record<string, () => void> = {
        ArrowRight: () => go(active + 1),
        PageDown: () => go(active + 1),
        l: () => go(active + 1),
        ArrowLeft: () => go(active - 1),
        PageUp: () => go(active - 1),
        h: () => go(active - 1),
        ArrowDown: () => changeChannel(1),
        j: () => changeChannel(1),
        ArrowUp: () => changeChannel(-1),
        k: () => changeChannel(-1),
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
  }, [active, go, close, changeChannel]);

  // A mouse wheel / vertical trackpad swipe changes the section (the carousel is horizontal; a sideways swipe scrolls it
  // natively). One step per gesture: further wheel events are ignored while the previous step is still settling.
  useEffect(() => {
    const area = areaRef.current;
    if (!area || panel) return;
    let lockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || Math.abs(event.deltaY) < 4) return;
      event.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      lockedUntil = now + 500;
      changeChannel(event.deltaY > 0 ? 1 : -1);
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [changeChannel, panel]);

  const backdropUrl = activeItem && !loading ? (focusFeedCover(activeItem)?.url ?? null) : null;
  // Albüm (docs/history/203-*): one roomy row — round 44px buttons on the ends, the two feeds as a capsule between them.
  const barButton =
    "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  // Rendered into <body>, over the whole app (client only — see `FocusPage`).
  return createPortal(
    <Stage commentsOpen={Boolean(panel)}>
      <FocusPlaybackContext.Provider value={playback}>
      <FocusCommentsContext.Provider value={openComments}>
      <FocusInfoContext.Provider value={openInfo}>
        <FocusFeedBackdrop url={backdropUrl} />

        {/* Floating bar: over the posts on a phone (a soft scrim keeps it legible), the same from `md`. */}
        <div className={cn(HIDE_WHILE_COMMENTS, "md:group-data-[comments-open]/stage:right-[420px]", "absolute inset-x-0 top-0 z-30 flex min-w-0 items-center gap-2 bg-gradient-to-b from-black/50 to-transparent px-3 pb-7 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:gap-3 sm:px-5")}>
          <button type="button" onClick={close} aria-label={t("focusFeed.close")} title={t("focusFeed.close")} className={cn(barButton, "w-11")}>
            <X size={20} aria-hidden />
          </button>
          <span className="hidden shrink-0 font-display text-h3 font-bold tracking-[-0.03em] text-white sm:inline">{t("nav.focus")}</span>
          <div className="flex min-w-0 flex-1 justify-center">
            <FocusTabs
              items={[
                { key: "newest" as const, label: t("home.tabNewest"), icon: Clock },
                { key: "following" as const, label: t("nav.following"), icon: UserCheck },
              ]}
              active={tab}
              onChange={(next) => {
                closePanel();
                setTab(next);
              }}
              ariaLabel={t("feed.viewAriaLabel")}
            />
          </div>
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
          <FocusMenu
            mediaOnly={mediaOnly}
            onToggleMedia={() => {
              closePanel();
              setMediaOnly((value) => !value);
            }}
            muted={muted}
            onToggleMuted={() => setMuted(!muted)}
          />
        </div>

        {!loading && total > 0 && !needsLogin && <FocusStrip items={items} active={Math.min(active, total - 1)} onGo={go} />}

        <div
          key={channel}
          ref={areaRef}
          data-channel-area
          {...swipeHandlers}
          className={cn(
            "relative flex min-h-0 flex-1 touch-pan-x flex-col motion-reduce:animate-none",
            channelShift === 1 && "animate-channel-down",
            channelShift === -1 && "animate-channel-up",
          )}
        >
        {loading ? (
          <div className="relative flex min-h-0 flex-1 justify-center px-6 pb-5 pt-[calc(9.25rem+env(safe-area-inset-top))] md:pt-[10.75rem]" aria-busy="true">
            <div className="flex h-full w-full max-w-[36rem] flex-col gap-3">
              <Skeleton className="min-h-0 flex-1 rounded-xl" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-7 w-5/6" />
              <Skeleton className="h-12 w-full rounded-full" />
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
              "relative min-h-0 flex-1 origin-top-left transition-transform duration-300 ease-soft [--focus-safe-top:env(safe-area-inset-top)] [container-type:inline-size] motion-reduce:transition-none",
              panel && "md:mr-[420px]",
            )}
            style={panel && shrink ? { transform: `translate(${shrink.x}px, ${shrink.y}px) scale(${shrink.scale})` } : undefined}
          >
            <div
              ref={scrollerRef}
              tabIndex={-1}
              role="region"
              aria-label={t("focusFeed.ariaLabel")}
              aria-describedby="focus-feed-hint"
              aria-busy={loadingMore}
              className={cn(
                "scrollbar-none absolute inset-0 flex snap-x snap-mandatory gap-2 overscroll-x-contain px-6 outline-none md:gap-6 md:px-[max(1.5rem,calc(50cqw-18rem))]",
                panel ? "overflow-hidden" : "overflow-x-auto overflow-y-hidden",
              )}
            >
              {items.map((item, index) => (
                <FocusFeedSlide key={feedItemKey(item)} item={item} index={index} active={index === active} near={focusFeedIsNear(index, active)} />
              ))}
              <FeedEndSlide index={total} hasMore={hasMore} loadingMore={loadingMore} failed={failed} onRetry={() => void loadMore()} onTop={() => go(0)} onClose={close} />
            </div>

            <div className={cn(HIDE_WHILE_COMMENTS, "pointer-events-none absolute inset-x-4 top-1/2 hidden -translate-y-1/2 justify-between lg:flex")}>
              <StepButton label={t("focusFeed.prevPost")} disabled={active <= 0} onClick={() => go(active - 1)}>
                <ChevronLeft size={20} aria-hidden />
              </StepButton>
              <StepButton label={t("focusFeed.nextPost")} disabled={active >= total} onClick={() => go(active + 1)}>
                <ChevronRight size={20} aria-hidden />
              </StepButton>
            </div>
            <p id="focus-feed-hint" className="sr-only">
              {t("focusFeed.keyboardHint")}
            </p>
          </div>
        )}
        </div>
        {panel && (
          <>
            {/* Phone: the shrunken post above the sheet — tapping it closes the sheet (which has its own X / Esc). */}
            <button type="button" tabIndex={-1} aria-hidden onClick={closePanel} className="absolute inset-x-0 top-0 z-30 h-[35dvh] md:hidden" />
            {panel.kind === "comments" ? (
              <FocusCommentsSheet key={feedItemKey(panel.item)} item={panel.item} onClose={closePanel} />
            ) : (
              <FocusInfoSheet key={feedItemKey(panel.item)} item={panel.item} onClose={closePanel} />
            )}
          </>
        )}
        <FocusChannelRail visible={swiping || Boolean(toast?.shown)} channel={channel} onPick={(next) => changeChannel(FOCUS_CHANNELS.indexOf(next) - FOCUS_CHANNELS.indexOf(channel))} />
        {toast && <ChannelToast channel={toast.channel} shown={toast.shown} />}
      </FocusInfoContext.Provider>
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
    <section data-slide-index={index} className={cn("flex h-full shrink-0 snap-center snap-always items-center justify-center", FOCUS_SLIDE_WIDTH)}>
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
