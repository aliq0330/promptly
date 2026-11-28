"use client";

import { useSyncExternalStore } from "react";
import { getMediaSound, getServerMediaSound, isAudible, soundState, subscribeMediaSound, type SoundState } from "@/lib/media-sound";

/** The site-wide video / audio sound preference (`lib/media-sound.ts`): `audible` = chosen and allowed by the browser, `state` drives the sound buttons. */
export function useMediaSound(): { soundOn: boolean; audible: boolean; state: SoundState } {
  const snapshot = useSyncExternalStore(subscribeMediaSound, getMediaSound, getServerMediaSound);
  return { soundOn: snapshot.soundOn, audible: isAudible(snapshot), state: soundState(snapshot.soundOn, snapshot.unlocked) };
}
