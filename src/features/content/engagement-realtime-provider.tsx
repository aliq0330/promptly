"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { engagementStore } from "./engagement-store";
import type { LikeableContentType } from "@/lib/supabase/likes";

/**
 * Gerçek zamanlı beğeni/kaydetme/takip güncellemeleri — kullanıcının açık
 * isteği ("begeni takip ve kaydetmede realtime olsun"). Mounted once (in
 * `AppProviders`), no `user` dependency — these counts are public, so this
 * subscribes regardless of sign-in state.
 *
 * Deliberately does NOT subscribe to the raw junction tables (`prompt_
 * likes`/`collection_items`/`follows`) — it listens to UPDATE events on the
 * "summary" tables that already carry the trigger-maintained
 * `like_count`/`save_count`/`follower_count` columns (prompts/generators/
 * workflows/prompt_requests/prompt_results/profiles — added to
 * `supabase_realtime` by `20260919540000_engagement_counts_and_realtime.
 * sql`), and reads the new value straight off the Postgres Changes payload.
 * This sidesteps two real problems a raw-row-event approach would have:
 *   - No "is this my own action echoing back" filtering is needed: writing
 *     the authoritative count is a plain overwrite (`engagementStore.
 *     setCount`), not a delta, so re-applying the same true number a second
 *     time (this viewer's own toggle, echoed back) is a harmless no-op.
 *   - `save_count`'s per-distinct-owner dedup logic (CLAUDE.md — saving the
 *     same item into 2 of your own collections only counts once) is
 *     entirely the DB trigger's problem; the client never has to reason
 *     about it, it just reads the number the trigger already computed.
 *
 * The subscription is deliberately unfiltered (every row's UPDATE, not just
 * ids this viewer currently has open) — matches `RealMessagesProvider`'s
 * own "keep it simple" choice (CLAUDE.md); at this app's real content
 * volume the extra traffic is negligible, and `engagementStore.setCount`
 * itself no-ops for any id nothing has seeded yet, so an event for content
 * nobody's looking at this session costs one cheap Map lookup.
 *
 * Childless, side-effect-only component — same shape as `PreferencesSync`
 * (rendered as a sibling inside `AppProviders`, not a wrapping Context
 * provider, since there's no value to share).
 */
export function EngagementRealtimeProvider() {
  useEffect(() => {
    const channel = supabase
      .channel("engagement-counts")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "prompts" },
        (payload) => applyLikeSave("prompt", payload.new as { id: string; like_count?: number; save_count?: number }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "generators" },
        (payload) => applyLikeSave("generator", payload.new as { id: string; like_count?: number; save_count?: number }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workflows" },
        (payload) => applyLikeSave("workflow", payload.new as { id: string; like_count?: number; save_count?: number }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "prompt_requests" },
        (payload) => applyLikeSave("request", payload.new as { id: string; like_count?: number }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "prompt_results" },
        (payload) => applyLikeSave("prompt_result", payload.new as { id: string; like_count?: number }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as { id: string; follower_count?: number };
          if (typeof row.follower_count === "number") {
            engagementStore.setCount(engagementStore.keyOf("follow", "", row.id), row.follower_count);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}

function applyLikeSave(
  contentType: LikeableContentType,
  row: { id: string; like_count?: number; save_count?: number },
) {
  if (typeof row.like_count === "number") {
    engagementStore.setCount(engagementStore.keyOf("like", contentType, row.id), row.like_count);
  }
  if (typeof row.save_count === "number") {
    engagementStore.setCount(engagementStore.keyOf("save", contentType, row.id), row.save_count);
  }
}
