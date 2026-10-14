"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FollowButtonView } from "@/features/profile/follow-button";
import { CollectionFollowLimitError, followCollection, isFollowingCollection, unfollowCollection } from "@/lib/supabase/collections";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Follow / unfollow someone else's public collection — same button look as following a person
 * (`FollowButtonView`, so guests get the shared login prompt). Optimistic: the state flips at
 * once, `onCountChange` lets the page move the follower count, and a refused change (limit,
 * network) rolls both back and says why.
 */
export function CollectionFollowButton({ collectionId, onCountChange }: { collectionId: string; onCountChange: (delta: 1 | -1) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ key: string; following: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"limit" | "failed" | null>(null);
  const key = userId ? `${userId}:${collectionId}` : null;

  useEffect(() => {
    if (!userId || !key) return;
    let cancelled = false;
    isFollowingCollection(userId, collectionId).then((following) => !cancelled && setState({ key, following }));
    return () => {
      cancelled = true;
    };
  }, [userId, collectionId, key]);

  const ready = Boolean(key) && state?.key === key;
  const following = ready ? state!.following : false;

  async function toggle() {
    if (!userId || !key || busy || !ready) return;
    setProblem(null);
    setBusy(true);
    const next = !following;
    setState({ key, following: next });
    onCountChange(next ? 1 : -1);
    try {
      if (next) await followCollection(userId, collectionId);
      else await unfollowCollection(userId, collectionId);
    } catch (err) {
      console.error(next ? "followCollection" : "unfollowCollection", err);
      setState({ key, following: !next });
      onCountChange(next ? -1 : 1);
      setProblem(err instanceof CollectionFollowLimitError ? "limit" : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <FollowButtonView isFollowing={following} canFollow={Boolean(userId)} loading={Boolean(userId) && !ready} size="md" toggle={() => void toggle()} />
      {problem && (
        <p className="text-caption text-danger" role="alert">
          {problem === "limit" ? t("collection.followLimit") : t("collection.followFailed")}
        </p>
      )}
    </div>
  );
}
