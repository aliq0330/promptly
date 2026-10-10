"use client";

import { useState } from "react";
import { Dna } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { analyzePromptDna } from "@/lib/prompt-dna/analyzer";
import { itemsToContent } from "@/lib/prompt-dna/merge";

/**
 * Moderatör aracı: DNA'sı olmayan yayınlı promptlar için yerel kural motoruyla
 * DNA çıkarıp kaydeder (ilişki haritasının benzerlik önerileri bunu kullanır).
 * Analiz tarayıcıda yapılır; yazım yalnızca moderatör RPC'sinden geçer.
 */
export function DnaBackfillCard() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ prompts: number; sections: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    let prompts = 0;
    let sections = 0;
    try {
      let after: string | null = null;
      for (let guard = 0; guard < 200; guard++) {
        const { data, error: fetchError } = await supabase.rpc("admin_prompts_missing_dna", { p_after: after, p_limit: 50 });
        if (fetchError) throw new Error(fetchError.message);
        const batch = (data ?? []) as { id: string; prompt_text: string }[];
        if (batch.length === 0) break;
        after = batch[batch.length - 1].id;
        const rows = batch
          .map((p) => ({
            prompt_id: p.id,
            sections: analyzePromptDna(p.prompt_text).sections.map((s) => ({
              type: s.type,
              content: itemsToContent(s),
              confidence: s.confidence,
            })),
          }))
          .filter((r) => r.sections.length > 0);
        if (rows.length > 0) {
          const { data: inserted, error: writeError } = await supabase.rpc("admin_backfill_prompt_dna", { p_rows: rows });
          if (writeError) throw new Error(writeError.message);
          prompts += rows.length;
          sections += Number(inserted ?? 0);
        }
        setDone({ prompts, sections });
      }
      setDone({ prompts, sections });
    } catch (err) {
      console.error("dna backfill", err);
      setError(t("moderation.dnaFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Dna size={18} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{t("moderation.dnaTitle")}</h2>
          <p className="text-small text-text-secondary">{t("moderation.dnaHint")}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={run} disabled={busy}>
        {busy ? t("moderation.dnaRunning") : t("moderation.dnaRun")}
      </Button>
      {done && !busy && <p className="text-small text-text-secondary">{t("moderation.dnaDone", { prompts: done.prompts, sections: done.sections })}</p>}
      {done && busy && <p className="text-small text-text-secondary">{t("moderation.dnaProgress", { prompts: done.prompts })}</p>}
      {error && <p className="text-small text-danger">{error}</p>}
    </section>
  );
}
