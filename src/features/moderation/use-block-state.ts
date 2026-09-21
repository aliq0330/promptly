"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { blockUser, fetchIsBlockedByMe, unblockUser } from "@/lib/supabase/blocks";
import type { UserProfile } from "@/types";

/**
 * Whether the current viewer has blocked `target` — mirrors
 * `useFollowState`'s shape (Bölüm 21 Faz 3). `canBlock` is false while
 * signed out, same reason `canFollow` is: RLS requires an authenticated
 * session to write a `blocks` row.
 */
export function useBlockState(target: UserProfile) {
  const { user } = useAuth();
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to check while signed out
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchIsBlockedByMe(user.id, target.id).then((result) => {
      if (!cancelled) {
        setIsBlocked(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, target.id]);

  const toggle = useCallback(async () => {
    if (!user) return; // canBlock is false in this case — nothing to toggle

    if (isBlocked) {
      setIsBlocked(false);
      try {
        await unblockUser(user.id, target.id);
      } catch (err) {
        console.error("unblockUser", err);
        setIsBlocked(true);
      }
    } else {
      setIsBlocked(true);
      try {
        await blockUser(user.id, target.id);
      } catch (err) {
        console.error("blockUser", err);
        setIsBlocked(false);
      }
    }
  }, [user, isBlocked, target.id]);

  return { isBlocked, toggle, loading, canBlock: Boolean(user) };
}
