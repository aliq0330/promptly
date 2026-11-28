"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Check } from "@/components/icons/check";
import { Maximize2 } from "@/components/icons/maximize-2";
import { Minimize2 } from "@/components/icons/minimize-2";
import { Volume2 } from "@/components/icons/volume-2";
import { VolumeX } from "@/components/icons/volume-x";
import { MediaPlayButton } from "@/components/ui/media-play-button";
import { PopoverMenu } from "@/components/ui/popover-menu";
import { StorageVideo } from "@/components/ui/storage-media";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  CONTROLS_IDLE_MS,
  clampMediaTime,
  formatMediaTime,
  formatSpeed,
  fractionFromPointer,
  playedFraction,
  PLAYBACK_SPEEDS,
  playerKeyAction,
  type PlayerKeyAction,
} from "@/lib/media-player";
import { cn } from "@/lib/utils";

const ROW_BUTTON =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-on-art outline-none transition-colors duration-200 ease-soft hover:bg-art-chip focus-visible:ring-2 focus-visible:ring-focus";

/**
 * The video player of the DETAIL pages (docs/history/484-*, the "Minimal" layout the user chose on a mockup): the picture is the
 * play / pause target, the round button in the middle is the same one the cards and Odak have (`MediaPlayButton`), the progress is
 * ONE thin line along the bottom edge (it thickens on hover / focus and is scrubbable, with a time tip), and a small row above it —
 * time · speed · sound · full screen — shows while paused, on hover / focus, or for a moment after any activity, then steps aside
 * while the video plays. The keys are decided by `lib/media-player.ts` (Space / K, ← → 5 s, J L 10 s, 0–9, M, F).
 *
 * Sound here is the visitor's own choice on THIS video (they pressed play): it starts with sound; the mute button only mutes this
 * player. The site-wide autoplay preference (`lib/media-sound.ts`) is for the posts that play by themselves, not for this page.
 * Cards and Odak keep their own button-only playback — do not use this there.
 *
 * `fill` makes the player fill a sized box (the album art box); otherwise it is as wide as its parent with the video's own shape.
 */
