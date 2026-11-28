"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "@/components/icons/volume-2";
import { VolumeX } from "@/components/icons/volume-x";
import { StorageAppearanceImage, StorageAudio, StorageVideo } from "@/components/ui/storage-media";
import { MediaPlayButton } from "@/components/ui/media-play-button";
import { autoplayAllowed, pinPlaybackCard } from "@/lib/card-playback";
import { enableMediaSound, reportSoundBlocked, toggleMediaSound } from "@/lib/media-sound";
import { useMediaSound } from "@/lib/use-media-sound";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { useToast } from "@/features/groups/use-toast";
import { useInViewOnce, usePromptOutput } from "@/features/focus/use-focus-data";
import { FRAME_CLASS, SIZES } from "./multi-image-output-options";
import { useCardAutoplay } from "./use-card-autoplay";
import type { Prompt, PromptMedia } from "@/types";

/**
 * The picture of a video / audio post card that PLAYS: the author's uploaded output (the detail page's rule — `usePromptOutput`,
 * looked up only once the card nears the viewport) plays by itself — a video looping — while this card is the one most in view
 * (only one card plays at a time, see `lib/card-playback.ts`). The cover stays underneath until the first frame; the round
 * button in the middle plays / pauses (its tap never opens the post); there is no progress bar.
 * SOUND follows the ONE site-wide preference (`lib/media-sound.ts`, docs/history/483-*): off by default — a video plays silent
 * and an audio card waits on its button — and the small sound button of a video card turns it on / off for every video, audio
 * post and Odak. Browsers refuse sound before a tap on this visit: the preference then shows as "pending" until the first tap.
 * Reduced-motion / data-saver visitors get the button only. Without an output the card is just the cover, as before.
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
  const { t } = useTranslation();
  const { audible, state: soundBtn } = useMediaSound();
  const { node: toastNode, show: showToast } = useToast();
  // A signed (private) file mounts its element a moment after the output is known: the player is ready once its metadata is in.
  const [ready, setReady] = useState(false);
  const element = () => (isVideo ? videoRef.current : audioRef.current);

  // The card in turn plays; every other one pauses (and forgets a pause / play the visitor asked for by hand). Sound is the site-wide
  // preference: a video follows it live, an audio card plays only while it is on (turning it off anywhere silences it).
  useEffect(() => {
    const media = isVideo ? videoRef.current : audioRef.current;
    if (!media) return;
    if (!active) {
      manual.current = false;
      userPaused.current = false;
      media.pause();
      return;
    }
    media.muted = isVideo ? !audible : false;
    if (!isVideo && !audible) {
      media.pause();
      return;
    }
    if (userPaused.current || (!manual.current && !autoplayAllowed())) return;
    // The browser may still refuse sound (no tap yet on this visit): the preference then waits for a tap, the card does not break.
    void media.play().catch(() => {
      if (!media.muted) reportSoundBlocked();
    });
  }, [active, ready, isVideo, audible]);

  function toggle() {
    const media = element();
    if (!media) return;
    if (media.paused) {
      userPaused.current = false;
      manual.current = true;
      // A tap on an audio card's button is the gesture that lets it play with sound — and that is the preference for every post.
      if (!isVideo) enableMediaSound();
      media.muted = isVideo ? !audible : false;
      pinPlaybackCard(id);
      void media.play().catch(() => undefined);
    } else {
      userPaused.current = true;
      media.pause();
    }
  }

  function onSoundPress(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const result = toggleMediaSound();
    if (result === "on") showToast(t("mediaSound.toastOn"), 2200);
    else if (result === "off") showToast(t("mediaSound.toastOff"), 2200);
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
      {near && isVideo && hasOutput && (
        <button
          type="button"
          onClick={onSoundPress}
          aria-pressed={soundBtn !== "off"}
          aria-label={soundBtn === "off" ? t("mediaSound.enable") : t("mediaSound.disable")}
          title={soundBtn === "off" ? t("mediaSound.enable") : t("mediaSound.disable")}
          data-media-sound={soundBtn}
          className={cn(
            "absolute bottom-2 right-2 z-10 inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-sm px-2.5 text-caption font-medium outline-none transition-colors duration-200 ease-soft focus-visible:ring-2 focus-visible:ring-focus",
            soundBtn === "on" ? "bg-primary text-primary-foreground" : "bg-art-chip text-on-art",
          )}
        >
          {soundBtn === "on" ? <Volume2 size={20} aria-hidden /> : <VolumeX size={20} aria-hidden />}
          {soundBtn === "pending" && <span>{t("mediaSound.pendingHint")}</span>}
        </button>
      )}
      {toastNode}
    </figure>
  );
}
