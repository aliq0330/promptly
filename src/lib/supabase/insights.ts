import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";
import { isReactionKey } from "@/lib/reactions";
import type { InsightDay, InsightReactionRow, InsightSummary, InsightTopItem } from "@/lib/insights";
import { reactionRows } from "@/lib/insights";

/**
 * Yaratıcı paneli veri katmanı (docs/history/293-*): dört `creator_insights_*` RPC'si. Hepsi yalnız çağıranın KENDİ yayınlanmış promptlarını
 * toplu sayılarla döndürür (kimlik sunucuda `auth.uid()`; başkasının kimliği verilemez). Hata sessizce boş sayıya çevrilmez — panel
 * "yüklenemedi" gösterip yeniden denetir, çünkü 0 yazan bir sayı yalan olur.
 */

export interface CreatorInsights {
  summary: InsightSummary;
  days: InsightDay[];
  top: InsightTopItem[];
  reactions: InsightReactionRow[];
}

const n = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export async function fetchCreatorInsights(days: number, topLimit = 5): Promise<CreatorInsights> {
  const [summary, daily, top, mix] = await Promise.all([
    supabase.rpc("creator_insights_summary", { p_days: days }),
    supabase.rpc("creator_insights_daily", { p_days: days }),
    supabase.rpc("creator_insights_top", { p_days: days, p_limit: topLimit }),
    supabase.rpc("creator_insights_reaction_mix", { p_days: days }),
  ]);
  const failed = summary.error ?? daily.error ?? top.error ?? mix.error;
  if (failed) {
    console.error("fetchCreatorInsights", failed);
    throw new Error(translateForRuntime("insights.loadError"));
  }

  const s = ((summary.data as Record<string, unknown>[] | null) ?? [])[0] ?? {};
  return {
    summary: {
      copies: n(s.copies), prevCopies: n(s.prev_copies),
      reactions: n(s.reactions), prevReactions: n(s.prev_reactions),
      comments: n(s.comments), prevComments: n(s.prev_comments),
      saves: n(s.saves), prevSaves: n(s.prev_saves),
      followers: n(s.followers), prevFollowers: n(s.prev_followers),
    },
    days: ((daily.data as Record<string, unknown>[] | null) ?? []).map((row) => ({
      day: String(row.day),
      copies: n(row.copies),
      reactions: n(row.reactions),
      comments: n(row.comments),
    })),
    top: ((top.data as Record<string, unknown>[] | null) ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      contentType: String(row.content_type ?? "text"),
      tools: Array.isArray(row.tools) ? (row.tools as unknown[]).filter((t): t is string => typeof t === "string") : [],
      copies: n(row.copies),
      reactions: n(row.reactions),
      prevCopies: n(row.prev_copies),
    })),
    reactions: reactionRows(
      ((mix.data as Record<string, unknown>[] | null) ?? [])
        .filter((row) => isReactionKey(row.reaction))
        .map((row) => ({ reaction: String(row.reaction), n: n(row.n) })),
    ),
  };
}
