"use client";

import { useEffect, useRef, useState } from "react";
import { StorageAppearanceImage, StorageAudio, StorageVideo } from "@/components/ui/storage-media";
import { MediaPlayButton } from "@/components/ui/media-play-button";
import { autoplayAllowed, pinPlaybackCard } from "@/lib/card-playback";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { useInViewOnce, usePromptOutput } from "@/features/focus/use-focus-data";
import { FRAME_CLASS, SIZES } from "./multi-image-output-options";
import { useCardAutoplay } from "./use-card-autoplay";
import type { Prompt, PromptMedia } from "@/types";

/**
 * The picture of a video / audio post card that PLAYS: the author's uploaded output (the detail page's rule — `usePromptOutput`,
 * looked up only once the card nears the viewport) plays by itself — a video silent and looping, an audio with its sound — while
 * this card is the one most in view (only one card plays at a time, see `lib/card-playback.ts`). The cover stays underneath until
 * the first frame; the round button in the middle plays / pauses (its tap never opens the post); there is no progress bar.
 * Browsers may refuse sound without a prior tap: an audio card then waits on its button. Reduced-motion / data-saver visitors get
 * the button only. Without an output the card is just the cover, as before.
 */
export function PlayableCardArt({ prompt, poster }: { prompt: Prompt; poster: PromptMedia }) {
  const isVideo = prompt.contentType === "video";
  const [boxRef, near] = useInViewOnce<HTMLElement>("400px");
  const { data: output } = usePromptOutput(prompt, near);
  const hasOutput = Boolean(output?.mediaUrl);
  const { id, active } = useCardAutoplay(boxRef, near && hasOutput);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const manual = useRef(false);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  // A signed (private) file mounts its element a moment after the output is known: the player is ready once its metadata is in.
  const [ready, setReady] = useState(false);
  const element = () => (isVideo ? videoRef.current : audioRef.current);

  // The card in turn plays; every other one pauses (and forgets a pause / play the visitor asked for by hand).
  useEffect(() => {
    const media = isVideo ? videoRef.current : audioRef.current;
    if (!media) return;
    if (!active) {
      manual.current = false;
      userPaused.current = false;
      media.pause();
      return;
    }
    if (userPaused.current || (!manual.current && !autoplayAllowed())) return;
    media.muted = isVideo;
    void media.play().catch(() => undefined);
  }, [active, ready, isVideo]);

  function toggle() {
    const media = element();
    if (!media) return;
    if (media.paused) {
      userPaused.current = false;
      manual.current = true;
      media.muted = isVideo;
      pinPlaybackCard(id);
      void media.play().catch(() => undefined);
    } else {
      userPaused.current = true;
      media.pause();
    }
  }

  const events = { onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onLoadedMetadata: () => setReady(true) };

  return (
    <figure ref={boxRef} className={FRAME_CLASS} style={{ aspectRatio: clampedAspectRatio(poster.width, poster.height) }}>
      <StorageAppearanceImage src={poster.url} alt={poster.alt} color={poster.color} placeholder={poster.placeholder} sizes={SIZES} className="object-cover" />
      {near && isVideo && output?.mediaUrl && (
        <StorageVideo
          ref={videoRef}
          src={output.mediaUrl}
          poster={poster.url}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          {...events}
        />
      )}
      {near && !isVideo && output?.mediaUrl && <StorageAudio ref={audioRef} src={output.mediaUrl} loop preload="metadata" {...events} />}
      {near && hasOutput && <MediaPlayButton playing={playing} onToggle={toggle} className="h-14 w-14" />}
    </figure>
  );
}
