"use client";

import { fetchCreatorInsights, fetchPromptInsights, fetchSkillInsights, InsightNotFoundError, type CreatorInsights, type PromptInsights, type SkillInsightRow } from "@/lib/supabase/insights";
import { useInsightData, type InsightState } from "@/features/insights/use-insight-data";

/** Genel panel: beş RPC tek `Promise.all`'da, dönem başına önbellekli. */
export function useCreatorInsights(days: number): { state: InsightState<CreatorInsights>; retry: () => void } {
  return useInsightData(`panel:${days}`, () => fetchCreatorInsights(days));
}

/** Tek prompt ayrıntısı; prompt çağıranın değilse `state.notFound`. */
export function usePromptInsights(promptId: string | null, days: number): { state: InsightState<PromptInsights>; retry: () => void } {
  return useInsightData(
    `prompt:${promptId ?? ""}:${days}`,
    () => (promptId ? fetchPromptInsights(promptId, days) : Promise.reject(new InsightNotFoundError())),
    (error) => error instanceof InsightNotFoundError,
  );
}

/** Yaratıcı panelinin "Skill'ler" bölümü (docs/history/391-*): genel panelden bağımsız yüklenir; hata ya da boş liste bölümü gizler/ya da yeniden denetir. */
export function useSkillInsights(days: number): { state: InsightState<SkillInsightRow[]>; retry: () => void } {
  return useInsightData(`skills:${days}`, () => fetchSkillInsights(days));
}
