/**
 * Görüşme sırasında ekranın uyumasını engeller (docs/history/450-*): Screen Wake Lock API. Desteklenmiyorsa ya da reddedilirse sessizce
 * hiçbir şey yapmaz (arama çalışır). Sekme gizlenince tarayıcı kilidi bırakır; görünür olunca yeniden alınır. Dönen fonksiyon kilidi bırakır.
 */
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?(type: "release", listener: () => void): void;
}

export function keepScreenAwake(): () => void {
  if (typeof navigator === "undefined" || typeof document === "undefined") return () => {};
  const api = (navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
  if (!api) return () => {};
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  const acquire = () => {
    if (stopped || document.visibilityState !== "visible") return;
    api.request("screen").then(
      (lock) => {
        if (stopped) {
          void lock.release().catch(() => undefined);
          return;
        }
        sentinel = lock;
        // Sistem kilidi kendisi bırakırsa (sekme gizlendi) görünür olunca yeniden alınabilsin.
        lock.addEventListener?.("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      },
      () => undefined,
    );
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && !sentinel) acquire();
  };
  document.addEventListener("visibilitychange", onVisible);
  acquire();
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    const lock = sentinel;
    sentinel = null;
    if (lock) void lock.release().catch(() => undefined);
  };
}
