/**
 * Site-wide sound preference for videos and audio posts (docs/history/483-*): ONE switch, kept on this device
 * (`localStorage`, never on the account), shared by the post cards, Odak and every audio post. Off by default: videos start
 * silent (browsers only autoplay silently) and an audio post waits on its button. Turning it on in one place turns it on
 * everywhere; turning it off silences everything.
 *
 * Browsers refuse sound until the visitor has tapped something on THIS visit, so the preference alone is not enough:
 * `unlocked` tells whether a tap has happened (`navigator.userActivation` at load, then any click). "On but not unlocked"
 * is the `pending` state: media stays silent, the button shows what will happen, and the first tap brings the sound.
 *
 * The decision rules are pure functions (unit-tested); the store takes its storage and starting `unlocked` as arguments so
 * a test can drive it without a browser. `lib/use-media-sound.ts` is the React side.
 */

export const MEDIA_SOUND_KEY = "promptly-media-sound";

export type SoundState = "off" | "pending" | "on";

export interface MediaSoundSnapshot {
  /** The visitor's choice (kept on the device). */
  soundOn: boolean;
  /** A tap has happened on this visit: the browser now allows sound. */
  unlocked: boolean;
}

export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseStoredSound(raw: string | null | undefined): boolean {
  return raw === "on";
}

export function soundState(soundOn: boolean, unlocked: boolean): SoundState {
  if (!soundOn) return "off";
  return unlocked ? "on" : "pending";
}

/** Sound can actually be heard: chosen AND the browser allows it. Media plays with sound only then. */
export function isAudible(snapshot: MediaSoundSnapshot): boolean {
  return snapshot.soundOn && snapshot.unlocked;
}

/**
 * What a press on a sound button does. While the choice is "on" but the browser is still waiting for a tap, that first press
 * only brings the sound (it must not switch the preference off — the visitor wants to hear it); otherwise it flips the choice.
 */
export function nextSound(snapshot: MediaSoundSnapshot): { snapshot: MediaSoundSnapshot; result: "on" | "off" | "unlocked" } {
  if (snapshot.soundOn && !snapshot.unlocked) return { snapshot: { soundOn: true, unlocked: true }, result: "unlocked" };
  const soundOn = !snapshot.soundOn;
  return { snapshot: { soundOn, unlocked: true }, result: soundOn ? "on" : "off" };
}

export interface MediaSoundStore {
  get(): MediaSoundSnapshot;
  subscribe(listener: () => void): () => void;
  /** A press on a sound button (see `nextSound`). */
  toggle(): "on" | "off" | "unlocked";
  /** Turn sound on from a gesture (an audio post's play button). */
  enable(): void;
  markUnlocked(): void;
  /** The browser refused to play with sound although we thought it could: wait for a tap again (the choice stays). */
  reportBlocked(): void;
  /** Re-read the stored choice (another tab changed it). */
  reload(): void;
}

export function createMediaSoundStore(storage: SoundStorage | null, startsUnlocked: boolean): MediaSoundStore {
  const read = (): boolean => {
    try {
      return parseStoredSound(storage?.getItem(MEDIA_SOUND_KEY));
    } catch {
      return false;
    }
  };
  let snapshot: MediaSoundSnapshot = { soundOn: read(), unlocked: startsUnlocked };
  const listeners = new Set<() => void>();

  const commit = (next: MediaSoundSnapshot, persist: boolean) => {
    if (next.soundOn === snapshot.soundOn && next.unlocked === snapshot.unlocked) return;
    const choiceChanged = next.soundOn !== snapshot.soundOn;
    snapshot = next;
    if (persist && choiceChanged) {
      try {
        storage?.setItem(MEDIA_SOUND_KEY, next.soundOn ? "on" : "off");
      } catch {
        // Storage blocked: the choice still holds for this visit.
      }
    }
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggle() {
      const { snapshot: next, result } = nextSound(snapshot);
      commit(next, true);
      return result;
    },
    enable: () => commit({ soundOn: true, unlocked: true }, true),
    markUnlocked: () => commit({ ...snapshot, unlocked: true }, false),
    reportBlocked: () => commit({ ...snapshot, unlocked: false }, false),
    reload: () => commit({ ...snapshot, soundOn: read() }, false),
  };
}

/* ------------------------------------------------------------------ browser singleton */

const SERVER_SNAPSHOT: MediaSoundSnapshot = { soundOn: false, unlocked: false };
let singleton: MediaSoundStore | null = null;

function browserStore(): MediaSoundStore | null {
  if (typeof window === "undefined") return null;
  if (singleton) return singleton;
  let storage: SoundStorage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
  const store = createMediaSoundStore(storage, activation?.hasBeenActive === true);
  // The first click / tap of the visit lets sound play. Caught in the capture phase (a button that stops propagation, like the round
  // play button, must still count) but applied one tick later: a sound button's own handler runs during this same click and must
  // still see "pending", so its press only brings the sound instead of switching the choice off.
  document.addEventListener("click", () => setTimeout(() => store.markUnlocked(), 0), { capture: true });
  window.addEventListener("storage", (event) => {
    if (event.key === MEDIA_SOUND_KEY || event.key === null) store.reload();
  });
  singleton = store;
  return store;
}

export function getMediaSound(): MediaSoundSnapshot {
  return browserStore()?.get() ?? SERVER_SNAPSHOT;
}

export function getServerMediaSound(): MediaSoundSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribeMediaSound(listener: () => void): () => void {
  return browserStore()?.subscribe(listener) ?? (() => undefined);
}

export function toggleMediaSound(): "on" | "off" | "unlocked" {
  return browserStore()?.toggle() ?? "off";
}

export function enableMediaSound(): void {
  browserStore()?.enable();
}

export function setMediaSound(on: boolean): void {
  const store = browserStore();
  if (!store) return;
  if (on) store.enable();
  else if (store.get().soundOn) store.toggle();
}

export function reportSoundBlocked(): void {
  browserStore()?.reportBlocked();
}
