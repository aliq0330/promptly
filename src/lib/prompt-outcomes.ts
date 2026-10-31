/**
 * "Çalıştı mı?" geri bildirimi (docs/history/296-*): kopyalayan kişinin cevapları (`prompt_outcomes`) tek özete çevrilir.
 * Saf fonksiyonlar — veri erişimi `lib/supabase/prompt-outcomes.ts`'tedir.
 */

export const PROMPT_OUTCOMES = ["worked", "partial", "failed"] as const;
export type PromptOutcome = (typeof PROMPT_OUTCOMES)[number];

/** Bundan az cevapta yüzde gösterilmez ("Henüz yeterli deneme yok"): 1–2 kişilik bir oran yanıltır. */
export const MIN_OUTCOME_VOTES = 3;

/** `prompt_outcome_stats` RPC'sinin bir satırı: araç + sürüm başına sayılar. `tool` boş = araç belirtilmedi. */
export interface OutcomeStatRow {
  tool: string;
  toolVersion: string;
  worked: number;
  partial: number;
  failed: number;
}

export interface OutcomeBreakdown {
  total: number;
  worked: number;
  partial: number;
  failed: number;
  /** Toplamı tam 100 olan yüzdeler (en büyük kalan yöntemi); `total` 0 ise hepsi 0. */
  workedPct: number;
  partialPct: number;
  failedPct: number;
}

export interface ToolOutcome extends OutcomeBreakdown {
  tool: string;
  toolVersion: string;
}

export interface OutcomeSummary extends OutcomeBreakdown {
  /** `total >= MIN_OUTCOME_VOTES`: yüzdeler ancak o zaman gösterilir. */
  enough: boolean;
  tools: ToolOutcome[];
}

/** Üç sayıyı toplamı tam 100 olan yüzdelere çevirir (yuvarlama farkı en büyük kalana verilir). */
export function percentages(worked: number, partial: number, failed: number): [number, number, number] {
  const total = worked + partial + failed;
  if (total <= 0) return [0, 0, 0];
  const raw = [worked, partial, failed].map((n) => (n / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return [floors[0], floors[1], floors[2]];
}

function breakdown(worked: number, partial: number, failed: number): OutcomeBreakdown {
  const [workedPct, partialPct, failedPct] = percentages(worked, partial, failed);
  return { total: worked + partial + failed, worked, partial, failed, workedPct, partialPct, failedPct };
}

export function summarizeOutcomes(rows: readonly OutcomeStatRow[]): OutcomeSummary {
  let worked = 0;
  let partial = 0;
  let failed = 0;
  const tools: ToolOutcome[] = [];
  for (const row of rows) {
    const w = Math.max(0, row.worked);
    const p = Math.max(0, row.partial);
    const f = Math.max(0, row.failed);
    if (w + p + f === 0) continue;
    worked += w;
    partial += p;
    failed += f;
    tools.push({ tool: row.tool, toolVersion: row.toolVersion, ...breakdown(w, p, f) });
  }
  tools.sort((a, b) => b.total - a.total || a.tool.localeCompare(b.tool));
  const all = breakdown(worked, partial, failed);
  return { ...all, enough: all.total >= MIN_OUTCOME_VOTES, tools };
}

/** Araç satırının görünen adı: "GPT Image 1 · v1.5"; araç yoksa `fallback`. */
export function outcomeToolLabel(tool: string, toolVersion: string, fallback: string): string {
  const name = tool.trim();
  if (!name) return fallback;
  const version = toolVersion.trim();
  return version ? `${name} · ${version}` : name;
}
