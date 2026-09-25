"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, SquareTerminal } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { CommentSection } from "@/features/prompts/comment-section";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { DiffText } from "@/features/prompts/diff-text";
import { EditResultModal } from "@/features/prompts/edit-result-modal";
import { LikeButton } from "@/features/prompts/like-button";
import { PostMenu } from "@/features/prompts/post-menu";
import { ResultTypePreview } from "@/features/prompts/result-type-preview";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { RESULT_MEDIA_TYPE_LABELS } from "@/lib/prompt-result-media";
import { fetchResultById } from "@/lib/supabase/prompt-results";
import { formatRelativeTime, generatorHref, profileHref, promptHref } from "@/lib/utils";
import type { PromptResult } from "@/types";

/**
 * The big, content-first "Kullanıcı Sonucu" detail view (`/results/local?
 * id=…` — CLAUDE.md §7/§9/§11/§12/§13). Fetches the FULL result shape (real
 * media url, modification text, original-prompt snapshot) exactly once,
 * here — the grid/card never loads any of this up front (§16/§17).
 */
export function ResultDetailView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [result, setResult] = useState<PromptResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isModificationOpen, setIsModificationOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no id to look up
      setLoaded(true);
      return;
    }
    setLoaded(false);
    fetchResultById(id).then((found) => {
      if (cancelled) return;
      setResult(found);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id || !loaded) {
    return !id ? <NotFoundBlock title="Sonuç bulunamadı" description="Bağlantı eksik ya da hatalı görünüyor." /> : <DetailSkeleton />;
  }

  if (!result) {
    return <NotFoundBlock title="Sonuç bulunamadı" description="Bu sonuç silinmiş ya da hiç var olmamış olabilir." />;
  }

  // After deleting your own result there's nothing left on this page to
  // show — head back to the real origin (prompt or generator) instead of
  // leaving the viewer stranded on a now-empty page.
  function handleDeleted() {
    router.push(result!.originalPrompt ? promptHref(result!.originalPrompt) : generatorHref(result!.originalGenerator!));
  }

  // Refetches rather than fabricating an updated object client-side —
  // same reasoning `PromptResultsSection.handleAdded` already uses: the
  // real, stored row is the only source of truth.
  function handleUpdated() {
    setIsEditOpen(false);
    fetchResultById(id!).then((found) => setResult(found));
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <article className="min-w-0 space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <Link href={profileHref(result.creator)} className="group flex min-w-0 items-center gap-2.5 rounded-md">
              <Avatar src={result.creator.avatarUrl} alt={result.creator.displayName} size={36} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-label font-semibold text-text group-hover:text-primary">
                  {result.creator.displayName}
                </span>
                <span className="block truncate text-caption text-text-muted">
                  @{result.creator.username} · {formatRelativeTime(result.createdAt)}
                </span>
              </span>
            </Link>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="neutral">{RESULT_MEDIA_TYPE_LABELS[result.mediaType]}</Badge>
              {result.tool && <Badge variant="outline">{result.tool}</Badge>}
              <PostMenu resultId={result.id} authorId={result.creator.id} onDeleted={handleDeleted} onEdit={() => setIsEditOpen(true)} />
            </div>
          </header>

          <ResultTypePreview result={result} size="detail" />

          <div className="flex flex-wrap items-center gap-0.5 border-y border-border-soft py-1.5">
            <LikeButton id={result.id} likeCount={result.likeCount} contentType="prompt_result" size={18} />
            <CommentCountLink resultId={result.id} baseCount={result.commentCount} size={18} />
            <span className="ml-auto" />
            <ShareTriggerButton target={{ contentType: "prompt_result", result }} label="Paylaş" />
          </div>

          {result.originalPrompt ? (
            <section aria-labelledby="result-origin-title" className="space-y-2 rounded-lg border border-border-soft bg-surface-soft p-4">
              <h2 id="result-origin-title" className="flex items-center gap-1.5 font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                <SquareTerminal size={14} />
                Bu sonuç hangi promptla oluşturuldu?
              </h2>
              <Link href={promptHref(result.originalPrompt)} className="block rounded-md border border-border-soft bg-surface p-3 transition-colors hover:border-primary/40">
                <p className="truncate text-label font-semibold text-text">{result.originalPrompt.title}</p>
                {result.originalPrompt.description && (
                  <p className="mt-0.5 line-clamp-2 text-caption text-text-muted">{result.originalPrompt.description}</p>
                )}
                <p className="mt-1.5 text-caption font-medium text-primary">Promptu görüntüle →</p>
              </Link>
            </section>
          ) : (
            result.originalGenerator && (
              // Generator-origin result (Generator Local entegrasyonu §13) — same back-link
              // idea as the prompt card above, minus any prompt-modification comparison
              // (§5/§23 — that feature doesn't exist for a generator-sourced result at all).
              <section aria-labelledby="result-origin-title" className="space-y-2 rounded-lg border border-border-soft bg-surface-soft p-4">
                <h2 id="result-origin-title" className="flex items-center gap-1.5 font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                  <SquareTerminal size={14} />
                  Bu sonuç hangi generatorla oluşturuldu?
                </h2>
                <Link
                  href={generatorHref(result.originalGenerator)}
                  className="block rounded-md border border-border-soft bg-surface p-3 transition-colors hover:border-primary/40"
                >
                  <p className="truncate text-label font-semibold text-text">{result.originalGenerator.title}</p>
                  <p className="mt-0.5 text-caption text-text-muted">Bu sonuç bu generator kullanılarak oluşturuldu.</p>
                  <p className="mt-1.5 text-caption font-medium text-primary">Generatoru görüntüle →</p>
                </Link>
              </section>
            )
          )}

          {result.hasModification && result.originalPrompt && (
            <section className="rounded-lg border border-border-soft bg-surface">
              <button
                type="button"
                onClick={() => setIsModificationOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="text-label font-medium text-text">
                  Bu sonuçta değişiklik yapıldı{result.modificationSummary ? ` — ${result.modificationSummary}` : ""}
                </span>
                {isModificationOpen ? (
                  <ChevronUp size={16} className="shrink-0 text-text-muted" />
                ) : (
                  <ChevronDown size={16} className="shrink-0 text-text-muted" />
                )}
              </button>
              {isModificationOpen && (
                <div className="space-y-3 border-t border-border-soft px-4 py-3">
                  {result.modifiedPromptText ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">Orijinal</p>
                        <div className="max-h-40 overflow-y-auto rounded-md border border-border-soft bg-surface-soft p-2.5">
                          <DiffText before={result.originalPrompt.promptText} after={result.modifiedPromptText} />
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">Kullanıcı değişikliği</p>
                        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border-soft bg-surface-soft p-2.5 font-mono text-xs text-text">
                          {result.modifiedPromptText}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-caption text-text-muted">
                      {result.modificationSummary || "Sonucu paylaşan kullanıcı promptu değiştirdiğini belirtti."}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          <section id="comments" className="scroll-mt-20 rounded-lg border border-border-soft bg-surface p-4 sm:p-5">
            <CommentSection target={{ resultId: result.id }} />
          </section>
      </article>

      {isEditOpen && <EditResultModal result={result} onClose={() => setIsEditOpen(false)} onUpdated={handleUpdated} />}
    </div>
  );
}
