import { markPostsSeen } from "@/lib/supabase/communities";
import { SEEN_DWELL_MS, SEEN_VISIBLE_RATIO, takeSeenBatch } from "@/lib/community-home";

const FLUSH_DELAY_MS = 1500;

export interface SeenTracker {
  /** Öğeyi izler; yeterince görünür kalınca kimliği "görüldü" kuyruğuna alır. Dönen işlev izlemeyi bırakır. */
  watch: (element: Element, postId: string) => () => void;
  flush: () => void;
  dispose: () => void;
}

/**
 * Gönderi görüldü izleyicisi: bir gönderinin en az %60'ı (ya da ekranın %60'ını dolduran uzun gönderi) `SEEN_DWELL_MS` boyunca görünürse
 * "görüldü" sayılır; kimlikler toplu ve aynı oturumda tekrarsız gönderilir (`mark_community_posts_seen`). Hata sessizce günlüğe yazılır —
 * görüldü bilgisi kritik değildir, akışı bozmamalıdır. Tarayıcı `IntersectionObserver` sunmuyorsa hiçbir şey işaretlenmez.
 */
export function createSeenTracker(): SeenTracker {
  const pending = new Set<string>();
  const sent = new Set<string>();
  const dwell = new Map<Element, ReturnType<typeof setTimeout>>();
  const ids = new Map<Element, string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let observer: IntersectionObserver | null = null;

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    while (pending.size > 0) {
      const batch = takeSeenBatch(pending, sent);
      if (batch.length === 0) break;
      markPostsSeen(batch).catch((err) => console.error("mark posts seen", err));
    }
  }

  function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  function ensureObserver(): IntersectionObserver | null {
    if (observer || typeof IntersectionObserver === "undefined") return observer;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const rootHeight = entry.rootBounds?.height ?? window.innerHeight;
          const visible = entry.isIntersecting && (entry.intersectionRatio >= SEEN_VISIBLE_RATIO || entry.intersectionRect.height >= rootHeight * SEEN_VISIBLE_RATIO);
          const running = dwell.get(entry.target);
          if (visible && !running) {
            dwell.set(
              entry.target,
              setTimeout(() => {
                dwell.delete(entry.target);
                const id = ids.get(entry.target);
                if (id && !sent.has(id)) {
                  pending.add(id);
                  scheduleFlush();
                }
              }, SEEN_DWELL_MS),
            );
          } else if (!visible && running) {
            clearTimeout(running);
            dwell.delete(entry.target);
          }
        }
      },
      { threshold: [0, 0.25, SEEN_VISIBLE_RATIO, 1] },
    );
    return observer;
  }

  return {
    watch(element, postId) {
      const io = ensureObserver();
      if (!io) return () => undefined;
      ids.set(element, postId);
      io.observe(element);
      return () => {
        io.unobserve(element);
        ids.delete(element);
        const running = dwell.get(element);
        if (running) clearTimeout(running);
        dwell.delete(element);
      };
    },
    flush,
    dispose() {
      flush();
      for (const timer of dwell.values()) clearTimeout(timer);
      dwell.clear();
      observer?.disconnect();
      observer = null;
    },
  };
}
