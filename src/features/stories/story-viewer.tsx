"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flag,
  Highlighter,
  Link2,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  Send,
  ShieldOff,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { lockBodyScroll, unlockBodyScroll } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { fetchIsModerator } from "@/lib/supabase/moderation";
import { resolveMediaUrl } from "@/lib/supabase/media-url";
import {
  deleteStory,
  fetchMyReaction,
  fetchSeenStoryIds,
  fetchStoriesByIds,
  markStoryViewed,
  moderateStory,
  removeCommunityStory,
  replyToStory,
  setStoryReaction,
} from "@/lib/supabase/stories";
import { STORY_LIMITS, STORY_REACTIONS, isStoryActive, storyDisplayDuration, storyHref } from "@/lib/stories";
import { communityHref } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { absoluteUrl, cn, copyTextToClipboard, formatRelativeTime, messageHref, profileHref } from "@/lib/utils";
import type { Story } from "@/types";
import { StoryCanvas } from "./story-canvas";
import { PollSticker, QuestionSticker } from "./story-stickers";
import { AddToHighlightSheet, ConfirmSheet, OwnerActivitySheet, ReportStorySheet, ReshareSheet, type ActivityTab } from "./story-viewer-sheets";
import { useStoryViewer, type ViewerGroup } from "./story-viewer-provider";

type Sheet =
  | { kind: "activity"; tab: ActivityTab }
  | { kind: "report" }
  | { kind: "delete" }
  | { kind: "reshare" }
  | { kind: "highlight" }
  | { kind: "remove-community" }
  | { kind: "moderate" };

interface GroupState {
  status: "loading" | "ready" | "error";
  stories: Story[];
  start: number;
}

const HOLD_MS = 220;
const SWIPE_X = 70;
const CLOSE_Y = 120;
const MEDIA_TIMEOUT_MS = 15_000;

/**
 * Tam ekran hikâye görüntüleyicisi (docs/history/198-*). Sağa dokun = sonraki, sola = önceki, basılı tut = duraklat, yatay kaydır =
 * kişi değiştir, aşağı çek = kapat; klavyede ←/→, boşluk, Esc. Medya hazır olmadan, sekme arka plandayken, bir alt sayfa/menü ya da
 * yazma alanı açıkken süre İLERLEMEZ ve video oynamaz. Hikâye değişince ilerleme/yanıt/çıkartma durumu sıfırlanır (hikâyeye özel
 * parçalar hikâye kimliğiyle anahtarlanır). Görüntüleme kaydı medya gösterildiğinde ve hikâye başına bir kez gönderilir.
 */
