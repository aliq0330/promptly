// One animation loop for every line-art scene on the page (docs/history/373-*).
//  - Night follows the app's mode: a scene inside `.dark` (the user's dark mode, or any dark subtree) eases to night.
//  - A scene that is off screen is not drawn; the loop stops when no scene is mounted.
//  - prefers-reduced-motion: one still frame per scene, redrawn when the mode changes — time never moves.

export interface Scene {
  host: Element;
  draw(t: number, dt: number, night: number): void;
}

interface Entry extends Scene {
  visible: boolean;
  night: number;
  io: IntersectionObserver;
}

const entries = new Set<Entry>();
let raf = 0;
let prev = 0;
let clock = 0;
let modeWatch: MutationObserver | null = null;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const isDark = (host: Element) => host.closest(".dark") !== null;

function stillFrame(entry: Entry) {
  entry.night = isDark(entry.host) ? 1 : 0;
  // A fixed time, chosen so every scene shows its people mid-square rather than an empty street.
  entry.draw(3, 0, entry.night);
}

function tick(now: number) {
  const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 1 / 60;
  prev = now;
  clock += dt;
  for (const entry of entries) {
    if (!entry.visible) continue;
    const target = isDark(entry.host) ? 1 : 0;
    entry.night += (target - entry.night) * Math.min(1, dt * 1.6);
    if (Math.abs(target - entry.night) < 0.002) entry.night = target;
    entry.draw(clock, dt, entry.night);
  }
  raf = entries.size ? requestAnimationFrame(tick) : 0;
}

/** Register a scene; returns its unmount. Nothing is drawn synchronously. */
export function addScene(scene: Scene): () => void {
  const still = reducedMotion();
  const entry: Entry = {
    ...scene,
    visible: false,
    night: isDark(scene.host) ? 1 : 0,
    io: new IntersectionObserver(
      (records) => {
        for (const record of records) entry.visible = record.isIntersecting;
      },
      { rootMargin: "120px" },
    ),
  };
  entry.io.observe(scene.host);
  entries.add(entry);
  if (still) {
    requestAnimationFrame(() => entries.has(entry) && stillFrame(entry));
    if (!modeWatch) {
      // the mode class lives on <html>; a still scene redraws as day or night when it flips
      modeWatch = new MutationObserver(() => entries.forEach(stillFrame));
      modeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
  } else if (!raf) {
    prev = 0;
    raf = requestAnimationFrame(tick);
  }
  return () => {
    entries.delete(entry);
    entry.io.disconnect();
    if (!entries.size) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      modeWatch?.disconnect();
      modeWatch = null;
    }
  };
}
