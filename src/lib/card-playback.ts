/**
 * Listedeki video / ses kartlarının otomatik oynatılması: aynı anda YALNIZ bir kart oynar.
 *
 * `pickActiveCard` saf karar fonksiyonudur (birim testli): görünür alanda yeterince görünen kartlar arasından ekranın
 * dikey ortasına en yakın olanı seçer; kullanıcının elle başlattığı ("sabitlenen") kart hâlâ ekrandaysa o kalır.
 * Geri kalan dosya DOM'a bağlı yöneticidir: `IntersectionObserver` oranlarını izler, kaydırmada yeniden seçer ve seçileni
 * `useSyncExternalStore` ile kartlara bildirir. Yeni bir listede otomatik oynayan bir kart yazarken ikinci bir gözlemci kurma,
 * `useCardAutoplay`'i kullan.
 */

export interface PlaybackCandidate {
  id: string;
  /** Kartın görünür alanda ne kadarının göründüğü (0–1). */
  ratio: number;
  /** Kartın dikey merkezi (görünür alanın üstünden px). */
  center: number;
}

/** Bir kartın "ekranda" sayılması için en az görünen oran. */
export const MIN_VISIBLE_RATIO = 0.5;

export function pickActiveCard(candidates: PlaybackCandidate[], viewportMiddle: number, pinnedId: string | null = null): string | null {
  if (pinnedId) {
    const pinned = candidates.find((c) => c.id === pinnedId);
    if (pinned && pinned.ratio > 0) return pinned.id;
  }
  let best: PlaybackCandidate | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate.ratio < MIN_VISIBLE_RATIO) continue;
    const distance = Math.abs(candidate.center - viewportMiddle);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best ? best.id : null;
}

/* ------------------------------------------------------------------ DOM yöneticisi */

interface Entry {
  element: Element;
  ratio: number;
}

const entries = new Map<string, Entry>();
const idOfElement = new WeakMap<Element, string>();
const listeners = new Set<() => void>();
let activeId: string | null = null;
let pinnedId: string | null = null;
let observer: IntersectionObserver | null = null;
let scrollFrame = 0;
let listening = false;

function elect(): void {
  if (typeof window === "undefined") return;
  const visible = document.visibilityState === "visible";
  const candidates: PlaybackCandidate[] = [];
  if (visible) {
    for (const [id, entry] of entries) {
      const rect = entry.element.getBoundingClientRect();
      candidates.push({ id, ratio: entry.ratio, center: rect.top + rect.height / 2 });
    }
  }
  if (pinnedId && !candidates.some((c) => c.id === pinnedId && c.ratio > 0)) pinnedId = null;
  const next = pickActiveCard(candidates, window.innerHeight / 2, pinnedId);
  if (next !== activeId) {
    activeId = next;
    listeners.forEach((listener) => listener());
  }
}

function onScroll(): void {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    elect();
  });
}

function startListening(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  document.addEventListener("visibilitychange", elect);
}

function stopListening(): void {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", onScroll, { capture: true });
  window.removeEventListener("resize", onScroll);
  document.removeEventListener("visibilitychange", elect);
}

function getObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        const id = idOfElement.get(change.target);
        const entry = id ? entries.get(id) : undefined;
        if (entry) entry.ratio = change.intersectionRatio;
      }
      elect();
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  return observer;
}

export function registerPlaybackCard(id: string, element: Element): () => void {
  if (typeof IntersectionObserver === "undefined") return () => undefined;
  entries.set(id, { element, ratio: 0 });
  idOfElement.set(element, id);
  getObserver().observe(element);
  startListening();
  return () => {
    entries.delete(id);
    observer?.unobserve(element);
    if (pinnedId === id) pinnedId = null;
    if (entries.size === 0) stopListening();
    elect();
  };
}

/** Elle başlatılan kart ekranda kaldığı sürece seçili kalır (başka bir kart ortaya gelse de kesilmez). */
export function pinPlaybackCard(id: string | null): void {
  pinnedId = id;
  elect();
}

export function subscribePlayback(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isPlaybackActive(id: string): boolean {
  return activeId === id;
}

/** Hareketi azaltmayı isteyen ya da veri tasarrufundaki kullanıcıda kartlar kendiliğinden oynamaz (düğmeyle oynatılır). */
export function autoplayAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !connection?.saveData;
}
