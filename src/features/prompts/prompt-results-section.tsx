"use client";

import { DetailSection } from "@/features/content/detail-parts";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchResultsForPrompt } from "@/lib/supabase/prompt-results";
import { useTranslation } from "@/lib/i18n/language-provider";
import { AddResultModal, type AddResultModalTarget } from "./add-result-modal";
import { ResultCard } from "./result-card";
import { PROMPT_ADD_RESULT_EVENT } from "./works-events";
import { useWorksVotes } from "./works-badges";
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
export type PromptResultsSectionTarget = { type: "prompt"; promptId: string; promptText: string };

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
  const { t } = useTranslation();
  const { user } = useAuth();
  const targetId = target.promptId;
  const [results, setResults] = useState<PromptResultSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function fetchPage(offset: number) {
    return fetchResultsForPrompt(targetId, { limit: PAGE_SIZE, offset });
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
  }, [targetId, reloadKey]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const { results: more } = await fetchPage(results.length);
    setResults((prev) => [...prev, ...more]);
    setLoadingMore(false);
  }

  // "Çalıştı mı?" daveti (docs/history/341-*) "Sonucunu paylaş" derse bu bölümün kendi ekleme penceresi açılır (ikinci bir pencere yok).
  useEffect(() => {
    if (!user) return;
    const onRequest = (event: Event) => {
      if ((event as CustomEvent<{ promptId?: string }>).detail?.promptId === targetId) setIsAddOpen(true);
    };
    window.addEventListener(PROMPT_ADD_RESULT_EVENT, onRequest);
    return () => window.removeEventListener(PROMPT_ADD_RESULT_EVENT, onRequest);
  }, [targetId, user]);

  // Sonuç paylaşanların bu promptta verdiği oy → kartta rozet (tek toplu okuma).
  const creatorIds = useMemo(() => results.map((result) => result.creator.id), [results]);
  const worksVotes = useWorksVotes(targetId, creatorIds);

  const modalTarget: AddResultModalTarget = { type: "prompt", promptId: target.promptId, promptText: target.promptText };

  function handleAdded() {
    setIsAddOpen(false);
    setReloadKey((key) => key + 1);
  }

  return (
    // A numbered section of the editorial detail page (docs/history/201-*).
    <DetailSection
      title={
        <>
          {t("result.sectionTitle")}
          <span className="font-sans text-label font-normal tabular-nums text-text-muted"> · {total}</span>
        </>
      }
      action={
        user && (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsAddOpen(true)}>
            <Plus size={14} />
            {t("result.addResult")}
          </Button>
        )
      }
    >
      {user && (
        <p className="text-caption text-text-muted">
          {t("result.sharePromptHint")}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-[22px] border border-dashed border-border px-4 py-8 text-center text-small text-text-muted">
          {t("result.emptyPromptHint")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {results.map((result) => (
              <ResultCard key={result.id} result={result} worksVote={worksVotes.get(result.creator.id)} />
            ))}
          </div>
          {results.length < total && (
            <div className="flex justify-center">
              <Button type="button" size="sm" variant="ghost" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 size={14} className="animate-spin" />}
                {t("result.loadMoreCount", { count: total - results.length })}
              </Button>
            </div>
          )}
        </>
      )}

      {isAddOpen && <AddResultModal target={modalTarget} onClose={() => setIsAddOpen(false)} onAdded={handleAdded} />}
    </DetailSection>
  );
}
