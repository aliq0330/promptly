/**
 * Rules of the detail-page video player (`components/ui/media-player.tsx`, docs/history/484-*): pure decisions — time text, seeking
 * from a pointer, which key does what — so they are unit-tested and the component only wires them to the `<video>`.
 * Cards and Odak keep their own button-only playback (`lib/card-playback.ts`); this player is for the pages where the visitor
 * chose to watch the whole thing.
 */

/** Playback speeds of the speed menu, slowest first. 1 is "Normal". */
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Seconds a ← / → press jumps, and a J / L press. */
export const SEEK_STEP = 5;
export const SEEK_STEP_LONG = 10;

/** "0:07", "1:05", "12:30", "1:02:03". Unknown / negative / infinite → "0:00". */
export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** A time inside [0, duration]; an unknown duration allows only 0. */
export function clampMediaTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || time < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(time, duration);
}

/** The point of the progress line under a pointer, 0–1 (a zero-width line gives 0). */
export function fractionFromPointer(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.max(0, Math.min(1, (clientX - left) / width));
}

/** Share of the video played, 0–1, for the line's fill. */
export function playedFraction(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, time / duration));
}

/** "1×", "1,5×" (a comma in Turkish): the speed button's text and the menu rows. */
export function formatSpeed(rate: number, language: "tr" | "en"): string {
  const text = String(rate);
  return `${language === "tr" ? text.replace(".", ",") : text}×`;
}

export type PlayerKeyAction =
  | { type: "toggle" }
  | { type: "seek"; delta: number }
  | { type: "seekTo"; fraction: number }
  | { type: "mute" }
  | { type: "fullscreen" };

/**
 * The key → action table: Space / K play-pause, ← → 5 s, J L 10 s, Home / End the ends, 0–9 jump to that tenth, M mute, F full screen.
 * Anything else (Tab, Enter on a button, modified keys) is not the player's.
 */
export function playerKeyAction(key: string, modified = false): PlayerKeyAction | null {
  if (modified) return null;
  switch (key) {
    case " ":
    case "k":
    case "K":
      return { type: "toggle" };
    case "ArrowLeft":
      return { type: "seek", delta: -SEEK_STEP };
    case "ArrowRight":
      return { type: "seek", delta: SEEK_STEP };
    case "j":
    case "J":
      return { type: "seek", delta: -SEEK_STEP_LONG };
    case "l":
    case "L":
      return { type: "seek", delta: SEEK_STEP_LONG };
    case "Home":
      return { type: "seekTo", fraction: 0 };
    case "End":
      return { type: "seekTo", fraction: 1 };
    case "m":
    case "M":
      return { type: "mute" };
    case "f":
    case "F":
      return { type: "fullscreen" };
    default:
      return /^[0-9]$/.test(key) ? { type: "seekTo", fraction: Number(key) / 10 } : null;
  }
}

/** How long the controls stay after the last pointer / key activity while the video plays. */
export const CONTROLS_IDLE_MS = 2400;
