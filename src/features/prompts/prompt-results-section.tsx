"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchResultsForGenerator, fetchResultsForPrompt } from "@/lib/supabase/prompt-results";
import { AddResultModal, type AddResultModalTarget } from "./add-result-modal";
import { ResultCard } from "./result-card";
import type { PromptResultSummary } from "@/types";

const PAGE_SIZE = 6;

/**
 * The section's own target — a prompt or a generator. Not the modal's
 * `AddResultModalTarget` by accident: they happen to carry the same shape
 * today, but this one is what decides which `fetchResultsFor*` call runs,
 * the modal's is what decides which `createPromptResult` source is built —
 * keeping them as two small, named types (rather than one shared prop
 * threaded through both) is what actually lets each call site stay a
 * one-line dispatch instead of a wider, leakier shared prop.
 */
export type PromptResultsSectionTarget = { type: "prompt"; promptId: string; promptText: string } | { type: "generator"; generatorId: string };

/**
 * "Kullanıcı sonuçları" section (CLAUDE.md §1/§15/§16/§17, ve Generator
 * Local entegrasyonu şartnamesi §1/§22) — sits directly under a prompt's OR
 * a generator's own content on its detail page; the exact same component,
 * same cards, same modal, same pagination either way (§22's "TEK SİSTEM"
 * kuralı — no second results system, only a different `target`). Only ever
 * fetches one page of compact summaries at a time (never every result up
 * front); "Daha fazla yükle" reveals the next page into the same grid
 * instead of a separate full-gallery route (a deliberate scope decision —
 * the checklist only requires "pagination/infinite loading mevcut", not a
 * dedicated page). Adding a result triggers a real refetch of the first
 * page rather than fabricating a client-side summary object that could
 * drift from what the server actually stored.
 */
export function PromptResultsSection({ target }: { target: PromptResultsSectionTarget }) {
  const { user } = useAuth();
  const isPromptTarget = target.type === "prompt";
  const targetId = isPromptTarget ? target.promptId : target.generatorId;
  const [results, setResults] = useState<PromptResultSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function fetchPage(offset: number) {
    return isPromptTarget
      ? fetchResultsForPrompt(targetId, { limit: PAGE_SIZE, offset })
      : fetchResultsForGenerator(targetId, { limit: PAGE_SIZE, offset });
  }

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets when the target or reloadKey changes
    setLoading(true);
    fetchPage(0).then(({ results: fetched, total: fetchedTotal }) => {
      if (cancelled) return;
      setResults(fetched);
      setTotal(fetchedTotal);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPage is a fresh closure every render but only ever depends on targetId/isPromptTarget, both already in this deps array
  }, [targetId, isPromptTarget, reloadKey]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const { results: more } = await fetchPage(results.length);
    setResults((prev) => [...prev, ...more]);
    setLoadingMore(false);
  }

  const modalTarget: AddResultModalTarget = isPromptTarget
    ? { type: "prompt", promptId: target.promptId, promptText: target.promptText }
    : { type: "generator", generatorId: target.generatorId };

  function handleAdded() {
    setIsAddOpen(false);
    setReloadKey((key) => key + 1);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-label font-semibold text-text">
          Kullanıcı sonuçları{total > 0 && <span className="ml-1.5 text-text-muted">{total}</span>}
        </h2>
        {user && (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsAddOpen(true)}>
            <Plus size={14} />
            Sonuç ekle
          </Button>
        )}
      </div>
      {user && (
        <p className="text-caption text-text-muted">
          {isPromptTarget ? "Bu promptu kullanarak oluşturduğun sonucu paylaş." : "Bu generatoru kullanarak oluşturduğun sonucu paylaş."}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-soft bg-surface-soft px-4 py-6 text-center text-caption text-text-muted">
          {isPromptTarget
            ? "Henüz kimse bu promptu kullanarak oluşturduğu bir sonucu paylaşmadı."
            : "Henüz kimse bu generatoru kullanarak oluşturduğu bir sonucu paylaşmadı."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {results.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
          {results.length < total && (
            <div className="flex justify-center">
              <Button type="button" size="sm" variant="ghost" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 size={14} className="animate-spin" />}
                Daha fazla yükle ({total - results.length})
              </Button>
            </div>
          )}
        </>
      )}

      {isAddOpen && <AddResultModal target={modalTarget} onClose={() => setIsAddOpen(false)} onAdded={handleAdded} />}
    </section>
  );
}
