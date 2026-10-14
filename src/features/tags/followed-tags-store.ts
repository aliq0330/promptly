import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { MAX_FOLLOWED_TAGS, TagFollowLimitError, fetchFollowedTags, followTag, unfollowTag, type FollowedTag } from "@/lib/supabase/tag-follows";

interface StoreState {
  userId: string | null;
  tags: FollowedTag[];
  loaded: boolean;
}

const SIGNED_OUT: StoreState = { userId: null, tags: [], loaded: false };
let state: StoreState = SIGNED_OUT;
const listeners = new Set<() => void>();

function setState(next: StoreState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type ToggleTagResult = "followed" | "unfollowed" | "limit" | "failed";

/**
 * The viewer's followed tags, shared by every place that shows or changes tag
 * follows (tag page button, Home's "My tags" tab, the tags directory), so a
 * follow made in one is visible in the others at once. Loaded once per signed-in
 * user; `toggle` is optimistic and rolls back (reporting why) when the database
 * refuses.
 */
export function useFollowedTags() {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SIGNED_OUT);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      if (state.userId !== null) setState(SIGNED_OUT);
      return;
    }
    if (state.userId === userId) return;
    setState({ userId, tags: [], loaded: false });
    fetchFollowedTags(userId)
      .then((tags) => {
        if (state.userId === userId) setState({ userId, tags, loaded: true });
      })
      .catch((err) => {
        console.error("fetchFollowedTags", err);
        if (state.userId === userId) setState({ userId, tags: [], loaded: true });
      });
  }, [userId]);

  const toggle = useCallback(
    async (tag: FollowedTag): Promise<ToggleTagResult> => {
      if (!userId || state.userId !== userId) return "failed";
      const before = state.tags;
      const wasFollowing = before.some((entry) => entry.slug === tag.slug);
      if (!wasFollowing && before.length >= MAX_FOLLOWED_TAGS) return "limit";
      setState({ ...state, tags: wasFollowing ? before.filter((entry) => entry.slug !== tag.slug) : [tag, ...before] });
      try {
        if (wasFollowing) await unfollowTag(userId, tag.slug);
        else await followTag(userId, tag.slug);
        return wasFollowing ? "unfollowed" : "followed";
      } catch (err) {
        console.error(wasFollowing ? "unfollowTag" : "followTag", err);
        if (state.userId === userId) setState({ ...state, tags: before });
        return err instanceof TagFollowLimitError ? "limit" : "failed";
      }
    },
    [userId],
  );

  const isFollowing = useCallback((slug: string) => snapshot.tags.some((entry) => entry.slug === slug), [snapshot.tags]);

  return {
    tags: snapshot.tags,
    /** False while a signed-in viewer's list is still loading. */
    loaded: snapshot.loaded,
    canFollow: Boolean(userId),
    isFollowing,
    toggle,
  };
}
