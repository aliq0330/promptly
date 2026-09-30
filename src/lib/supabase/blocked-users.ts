import { supabase } from "./client";

/**
 * Ids of the users the signed-in viewer has blocked — used to hide their
 * content (feeds, search, comments) everywhere outside messaging. Blocking
 * is one-sided: only the blocker stops seeing the other person's content;
 * a blocked profile itself stays reachable so it can be unblocked. Cached
 * per user for the session; `blockUser`/`unblockUser` invalidate it.
 */
let cacheUser: string | null = null;
let cacheIds: Set<string> = new Set();
let pending: Promise<Set<string>> | null = null;

export function invalidateBlockedIds() {
  cacheUser = null;
  cacheIds = new Set();
  pending = null;
}

export async function getBlockedIds(): Promise<Set<string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id ?? null;
    if (!userId) return new Set();
    if (cacheUser === userId) return cacheIds;
    if (!pending) {
      pending = (async () => {
        const { data: rows, error } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", userId);
        if (error) return new Set<string>();
        cacheUser = userId;
        cacheIds = new Set((rows ?? []).map((row) => row.blocked_id as string));
        return cacheIds;
      })().finally(() => {
        pending = null;
      });
    }
    return await pending;
  } catch {
    return new Set();
  }
}

/** Drops anything authored by a user the viewer blocked. Never throws; signed-out viewers see everything. */
export async function withoutBlocked<T>(items: T[], authorIdOf: (item: T) => string): Promise<T[]> {
  if (items.length === 0) return items;
  const blocked = await getBlockedIds();
  if (blocked.size === 0) return items;
  return items.filter((item) => !blocked.has(authorIdOf(item)));
}
