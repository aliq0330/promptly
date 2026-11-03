/**
 * "At most once per interval" gate for fire-and-forget housekeeping calls (event reminders, weekly digest) that the server
 * already de-duplicates: without a gate every full page load pays an RPC round trip to learn "nothing to do"
 * (docs/history/325-*, measured in pg_stat_statements: 3 914 `dispatch_my_event_reminders` + 1 019 `dispatch_my_weekly_digest` calls).
 *
 * The timestamp lives in `localStorage` (per key, so the caller puts the user id in it). It is a PERFORMANCE hint only: a
 * missing / blocked storage means "run", never "skip", so correctness never depends on it.
 */

export interface ThrottleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): ThrottleStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Returns true when `key` has not run within `intervalMs` and records "now" as the last run; false while the previous run is
 * still fresh. The run is recorded BEFORE the work starts, so two tabs opened together do not both run it.
 */
export function shouldRunNow(
  key: string,
  intervalMs: number,
  now: number = Date.now(),
  storage: ThrottleStorage | null = defaultStorage(),
): boolean {
  if (!storage) return true;
  try {
    const last = Number(storage.getItem(key));
    // A stored time in the future (clock changed) must not silence the call for ever.
    if (Number.isFinite(last) && last > 0 && last <= now && now - last < intervalMs) return false;
    storage.setItem(key, String(now));
  } catch {
    // Storage full / blocked: just run.
  }
  return true;
}

/** Forgets a recorded run — for a caller whose work failed and should be retried on the next load. */
export function clearThrottle(key: string, storage: ThrottleStorage & { removeItem?(key: string): void } | null = defaultStorage()): void {
  try {
    storage?.removeItem?.(key);
  } catch {
    // ignore
  }
}
