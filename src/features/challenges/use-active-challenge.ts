"use client";

import { useEffect, useState } from "react";
import { fetchActiveChallenge } from "@/lib/supabase/challenges";
import type { WeeklyChallenge } from "@/lib/challenge";

const CACHE_MS = 60_000;
let cache: { at: number; challenge: WeeklyChallenge | null } | null = null;
let inflight: Promise<WeeklyChallenge | null> | null = null;

function loadActiveChallenge(): Promise<WeeklyChallenge | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.challenge);
  if (!inflight) {
    inflight = fetchActiveChallenge().then((challenge) => {
      cache = { at: Date.now(), challenge };
      inflight = null;
      return challenge;
    });
  }
  return inflight;
}

/** Forget the cached theme (the moderator panel calls this after a change so Home shows it at once). */
export function resetActiveChallengeCache() {
  cache = null;
}

/** The running weekly theme, or null (loading, none, or failed) — shared by Home and Keşfet so switching between them does not refetch. */
export function useActiveChallenge(): WeeklyChallenge | null {
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(() => (cache && Date.now() - cache.at < CACHE_MS ? cache.challenge : null));
  useEffect(() => {
    let cancelled = false;
    loadActiveChallenge().then((next) => {
      if (!cancelled) setChallenge(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return challenge;
}
