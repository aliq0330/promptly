"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { ImageOff } from "@/components/icons/image-off";
import { Music } from "@/components/icons/music";
import { MediaPlayButton } from "@/components/ui/media-play-button";
import { StorageAudio, StorageImg, StorageVideo } from "@/components/ui/storage-media";
import type { FocusFeedCover } from "@/lib/focus-feed";
import { cn } from "@/lib/utils";
import type { Prompt } from "@/types";
import { FocusPlaybackContext } from "./focus-context";
import { usePromptOutput } from "./use-focus-data";

/**
 * The picture of an image-first slide: shimmer while it loads, a quiet icon if it can't be read, mounted only near the active
 * slide. On a phone the whole picture is shown (`contain`) over the page's blurred copy of it; in the desktop card it fills.
 */
export function SlideImage({ cover, active, near }: { cover: FocusFeedCover; active: boolean; near: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "broken">("loading");
  return (
    <div className="absolute inset-0 overflow-hidden md:bg-surface-soft">
      {state === "loading" && <div aria-hidden className="skeleton-shimmer absolute inset-0 opacity-40 md:opacity-100" />}
      {state === "broken" && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center text-text-muted">
          <ImageOff size={36} />
        </div>
      )}
      {near && (
        <StorageImg
          src={cover.url}
          alt={cover.alt}
          loading={active ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={active ? "high" : "auto"}
          onLoad={() => setState("loaded")}
          onError={() => setState("broken")}
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-[transform,opacity] duration-[1200ms] ease-soft motion-reduce:transition-none md:object-cover",
            state === "loaded" ? "opacity-100" : "opacity-0",
            active && "md:scale-[1.03] motion-reduce:scale-100",
          )}
        />
      )}
    </div>
  );
}

/**
 * A video / audio prompt's output — the AUTHOR's uploaded result (`usePromptOutput`, the detail page's rule), looked up only
 * near view. The active post plays by itself (video: muted unless sound is on; audio: with its sound, if the browser allows it —
 * else it waits on its button), the others pause; tapping toggles. The round play / pause button is the one the post cards have;
 * there is no progress bar. Without an output it is the poster (or nothing — the slide then shows the prompt's words).
 */
export function PlayableMedia({ prompt, cover, active, near }: { prompt: Prompt; cover: FocusFeedCover | null; active: boolean; near: boolean }) {
  const { muted, setMuted } = useContext(FocusPlaybackContext);
  const { data: output, loading } = usePromptOutput(prompt, near);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  // A signed (private) file mounts its element a moment after the output is known: the player is ready once its metadata is in.
  const [ready, setReady] = useState(false);
  const kind = output?.mediaUrl ? output.mediaType : null;
  const element = () => (kind === "video" ? videoRef.current : kind === "audio" ? audioRef.current : null);
  // The effects below read the sound switch without re-running when it flips (an audio post must not fight a switch turned off by hand).
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // The active post plays by itself, the others pause. A video starts silent unless the sound switch is on; an audio post
  // starts with its sound — and, once it has, the switch turns on (the browser may refuse sound before a tap: it then waits on its button).
  useEffect(() => {
    const media = kind === "video" ? videoRef.current : kind === "audio" ? audioRef.current : null;
    if (!media) return;
    if (!active) {
      media.pause();
      return;
    }
    if (kind === "video") {
      media.muted = mutedRef.current;
      media.play().catch(() => {
        // Sound needs a gesture on this browser: fall back to a silent video.
        if (!media.muted) setMuted(true);
      });
    } else {
      media.muted = false;
      media.play().then(() => setMuted(false), () => undefined);
    }
  }, [active, ready, kind, setMuted]);

  // The sound switch: a video follows it through its `muted` prop; turning sound off silences an audio post (its button brings it back).
  useEffect(() => {
    const media = audioRef.current;
    if (muted && media && !media.paused) media.pause();
  }, [muted, ready]);

  function toggle() {
    const media = element();
    if (!media) return;
    if (media.paused) {
      // A tap is a gesture: an audio post may now play with sound.
      if (kind === "audio" && muted) setMuted(false);
      void media.play().catch(() => undefined);
    } else media.pause();
  }

  const events = { onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onLoadedMetadata: () => setReady(true) };

  return (
    <>
      {cover ? <SlideImage cover={cover} active={active} near={near} /> : !kind && <div aria-hidden className="absolute inset-0 bg-surface-soft" />}
      {near && kind === "video" && output?.mediaUrl && (
        <StorageVideo
          ref={videoRef}
          src={output.mediaUrl}
          poster={cover?.url}
          muted={muted}
          loop
          playsInline
          preload={active ? "auto" : "metadata"}
          className="absolute inset-0 z-1 h-full w-full object-contain"
          {...events}
        />
      )}
      {near && kind === "audio" && output?.mediaUrl && (
        <>
          {!cover && (
            <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-primary-soft">
              <Music size={72} className="text-primary-text/60" />
            </div>
          )}
          <StorageAudio ref={audioRef} src={output.mediaUrl} loop preload={active ? "auto" : "metadata"} {...events} />
        </>
      )}
      {kind && (
        <>
          {/* The whole picture is the play / pause target; the round button (the same one the post cards have) is its visible, labelled twin. No progress bar. */}
          <button type="button" tabIndex={-1} aria-hidden onClick={toggle} className="absolute inset-0 z-2 cursor-pointer" />
          <MediaPlayButton playing={playing} onToggle={toggle} />
        </>
      )}
      {loading && !cover && <div aria-hidden className="skeleton-shimmer absolute inset-0 opacity-40" />}
    </>
  );
}

/** One of a post's results as a full-bleed picture: shimmer while it loads, a quiet icon if it can't be read; mounted only near the active post. */
function ResultImage({ cover, priority, near }: { cover: FocusFeedCover; priority: boolean; near: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "broken">("loading");
  return (
    <div className="relative h-full w-full shrink-0 snap-center snap-always overflow-hidden" data-result-image="">
      {state === "loading" && <div aria-hidden className="skeleton-shimmer absolute inset-0 opacity-40" />}
      {state === "broken" && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center text-on-art-faint">
          <ImageOff size={36} />
        </div>
      )}
      {near && (
        <StorageImg
          src={cover.url}
          alt={cover.alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setState("loaded")}
          onError={() => setState("broken")}
          className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-soft motion-reduce:transition-none", state === "loaded" ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

/**
 * A post's results (docs/history/436-*): one full-bleed picture per result in a sideways scroll-snap row — a swipe (or ← →) pages through them,
 * the vertical swipe stays the feed's. `onIndex` reports the result in view for the "1/4 sonuç" chip.
 */
export function ResultsRow({ covers, active, near, onIndex }: { covers: FocusFeedCover[]; active: boolean; near: boolean; onIndex: (index: number) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      onIndex(row.clientWidth > 0 ? Math.max(0, Math.min(Math.round(row.scrollLeft / row.clientWidth), covers.length - 1)) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    row.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      row.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [covers.length, onIndex]);
  return (
    <div
      ref={rowRef}
      data-results-row=""
      data-count={covers.length}
      className="scrollbar-none absolute inset-0 flex touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
    >
      {covers.map((cover, index) => (
        <ResultImage key={`${index}:${cover.url}`} cover={cover} priority={active && index === 0} near={near && (index === 0 || active)} />
      ))}
    </div>
  );
}