export function StoryViewer({ groups, startGroupIndex, startStoryId, onClose }: { groups: ViewerGroup[]; startGroupIndex: number; startStoryId?: string; onClose: () => void }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { seenIds, markSeen, notifyChanged } = useStoryViewer();

  const [groupIndex, setGroupIndex] = useState(() => Math.min(Math.max(startGroupIndex, 0), groups.length - 1));
  /** Hangi gruptaki kaçıncı hikâye. Grup anahtarıyla birlikte tutulur: grup yüklenip başlangıç noktası seçilene kadar hiçbir hikâye
   * gösterilmez (yanlış hikâye bir an bile çizilip "görüldü" sayılmasın). */
  const [position, setPosition] = useState<{ key: string; index: number } | null>(null);
  const [entries, setEntries] = useState<Record<string, GroupState>>({});
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [docHidden, setDocHidden] = useState(false);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const elapsedRef = useRef(0);
  const markedRef = useRef(new Set<string>());
  /** Yüklemesi başlatılmış gruplar (yanıt gelene kadar kayıt yok = "yükleniyor"). */
  const requested = useRef(new Set<string>());

  const group = groups[groupIndex];
  const entry = group ? entries[group.key] : undefined;
  const stories = useMemo(() => entry?.stories ?? [], [entry]);
  const storyIndex = group && position?.key === group.key ? position.index : -1;
  const story: Story | null = entry?.status === "ready" && storyIndex >= 0 ? (stories[storyIndex] ?? null) : null;
  const setStoryIndex = useCallback((index: number) => {
    if (group) setPosition({ key: group.key, index });
  }, [group]);
  const isOwner = Boolean(user && story && story.authorId === user.id);
  const active = story ? isStoryActive(story.expiresAt) && story.moderationStatus === "visible" : false;
  const canInteract = Boolean(user && story && !isOwner && active);

  // --- Yükleme ------------------------------------------------------------------------------------------------------------------
  const loadGroup = useCallback(
    (index: number) => {
      const target = groups[index];
      if (!target || requested.current.has(target.key)) return;
      requested.current.add(target.key);
      Promise.all([fetchStoriesByIds(target.storyIds), user ? fetchSeenStoryIds(user.id, target.storyIds) : Promise.resolve(new Set<string>())])
        .then(([loaded, seen]) => {
          const list = target.mode === "active" ? loaded.filter((s) => isStoryActive(s.expiresAt) && s.moderationStatus === "visible") : loaded;
          let start = 0;
          if (target.mode === "active" && user) {
            const firstUnseen = list.findIndex((s) => s.authorId !== user.id && !seen.has(s.id) && !seenIds.has(s.id));
            if (firstUnseen > 0) start = firstUnseen;
          }
          setEntries((prev) => ({ ...prev, [target.key]: { status: "ready", stories: list, start } }));
        })
        .catch(() => {
          requested.current.delete(target.key);
          setEntries((prev) => ({ ...prev, [target.key]: { status: "error", stories: [], start: 0 } }));
        });
    },
    // `seenIds` bilerek yok: yalnız başlangıç noktası seçiminde okunur; her izlemede grupları yeniden yüklemesin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, user],
  );

  useEffect(() => {
    if (group && !entries[group.key]) loadGroup(groupIndex);
    // Bir sonraki kişiyi önceden hazırla (yalnız üst veri; medya ayrıca aşağıda).
    const next = groups[groupIndex + 1];
    if (next && !entries[next.key] && entry?.status === "ready") loadGroup(groupIndex + 1);
  }, [group, groupIndex, groups, entries, entry, loadGroup]);

  /** Grubun başlangıç hikâyesi: ilk açılışta istenen hikâye, yoksa (şeritte) ilk görülmemiş. */
  const startIndexOf = useCallback(
    (index: number, state: GroupState) => {
      if (index === startGroupIndex && startStoryId) {
        const found = state.stories.findIndex((s) => s.id === startStoryId);
        if (found >= 0) return found;
      }
      return state.start;
    },
    [startGroupIndex, startStoryId],
  );

  // Grup yüklenince (yanıt geldiğinde) başlangıç noktasına otur.
  useEffect(() => {
    if (!group || !entry || entry.status !== "ready" || position?.key === group.key) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sunucudan gelen grup verisine göre başlangıç hikâyesi seçilir
    setPosition({ key: group.key, index: startIndexOf(groupIndex, entry) });
  }, [group, entry, position, groupIndex, startIndexOf]);

  // --- Gezinme ------------------------------------------------------------------------------------------------------------------
  const close = useCallback(() => onClose(), [onClose]);

  const goToGroup = useCallback(
    (index: number) => {
      if (index < 0) return;
      if (index >= groups.length) {
        close();
        return;
      }
      setGroupIndex(index);
      const target = entries[groups[index].key];
      setPosition(target?.status === "ready" ? { key: groups[index].key, index: startIndexOf(index, target) } : null);
    },
    [groups, entries, close, startIndexOf],
  );

  const goNext = useCallback(() => {
    if (storyIndex < stories.length - 1) setStoryIndex(storyIndex + 1);
    else goToGroup(groupIndex + 1);
  }, [storyIndex, stories.length, goToGroup, groupIndex, setStoryIndex]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) setStoryIndex(storyIndex - 1);
    else if (groupIndex > 0) goToGroup(groupIndex - 1);
    else {
      elapsedRef.current = 0;
      if (videoRef.current) videoRef.current.currentTime = 0;
    }
  }, [storyIndex, groupIndex, goToGroup, setStoryIndex]);

  const goNextRef = useRef(goNext);
  useEffect(() => {
    goNextRef.current = goNext;
  }, [goNext]);

  // Grup yüklendi ama gösterilecek hikâye kalmadı (süresi doldu / silindi) → atla. Sunucudan gelen yanıta tepki.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- yüklenen grubun boş çıkması bir sonraki kişiye geçirir
    if (entry?.status === "ready" && entry.stories.length === 0) goToGroup(groupIndex + 1);
  }, [entry, groupIndex, goToGroup]);

  // --- Hikâye değişince sıfırla -------------------------------------------------------------------------------------------------
  const storyId = story?.id ?? null;
  useLayoutEffect(() => {
    elapsedRef.current = 0;
    if (fillRef.current) fillRef.current.style.transform = "scaleX(0)";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hikâye değişince ona özel geçici durum (medya, menü, alt sayfa) sıfırlanır
    setMediaReady(story?.kind === "text");
    setMediaFailed(false);
    setMenuOpen(false);
    setSheet(null);
    setInputFocused(false);
    setHolding(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız hikâye kimliği değişince
  }, [storyId, mediaAttempt]);

  // Medya hiç gelmezse (imza alınamadı, ağ yok) sonsuza dek beklemesin.
  useEffect(() => {
    if (!story || mediaReady || mediaFailed) return;
    const timer = window.setTimeout(() => setMediaFailed(true), MEDIA_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [story, mediaReady, mediaFailed]);

  // Görüntüleme kaydı: medya gösterildi, sahibi değil, oturum açık, bu oturumda ilk kez.
  useEffect(() => {
    if (!story || !mediaReady || !user || story.authorId === user.id || markedRef.current.has(story.id)) return;
    markedRef.current.add(story.id);
    markSeen(story.id);
    markStoryViewed(story.id).catch(() => undefined);
  }, [story, mediaReady, user, markSeen]);

  // Sonraki hikâyenin medyasını kontrollü ön yükle (yalnız zaten okuyabildiğimiz satırlar; imzayı RLS'li Storage verir).
  useEffect(() => {
    const next = stories[storyIndex + 1];
    if (!next?.mediaUrl) return;
    resolveMediaUrl(next.mediaUrl).then((signed) => {
      if (signed && next.kind === "image") new Image().src = signed;
    });
  }, [stories, storyIndex]);

  // --- Oynatma motoru -----------------------------------------------------------------------------------------------------------
  const playing = Boolean(story) && mediaReady && !mediaFailed && !paused && !holding && !inputFocused && !menuOpen && !sheet && !docHidden;
  const duration = story ? storyDisplayDuration(story) : 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!story) return;
    if (!playing) {
      video?.pause();
      return;
    }
    if (video && story.kind === "video") {
      video.muted = muted;
      video.play().catch(() => {
        // Tarayıcı sesli otomatik oynatmayı engelledi: sessiz devam et (kullanıcı ses düğmesiyle açar).
        video.muted = true;
        setMuted(true);
        void video.play().catch(() => undefined);
      });
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      let fraction: number;
      if (story.kind === "video" && video && video.duration > 0) {
        fraction = video.currentTime / video.duration;
      } else {
        elapsedRef.current += now - last;
        fraction = elapsedRef.current / duration;
      }
      last = now;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, fraction)})`;
      if (fraction >= 1 && story.kind !== "video") {
        goNextRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, story, duration, muted]);

  // Uygulama arka plana geçince dur; görünmeyen video oynamasın.
  useEffect(() => {
    const onVisibility = () => setDocHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // --- Kabuk: kaydırma kilidi, odak, klavye, görsel alan (mobil klavye) ---------------------------------------------------------
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockBodyScroll();
    rootRef.current?.focus();
    return () => {
      unlockBodyScroll();
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchIsModerator().then((value) => alive && setIsModerator(value));
    return () => {
      alive = false;
    };
  }, [user]);

  // Klavye açılınca kök, görünen alana (visualViewport) oturur: yanıt alanı klavyenin üstünde kalır.
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = rootRef.current;
    if (!viewport || !root) return;
    const sync = () => {
      root.style.height = `${viewport.height}px`;
      root.style.top = `${viewport.offsetTop}px`;
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
      if (event.key === "Escape") {
        event.preventDefault();
        if (typing) (event.target as HTMLElement).blur();
        else if (sheet) setSheet(null);
        else if (menuOpen) setMenuOpen(false);
        else close();
        return;
      }
      if (typing || sheet) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === " " && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        setPaused((value) => !value);
      } else if (event.key === "Tab") {
        // Odak görüntüleyicinin içinde kalsın.
        const root = rootRef.current;
        if (!root) return;
        const focusables = Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, textarea, [tabindex='0']"));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, menuOpen, close, goNext, goPrev]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // --- Hareketler ---------------------------------------------------------------------------------------------------------------
  const gesture = useRef<{ x: number; y: number; id: number; axis: "none" | "x" | "y"; held: boolean; timer: number } | null>(null);

  const setStageOffset = (x: number, y: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.transition = x === 0 && y === 0 ? "transform 200ms var(--ease-soft)" : "none";
    stage.style.transform = x === 0 && y === 0 ? "" : `translate3d(${x}px, ${Math.max(0, y)}px, 0) scale(${1 - Math.min(Math.max(0, y), 400) / 2000})`;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || sheet || menuOpen) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, [data-story-interactive], [data-story-link]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const timer = window.setTimeout(() => {
      if (gesture.current) {
        gesture.current.held = true;
        setHolding(true);
      }
    }, HOLD_MS);
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId, axis: "none", held: false, timer };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (g.axis === "none" && Math.hypot(dx, dy) > 10) {
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      window.clearTimeout(g.timer);
      setHolding(true);
    }
    if (g.axis === "x") setStageOffset(dx * 0.6, 0);
    else if (g.axis === "y") setStageOffset(0, dy);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    window.clearTimeout(g.timer);
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    setStageOffset(0, 0);
    setHolding(false);
    if (g.axis === "y") {
      if (dy > CLOSE_Y) close();
      return;
    }
    if (g.axis === "x") {
      if (dx < -SWIPE_X) goToGroup(groupIndex + 1);
      else if (dx > SWIPE_X) goToGroup(groupIndex - 1);
      return;
    }
    if (g.held) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX - rect.left < rect.width * 0.3) goPrev();
    else goNext();
  };

  const onPointerCancel = () => {
    const g = gesture.current;
    if (g) window.clearTimeout(g.timer);
    gesture.current = null;
    setStageOffset(0, 0);
    setHolding(false);
  };

  // --- Eylemler -----------------------------------------------------------------------------------------------------------------
  const leaveTo = (href: string) => {
    close();
    router.push(href);
  };

  const removeCurrentFromList = () => {
    if (!story || !group) return;
    setEntries((prev) => {
      const current = prev[group.key];
      if (!current) return prev;
      return { ...prev, [group.key]: { ...current, stories: current.stories.filter((s) => s.id !== story.id) } };
    });
    setStoryIndex(Math.max(0, Math.min(storyIndex, stories.length - 2)));
    notifyChanged();
  };

  if (!group) return null;
  const positionLabel = story ? t("stories.viewer.position", { current: storyIndex + 1, total: stories.length, name: story.author?.displayName ?? "" }) : "";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("stories.viewer.label")}
      tabIndex={-1}
      data-story-viewer
      className="fixed inset-x-0 top-0 z-[60] flex h-dvh flex-col bg-story-stage text-story-white focus:outline-none"
    >
      <p className="sr-only" aria-live="polite">
        {positionLabel}
      </p>

      <div className="relative flex min-h-0 flex-1 items-center justify-center sm:py-4" style={{ containerType: "size" }}>
        {/* Masaüstü: kenar okları */}
        <button
          type="button"
          onClick={goPrev}
          aria-label={t("stories.viewer.previous")}
          className="absolute left-4 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-story-white/10 text-story-white hover:bg-story-white/20 sm:flex"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label={t("stories.viewer.next")}
          className="absolute right-4 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-story-white/10 text-story-white hover:bg-story-white/20 sm:flex"
        >
          <ChevronRight size={22} aria-hidden />
        </button>

        <div ref={stageRef} className="relative sm:overflow-hidden sm:rounded-xl" style={{ width: "min(100cqw, calc(100cqh * 9 / 16))" }}>
          <div
            className="relative touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={(event) => event.preventDefault()}
          >
            {story ? (
              <StoryCanvas
                key={`${story.id}:${mediaAttempt}`}
                story={story}
                videoRef={videoRef}
                muted={muted}
                onMediaReady={() => setMediaReady(true)}
                onMediaError={() => setMediaFailed(true)}
                onVideoEnded={() => goNextRef.current()}
                onLinkOpen={close}
                renderSticker={(sticker) =>
                  sticker.kind === "poll" ? (
                    <PollSticker story={story} isOwner={isOwner} canInteract={canInteract} onOpenResults={() => setSheet({ kind: "activity", tab: "poll" })} />
                  ) : (
                    <QuestionSticker
                      story={story}
                      isOwner={isOwner}
                      canInteract={canInteract}
                      onFocusChange={setInputFocused}
                      onOpenAnswers={() => setSheet({ kind: "activity", tab: "answers" })}
                    />
                  )
                }
              />
            ) : (
              <div className="flex aspect-[9/16] w-full items-center justify-center bg-story-stage">
                {entry?.status === "error" ? (
                  <div className="space-y-3 px-6 text-center">
                    <p role="alert" className="text-small">{t("stories.error.load")}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEntries((prev) => {
                          const next = { ...prev };
                          delete next[group.key];
                          return next;
                        });
                      }}
                      className="rounded-full bg-story-white/15 px-4 py-2 text-small font-semibold">
                      {t("common.retry")}
                    </button>
                  </div>
                ) : (
                  <Loader2 size={28} className="animate-spin text-story-white/70" aria-label={t("common.loading")} />
                )}
              </div>
            )}

            {story && !mediaReady && !mediaFailed && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-story-white/70" aria-label={t("common.loading")} />
              </div>
            )}
            {story && mediaFailed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-story-scrim px-6 text-center" data-story-interactive>
                <p role="alert" className="text-small">{t("stories.error.media")}</p>
                <button type="button" onClick={() => setMediaAttempt((n) => n + 1)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-story-white/15 px-4 text-small font-semibold">
                  <RotateCcw size={14} aria-hidden /> {t("common.retry")}
                </button>
              </div>
            )}
          </div>

          {/* Üst: ilerleme + kimlik + denetimler */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-story-black/55 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex gap-1" aria-hidden>
              {(stories.length > 0 ? stories : [null]).map((item, index) => (
                <span key={item?.id ?? index} className="h-[3px] flex-1 overflow-hidden rounded-full bg-story-white/35">
                  <span
                    ref={index === storyIndex ? fillRef : undefined}
                    className="block h-full origin-left rounded-full bg-story-white"
                    style={{ transform: index < storyIndex ? "scaleX(1)" : "scaleX(0)" }}
                  />
                </span>
              ))}
            </div>
            {story && (
              <div className="pointer-events-auto mt-2.5 flex items-center gap-2">
                <button type="button" onClick={() => story.author && leaveTo(profileHref(story.author))} className="flex min-w-0 items-center gap-2 text-left">
                  <Avatar src={story.author?.avatarUrl} alt={story.author?.displayName ?? ""} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-small font-semibold">{story.author?.displayName}</span>
                    <span className="block truncate text-caption text-story-white/75">
                      {group.mode === "highlight" && group.label ? `${group.label} · ` : ""}
                      {formatRelativeTime(story.createdAt, language)}
                      {!active && isOwner && story.moderationStatus === "visible" ? ` · ${t("stories.viewer.archived")}` : ""}
                    </span>
                  </span>
                </button>
                {story.communityId && (
                  <Link
                    href={communityHref(story.communityId)}
                    onClick={close}
                    className="inline-flex min-w-0 max-w-[40%] items-center gap-1 rounded-full bg-story-white/15 px-2 py-1 text-caption font-medium"
                  >
                    <Users size={12} className="shrink-0" aria-hidden />
                    <span className="truncate">{story.communityName ?? t("stories.viewer.community")}</span>
                  </Link>
                )}
                <span className="ml-auto flex shrink-0 items-center">
                  {story.kind === "video" && (
                    <IconButton label={muted ? t("stories.viewer.unmute") : t("stories.viewer.mute")} onClick={() => setMuted((m) => !m)}>
                      {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                    </IconButton>
                  )}
                  <IconButton label={paused ? t("stories.viewer.play") : t("stories.viewer.pause")} onClick={() => setPaused((p) => !p)} pressed={paused}>
                    {paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
                  </IconButton>
                  <IconButton label={t("stories.viewer.more")} onClick={() => setMenuOpen((open) => !open)} expanded={menuOpen}>
                    <MoreVertical size={18} aria-hidden />
                  </IconButton>
                  <IconButton label={t("common.close")} onClick={close}>
                    <X size={20} aria-hidden />
                  </IconButton>
                </span>
              </div>
            )}
            {story?.moderationStatus === "removed" && (
              <p className="pointer-events-auto mt-2 rounded-md bg-danger/90 px-3 py-1.5 text-caption font-medium text-white">{t("stories.viewer.removedNotice")}</p>
            )}
          </div>

          {menuOpen && story && (
            <div className="absolute inset-0 z-20" data-story-interactive>
              <button type="button" aria-label={t("common.close")} className="absolute inset-0 cursor-default" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute right-3 top-16 w-60 overflow-hidden rounded-lg bg-surface-elevated py-1 text-text shadow-pop animate-pop-in">
                {isOwner ? (
                  <>
                    <MenuButton icon={Highlighter} label={t("stories.highlight.addTitle")} onClick={() => setSheet({ kind: "highlight" })} />
                    {!active && story.moderationStatus === "visible" && <MenuButton icon={Repeat2} label={t("stories.reshare.title")} onClick={() => setSheet({ kind: "reshare" })} />}
                    <MenuButton icon={Archive} label={t("stories.archive.open")} onClick={() => leaveTo("/stories/archive")} />
                    <MenuButton icon={Trash2} label={t("stories.delete.action")} danger onClick={() => setSheet({ kind: "delete" })} />
                  </>
                ) : (
                  <>
                    <MenuButton
                      icon={Link2}
                      label={t("stories.viewer.copyLink")}
                      onClick={async () => {
                        setMenuOpen(false);
                        if (await copyTextToClipboard(absoluteUrl(storyHref(story.id)))) setNotice(t("common.linkCopied"));
                      }}
                    />
                    {user ? (
                      <MenuButton icon={Flag} label={t("stories.report.title")} onClick={() => setSheet({ kind: "report" })} />
                    ) : null}
                    {user && story.communityId && <MenuButton icon={ShieldOff} label={t("stories.moderation.removeFromCommunity")} danger onClick={() => setSheet({ kind: "remove-community" })} />}
                  </>
                )}
                {isModerator && !isOwner && (
                  <MenuButton icon={ShieldOff} label={story.moderationStatus === "removed" ? t("stories.moderation.restore") : t("stories.moderation.remove")} danger onClick={() => setSheet({ kind: "moderate" })} />
                )}
              </div>
            </div>
          )}

          {notice && (
            <p role="status" className="pointer-events-none absolute inset-x-0 top-24 z-20 mx-auto w-fit max-w-[85%] rounded-full bg-story-black/80 px-4 py-2 text-center text-small">
              {notice}
            </p>
          )}

          {sheet && story && (
            <>
              {sheet.kind === "activity" && <OwnerActivitySheet story={story} initialTab={sheet.tab} onClose={() => setSheet(null)} onLeave={close} />}
              {sheet.kind === "report" && <ReportStorySheet storyId={story.id} onClose={() => setSheet(null)} />}
              {sheet.kind === "highlight" && (
                <AddToHighlightSheet
                  storyId={story.id}
                  onClose={() => setSheet(null)}
                  onDone={(message) => {
                    setSheet(null);
                    setNotice(message);
                    notifyChanged();
                  }}
                />
              )}
              {sheet.kind === "reshare" && (
                <ReshareSheet
                  story={story}
                  onClose={() => setSheet(null)}
                  onDone={() => {
                    setSheet(null);
                    setNotice(t("stories.reshare.done"));
                    notifyChanged();
                  }}
                />
              )}
              {sheet.kind === "delete" && (
                <ConfirmSheet
                  title={t("stories.delete.title")}
                  body={t("stories.delete.body")}
                  confirmLabel={t("stories.delete.action")}
                  onClose={() => setSheet(null)}
                  onConfirm={async () => {
                    await deleteStory(story.id);
                    if (stories.length <= 1) {
                      notifyChanged();
                      close();
                    } else removeCurrentFromList();
                  }}
                />
              )}
              {sheet.kind === "remove-community" && (
                <ConfirmSheet
                  title={t("stories.moderation.removeFromCommunity")}
                  body={t("stories.moderation.removeFromCommunityBody")}
                  confirmLabel={t("stories.moderation.removeShort")}
                  onClose={() => setSheet(null)}
                  onConfirm={async () => {
                    await removeCommunityStory(story.id);
                    setSheet(null);
                    removeCurrentFromList();
                    setNotice(t("stories.moderation.removed"));
                  }}
                />
              )}
              {sheet.kind === "moderate" && (
                <ConfirmSheet
                  title={story.moderationStatus === "removed" ? t("stories.moderation.restore") : t("stories.moderation.remove")}
                  body={t("stories.moderation.siteBody")}
                  confirmLabel={story.moderationStatus === "removed" ? t("stories.moderation.restore") : t("stories.moderation.removeShort")}
                  onClose={() => setSheet(null)}
                  onConfirm={async () => {
                    await moderateStory(story.id, story.moderationStatus !== "removed");
                    setSheet(null);
                    removeCurrentFromList();
                    setNotice(t("stories.moderation.done"));
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Alt: yanıt + tepki (izleyen) ya da etkinlik (sahip) */}
      {story && (
        <div key={story.id} className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {isOwner ? (
            <div className="mx-auto flex max-w-md items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSheet({ kind: "activity", tab: "viewers" })}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-small font-semibold hover:bg-story-white/10"
              >
                <Eye size={18} aria-hidden /> {t("stories.viewers.button", { count: story.viewerCount })}
                {story.reactionCount > 0 && <span className="text-story-white/70">· {t("stories.viewers.reactions", { count: story.reactionCount })}</span>}
              </button>
              <button type="button" onClick={() => setSheet({ kind: "highlight" })} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-small font-semibold hover:bg-story-white/10">
                <Highlighter size={17} aria-hidden /> {t("stories.highlight.short")}
              </button>
            </div>
          ) : canInteract ? (
            <ReplyBar
              story={story}
              onFocusChange={setInputFocused}
              onSent={() => setNotice(t("stories.reply.sent"))}
              openConversation={(conversationId) => leaveTo(messageHref({ id: conversationId }))}
            />
          ) : !user && active ? (
            <button
              type="button"
              onClick={() => {
                close();
                requireAuth("comment");
              }}
              className="mx-auto flex min-h-11 w-full max-w-md items-center justify-center rounded-full border border-story-white/40 px-4 text-small"
            >
              {t("stories.reply.signIn")}
            </button>
          ) : !active ? (
            <p className="mx-auto max-w-md text-center text-caption text-story-white/60">{t("stories.viewer.expiredNoReplies")}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children, pressed, expanded }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean; expanded?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      className="flex h-10 w-10 items-center justify-center rounded-full text-story-white hover:bg-story-white/15"
    >
      {children}
    </button>
  );
}

function MenuButton({ icon: Icon, label, onClick, danger }: { icon: typeof Flag; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn("flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-small hover:bg-surface-soft", danger ? "text-danger" : "text-text")}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}

/** Özel yanıt + hızlı tepkiler. Yanıt mevcut mesajlaşmaya gider (herkese açık yorum değildir); tepki tek, değiştirilebilir, kaldırılabilir. */
function ReplyBar({
  story,
  onFocusChange,
  onSent,
  openConversation,
}: {
  story: Story;
  onFocusChange: (focused: boolean) => void;
  onSent: () => void;
  openConversation: (conversationId: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastConversation, setLastConversation] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchMyReaction(story.id, user.id).then((value) => alive && setReaction(value));
    return () => {
      alive = false;
    };
  }, [story.id, user]);

  async function react(emoji: string) {
    const next = reaction === emoji ? null : emoji;
    const previous = reaction;
    setReaction(next);
    setError(null);
    try {
      await setStoryReaction(story.id, next);
    } catch (err) {
      setReaction(previous);
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const conversationId = await replyToStory(story.id, body);
      setText("");
      setLastConversation(conversationId);
      onSent();
      (document.activeElement as HTMLElement | null)?.blur();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("stories.error.generic"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-2">
      <div className="flex justify-between gap-1" role="group" aria-label={t("stories.reactions.label")}>
        {STORY_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-pressed={reaction === emoji}
            aria-label={reaction === emoji ? t("stories.reactions.remove", { emoji }) : t("stories.reactions.add", { emoji })}
            onClick={() => void react(emoji)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform duration-200 ease-soft active:scale-90",
              reaction === emoji ? "bg-story-white/25 ring-2 ring-story-white/70" : "hover:bg-story-white/10",
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={text}
          maxLength={STORY_LIMITS.replyMax}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder={t("stories.reply.placeholder", { name: story.author?.displayName ?? "" })}
          aria-label={t("stories.reply.label")}
          className="min-h-11 min-w-0 flex-1 rounded-full border border-story-white/40 bg-transparent px-4 text-small text-story-white placeholder:text-story-white/60 focus:border-story-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label={t("stories.reply.send")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-story-white text-story-black disabled:opacity-40"
        >
          {sending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Send size={17} aria-hidden />}
        </button>
      </form>
      <p className="min-h-4 text-center text-caption text-story-white/75" aria-live="polite">
        {error ? (
          <span role="alert">{error}</span>
        ) : lastConversation ? (
          <button type="button" className="underline underline-offset-2" onClick={() => openConversation(lastConversation)}>
            {t("stories.reply.openChat")}
          </button>
        ) : null}
      </p>
    </div>
  );
}
