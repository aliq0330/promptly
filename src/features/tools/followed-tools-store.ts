import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { MAX_FOLLOWED_TOOLS, ToolFollowLimitError, fetchFollowedTools, followTool, unfollowTool } from "@/lib/supabase/tool-follows";

interface StoreState {
  userId: string | null;
  tools: string[];
  loaded: boolean;
}

const SIGNED_OUT: StoreState = { userId: null, tools: [], loaded: false };
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

export type ToggleToolResult = "followed" | "unfollowed" | "limit" | "failed";

/**
 * The viewer's followed AI tools (`tool_follows`, docs/history/211-*) — the tag store's twin (`useFollowedTags`): loaded once
 * per signed-in user, shared by every follow button, `toggle` optimistic with a reported rollback when the database refuses.
 */
export function useFollowedTools() {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SIGNED_OUT);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      if (state.userId !== null) setState(SIGNED_OUT);
      return;
    }
    if (state.userId === userId) return;
    setState({ userId, tools: [], loaded: false });
    fetchFollowedTools(userId)
      .then((tools) => {
        if (state.userId === userId) setState({ userId, tools, loaded: true });
      })
      .catch((err) => {
        console.error("fetchFollowedTools", err);
        if (state.userId === userId) setState({ userId, tools: [], loaded: true });
      });
  }, [userId]);

  const toggle = useCallback(
    async (toolId: string): Promise<ToggleToolResult> => {
      if (!userId || state.userId !== userId) return "failed";
      const before = state.tools;
      const wasFollowing = before.includes(toolId);
      if (!wasFollowing && before.length >= MAX_FOLLOWED_TOOLS) return "limit";
      setState({ ...state, tools: wasFollowing ? before.filter((id) => id !== toolId) : [toolId, ...before] });
      try {
        if (wasFollowing) await unfollowTool(userId, toolId);
        else await followTool(userId, toolId);
        return wasFollowing ? "unfollowed" : "followed";
      } catch (err) {
        console.error(wasFollowing ? "unfollowTool" : "followTool", err);
        if (state.userId === userId) setState({ ...state, tools: before });
        return err instanceof ToolFollowLimitError ? "limit" : "failed";
      }
    },
    [userId],
  );

  const isFollowing = useCallback((toolId: string) => snapshot.tools.includes(toolId), [snapshot.tools]);

  return {
    tools: snapshot.tools,
    /** False while a signed-in viewer's list is still loading. */
    loaded: snapshot.loaded,
    canFollow: Boolean(userId),
    isFollowing,
    toggle,
  };
}