export function MediaPlayer({
  src,
  poster,
  label,
  fill = false,
  className,
}: {
  src: ComponentProps<typeof StorageVideo>["src"];
  poster?: ComponentProps<typeof StorageVideo>["poster"];
  label?: string;
  fill?: boolean;
  className?: string;
}) {
  const { t, language } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [tip, setTip] = useState<{ x: number; text: string } | null>(null);

  /** The line's fill follows the video straight from the element (not through React state): smooth while playing, no re-render per frame. */
  const paint = useCallback(() => {
    const video = videoRef.current;
    const bar = fillRef.current;
    if (!video || !bar) return;
    bar.style.width = `${playedFraction(video.currentTime, video.duration) * 100}%`;
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function loop() {
      paint();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, paint]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === boxRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    [],
  );

  /** Show the controls; while the video plays they go away again after a short quiet spell (kept while the pointer is on them). */
  const wake = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setIdle(false);
    if (!playingRef.current) return;
    idleTimer.current = setTimeout(() => {
      if (boxRef.current?.querySelector("[data-player-controls] :hover")) wake();
      else setIdle(true);
    }, CONTROLS_IDLE_MS);
  }, []);

  const seek = useCallback(
    (to: number) => {
      const video = videoRef.current;
      if (!video || !(video.duration > 0)) return;
      video.currentTime = clampMediaTime(to, video.duration);
      setTime(video.currentTime);
      paint();
    },
    [paint],
  );

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }

  function toggleMute() {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }

  function toggleFullscreen() {
    const box = boxRef.current;
    if (!box) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    // iPhone Safari has no element full screen: its own player takes the video over.
    const native = () => (videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
    if (box.requestFullscreen) box.requestFullscreen().catch(native);
    else native();
  }

  function setSpeed(next: number) {
    const video = videoRef.current;
    if (video) video.playbackRate = next;
    setRate(next);
  }

  function run(action: PlayerKeyAction) {
    const video = videoRef.current;
    switch (action.type) {
      case "toggle":
        return togglePlay();
      case "seek":
        return video && seek(video.currentTime + action.delta);
      case "seekTo":
        return video && seek(video.duration * action.fraction);
      case "mute":
        return toggleMute();
      case "fullscreen":
        return toggleFullscreen();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The speed menu is a portal: its keys bubble here through React but are not the player's.
    if (!event.currentTarget.contains(event.target as Node)) return;
    // A focused button keeps Space / Enter for itself.
    if ((event.key === " " || event.key === "Enter") && (event.target as HTMLElement).closest("button")) return;
    const action = playerKeyAction(event.key, event.metaKey || event.ctrlKey || event.altKey);
    if (!action) return;
    event.preventDefault();
    wake();
    run(action);
  }

  const timeAt = (event: ReactPointerEvent) => {
    const rect = scrubRef.current?.getBoundingClientRect();
    const video = videoRef.current;
    if (!rect || !video || !(video.duration > 0)) return null;
    const fraction = fractionFromPointer(event.clientX, rect.left, rect.width);
    return { fraction, seconds: fraction * video.duration, x: event.clientX - rect.left };
  };
  const showTip = (event: ReactPointerEvent) => {
    const at = timeAt(event);
    if (at) setTip({ x: at.x, text: formatMediaTime(at.seconds) });
  };

  const buttonLabelMute = muted ? t("focusFeed.soundOn") : t("focusFeed.soundOff");
  const buttonLabelFs = fullscreen ? t("mediaPlayer.exitFullscreen") : t("mediaPlayer.fullscreen");

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={label ?? t("mediaPlayer.label")}
      tabIndex={0}
      data-media-player=""
      data-playing={playing}
      data-idle={idle}
      data-fs={fullscreen}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      onPointerLeave={() => {
        if (!playingRef.current) return;
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => setIdle(true), 700);
      }}
      onFocus={wake}
      className={cn(
        "group group/player relative select-none overflow-hidden rounded-lg bg-black text-on-art outline-none focus-visible:ring-2 focus-visible:ring-focus data-[idle=true]:cursor-none",
        fill && "h-full w-full",
        className,
      )}
    >
      <StorageVideo
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        onPlay={() => {
          playingRef.current = true;
          setPlaying(true);
          wake();
        }}
        onPause={() => {
          playingRef.current = false;
          setPlaying(false);
          wake();
        }}
        onTimeUpdate={(event) => {
          setTime(event.currentTarget.currentTime);
          paint();
        }}
        onSeeked={paint}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        className={cn("block w-full object-contain", fill ? "h-full" : "mx-auto max-h-[70dvh] group-data-[fs=true]/player:h-full group-data-[fs=true]/player:max-h-none")}
      />

      {/* The whole picture is the play / pause target (double tap = full screen); the round button is its visible, labelled twin. */}
      <button type="button" tabIndex={-1} aria-hidden onClick={togglePlay} onDoubleClick={toggleFullscreen} className="absolute inset-0 z-1 cursor-pointer" />
      <MediaPlayButton playing={playing} onToggle={togglePlay} />

      <div
        aria-hidden
        className="art-scrim pointer-events-none absolute inset-x-0 bottom-0 z-1 h-24 transition-opacity duration-200 ease-soft group-data-[idle=true]/player:opacity-0"
      />

      <div data-player-controls="" className="absolute inset-x-0 bottom-0 z-2 flex flex-col">
        <div className={cn("flex items-center gap-1 px-2 transition-opacity duration-200 ease-soft", idle && "pointer-events-none opacity-0")}>
          <span className="px-2 text-caption tabular-nums text-on-art-muted" data-player-time="">
            {formatMediaTime(time)} / {formatMediaTime(duration)}
          </span>
          <span className="flex-1" />
          <PopoverMenu
            label={t("mediaPlayer.speed")}
            align="right"
            triggerClassName={cn(ROW_BUTTON, "w-auto min-w-12 px-2 text-small font-medium tabular-nums")}
            trigger={<span data-player-speed="">{formatSpeed(rate, language)}</span>}
            items={PLAYBACK_SPEEDS.map((value) => ({
              key: String(value),
              label: value === 1 ? t("mediaPlayer.speedNormal") : formatSpeed(value, language),
              icon: value === rate ? Check : undefined,
              onSelect: () => setSpeed(value),
            }))}
          />
          <button type="button" onClick={toggleMute} aria-pressed={muted} aria-label={buttonLabelMute} title={buttonLabelMute} data-player-mute="" className={ROW_BUTTON}>
            {muted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
          </button>
          <button type="button" onClick={toggleFullscreen} aria-label={buttonLabelFs} title={buttonLabelFs} data-player-fullscreen="" className={ROW_BUTTON}>
            {fullscreen ? <Minimize2 size={20} aria-hidden /> : <Maximize2 size={20} aria-hidden />}
          </button>
        </div>

        {/* The one progress line: 3 px on the bottom edge, 6 px while hovered / focused / dragged; a 36 px tall hit area. */}
        <div
          ref={scrubRef}
          role="slider"
          tabIndex={0}
          aria-label={t("mediaPlayer.seek")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatMediaTime(time)} / ${formatMediaTime(duration)}`}
          data-player-scrub=""
          data-active={scrubbing}
          onPointerDown={(event) => {
            const at = timeAt(event);
            if (!at) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setScrubbing(true);
            seek(at.seconds);
            showTip(event);
          }}
          onPointerMove={(event) => {
            showTip(event);
            if (!scrubbing) return;
            const at = timeAt(event);
            if (at) seek(at.seconds);
          }}
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
          onPointerLeave={() => !scrubbing && setTip(null)}
          className="group/scrub relative flex h-9 cursor-pointer touch-none items-end outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
        >
          {tip && (scrubbing || !idle) && (
            <span
              style={{ left: tip.x }}
              className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-xs bg-art-chip px-2 py-0.5 text-caption tabular-nums text-on-art"
            >
              {tip.text}
            </span>
          )}
          <div className="relative h-[3px] w-full bg-on-art-faint transition-[height] duration-150 ease-soft group-hover/scrub:h-1.5 group-focus-visible/scrub:h-1.5 group-data-[active=true]/scrub:h-1.5">
            <div ref={fillRef} className="absolute inset-y-0 left-0 bg-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}
