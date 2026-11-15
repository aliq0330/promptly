import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/runtime";
import { isReactionKey } from "@/lib/reactions";
import type { InsightApiUses, InsightDay, InsightPromptSummary, InsightReactionRow, InsightSummary, InsightTopItem } from "@/lib/insights";
import { reactionRows } from "@/lib/insights";

/**
 * Yaratıcı paneli veri katmanı (docs/history/294-*, 295-*): `creator_insights_*` RPC'leri. Hepsi yalnız çağıranın KENDİ yayınlanmış promptlarını
 * toplu sayılarla döndürür (kimlik sunucuda `auth.uid()`; başkasının kimliği verilemez). Hata sessizce boş sayıya çevrilmez — panel
 * "yüklenemedi" gösterip yeniden denetir, çünkü 0 yazan bir sayı yalan olur.
 */

export interface CreatorInsights {
  summary: InsightSummary;
  days: InsightDay[];
  top: InsightTopItem[];
  reactions: InsightReactionRow[];
}

export interface PromptInsights {
  summary: InsightPromptSummary;
  days: InsightDay[];
  reactions: InsightReactionRow[];
}

/** Prompt çağıranın değil / yayında değil / bulunamadı: sunucu `not_found` fırlatır (varlığı sızmasın diye hepsi aynı). */
export class InsightNotFoundError extends Error {
  constructor() {
    super("not_found");
    this.name = "InsightNotFoundError";
  }
}

const n = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const rows = (data: unknown): Record<string, unknown>[] => (Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const tools = (value: unknown): string[] => (Array.isArray(value) ? (value as unknown[]).filter((t): t is string => typeof t === "string") : []);

function apiUses(row: Record<string, unknown>): InsightApiUses {
  return { apiUses: n(row.api_uses), prevApiUses: n(row.prev_api_uses), mcpUses: n(row.mcp_uses), prevMcpUses: n(row.prev_mcp_uses) };
}

function mixRows(data: unknown): InsightReactionRow[] {
  return reactionRows(
    rows(data)
      .filter((row) => isReactionKey(row.reaction))
      .map((row) => ({ reaction: String(row.reaction), n: n(row.n) })),
  );
}

export async function fetchCreatorInsights(days: number, topLimit = 5): Promise<CreatorInsights> {
  const [summary, daily, top, mix, results, api] = await Promise.all([
    supabase.rpc("creator_insights_summary", { p_days: days }),
    supabase.rpc("creator_insights_daily", { p_days: days }),
    supabase.rpc("creator_insights_top", { p_days: days, p_limit: topLimit }),
    supabase.rpc("creator_insights_reaction_mix", { p_days: days }),
    supabase.rpc("creator_insights_results", { p_days: days }),
    supabase.rpc("creator_insights_api", { p_days: days }),
  ]);
  const failed = summary.error ?? daily.error ?? top.error ?? mix.error ?? results.error ?? api.error;
  if (failed) {
    console.error("fetchCreatorInsights", failed);
    throw new Error(translateForRuntime("insights.loadError"));
  }

  const s = rows(summary.data)[0] ?? {};
  const r = rows(results.data)[0] ?? {};
  const a = rows(api.data)[0] ?? {};
  return {
    summary: {
      copies: n(s.copies), prevCopies: n(s.prev_copies),
      reactions: n(s.reactions), prevReactions: n(s.prev_reactions),
      comments: n(s.comments), prevComments: n(s.prev_comments),
      saves: n(s.saves), prevSaves: n(s.prev_saves),
      followers: n(s.followers), prevFollowers: n(s.prev_followers),
      results: n(r.results), prevResults: n(r.prev_results),
      ...apiUses(a),
    },
    days: rows(daily.data).map((row) => ({ day: String(row.day), copies: n(row.copies), reactions: n(row.reactions), comments: n(row.comments) })),
    top: rows(top.data).map((row) => ({
      id: String(row.id),
      title: text(row.title),
      contentType: text(row.content_type, "text"),
      tools: tools(row.tools),
      copies: n(row.copies),
      reactions: n(row.reactions),
      prevCopies: n(row.prev_copies),
    })),
    reactions: mixRows(mix.data),
  };
}

/** Tek promptun ayrıntısı. Prompt çağıranın değilse `InsightNotFoundError`; başka hata "yüklenemedi" cümlesiyle fırlar. */
export async function fetchPromptInsights(promptId: string, days: number): Promise<PromptInsights> {
  const [summary, daily, mix, api] = await Promise.all([
    supabase.rpc("creator_insights_prompt", { p_prompt_id: promptId, p_days: days }),
    supabase.rpc("creator_insights_prompt_daily", { p_prompt_id: promptId, p_days: days }),
    supabase.rpc("creator_insights_prompt_reaction_mix", { p_prompt_id: promptId, p_days: days }),
    supabase.rpc("creator_insights_prompt_api", { p_prompt_id: promptId, p_days: days }),
  ]);
  const failed = summary.error ?? daily.error ?? mix.error ?? api.error;
  if (failed) {
    if (/not_found/i.test(failed.message ?? "")) throw new InsightNotFoundError();
    console.error("fetchPromptInsights", failed);
    throw new Error(translateForRuntime("insights.loadError"));
  }
  const s = rows(summary.data)[0];
  if (!s) throw new InsightNotFoundError();
  return {
    summary: {
      title: text(s.title),
      contentType: text(s.content_type, "text"),
      tools: tools(s.tools),
      copies: n(s.copies), prevCopies: n(s.prev_copies),
      reactions: n(s.reactions), prevReactions: n(s.prev_reactions),
      comments: n(s.comments), prevComments: n(s.prev_comments),
      saves: n(s.saves), prevSaves: n(s.prev_saves),
      results: n(s.results), prevResults: n(s.prev_results),
      ...apiUses(rows(api.data)[0] ?? {}),
    },
    days: rows(daily.data).map((row) => ({
      day: String(row.day), copies: n(row.copies), reactions: n(row.reactions), comments: n(row.comments), results: n(row.results),
    })),
    reactions: mixRows(mix.data),
  };
}

/** Yaratıcı panelindeki Skill satırı (docs/history/391-*): yayınlanmış, herkese açık Skill başına dönem sayıları + önceki dönem. */
export interface SkillInsightRow {
  id: string;
  title: string;
  uses: number;
  prevUses: number;
  reactions: number;
  prevReactions: number;
  comments: number;
  prevComments: number;
  saves: number;
  prevSaves: number;
}

/** `creator_insights_skills` RPC'si (yalnız çağıranın KENDİ Skill'leri, toplu sayı). Hata fırlar: panel bölümü yüklenemedi gösterir. */
export async function fetchSkillInsights(days: number): Promise<SkillInsightRow[]> {
  const { data, error } = await supabase.rpc("creator_insights_skills", { p_days: days });
  if (error) {
    console.error("fetchSkillInsights", error);
    throw new Error(translateForRuntime("insights.loadError"));
  }
  return rows(data).map((r) => ({
    id: String(r.skill_id),
    title: String(r.title ?? ""),
    uses: Number(r.uses ?? 0),
    prevUses: Number(r.prev_uses ?? 0),
    reactions: Number(r.reactions ?? 0),
    prevReactions: Number(r.prev_reactions ?? 0),
    comments: Number(r.comments ?? 0),
    prevComments: Number(r.prev_comments ?? 0),
    saves: Number(r.saves ?? 0),
    prevSaves: Number(r.prev_saves ?? 0),
  }));
}
