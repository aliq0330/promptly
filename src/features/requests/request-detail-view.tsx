"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MessageSquareOff, PenLine, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { PromptCard } from "@/features/prompts/prompt-card";
import { CommentSection } from "@/features/prompts/comment-section";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { EditHistoryPanel } from "@/features/prompts/edit-history-panel";
import { LikeButton } from "@/features/prompts/like-button";
import { PostMenu } from "@/features/prompts/post-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchPromptsForRequest } from "@/lib/supabase/prompts";
import { useRealRequests } from "./real-requests-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "./request-card";
import { parseHighlightValue } from "@/lib/notification-utils";
import { cn, formatRelativeTime, profileHref, tagHref } from "@/lib/utils";
import type { Prompt, PromptRequest } from "@/types";

/** Same fade timing as the comment-thread flash — one shared feel across the app for "you just jumped here from a notification". */
const HIGHLIGHT_DURATION_MS = 2500;

/** Real request detail rendering, used by `/requests/local?id=…`. */
export function RequestDetailView({ request }: { request: PromptRequest }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: authUser } = useAuth();
  const {
    getCached: getCachedRealRequest,
    updateStatus: updateRealStatus,
    removeFromCache,
    selectResponse: selectRealResponse,
  } = useRealRequests();
  const [answers, setAnswers] = useState<Prompt[]>([]);
  const [selectionTarget, setSelectionTarget] = useState<{ id: string; confirming: boolean } | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const highlight = parseHighlightValue(searchParams.get("hl"));
  const highlightCommentId = highlight?.kind === "comment" ? highlight.id : null;
  const highlightResponseId =
    highlight?.kind === "response_new" || highlight?.kind === "response_selected" || highlight?.kind === "response_unselected"
      ? highlight.id
      : null;
  const [flashedResponseId, setFlashedResponseId] = useState<string | null>(null);
  const [responseHighlightNotFound, setResponseHighlightNotFound] = useState(false);
  const responseRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const processedResponseHighlight = useRef<string | null>(null);
  // "İsteğini düzenledi" bildirimi (request_edited) isteğin kendisine işaret
  // ediyor (bir yanıta/yoruma değil, PromptDetailView'ın "post" flash'ıyla
  // birebir aynı fikir) — HIGHLIGHT_DURATION_MS sonra kendiliğinden kalkar.
  const [isRequestFlashed, setIsRequestFlashed] = useState(highlight?.kind === "request" && highlight.id === request.id);

  useEffect(() => {
    if (!isRequestFlashed) return;
    const timer = setTimeout(() => setIsRequestFlashed(false), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever fires once, on mount, for the initial flash
  }, []);

  // Re-read the live version of the request from the cache so status/
  // selection changes below reflect immediately without a page reload.
  const live = getCachedRealRequest(request.id) ?? request;

  useEffect(() => {
    let cancelled = false;
    fetchPromptsForRequest(live.id).then((prompts) => {
      if (!cancelled) setAnswers(prompts);
    });
    return () => {
      cancelled = true;
    };
  }, [live.id]);

  // Land on the specific response a request_response notification pointed
  // at (Aşama 4.6) — once the real answer list has loaded.
  useEffect(() => {
    if (!highlightResponseId || processedResponseHighlight.current === highlightResponseId) return;
    if (answers.length === 0) return; // still loading — try again once it's populated
    processedResponseHighlight.current = highlightResponseId;
    const el = responseRefs.current.get(highlightResponseId);
    if (!answers.some((a) => a.id === highlightResponseId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time result of a lookup that only ever runs once per highlightResponseId (guarded above), not a render-time derivation
      setResponseHighlightNotFound(true);
      return;
    }
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashedResponseId(highlightResponseId);
    const timer = setTimeout(() => setFlashedResponseId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [answers, highlightResponseId]);

  const isOwnRequest = authUser?.id === live.author.id;
  // "answered" (closed by selecting a response) and "closed" (closed
  // manually) both mean "not accepting new answers" from a visitor's
  // point of view — see request-card.tsx's STATUS_LABELS comment.
  const isClosed = live.status !== "open";
  const hasSelection = Boolean(live.selectedResponsePromptId);

  async function handleToggleStatus() {
    const nextStatus = isClosed ? "open" : "closed";
    await updateRealStatus(live.id, nextStatus);
  }

  /**
   * `PostMenu` already performed the real, successful delete itself (or
   * Bölüm 9.41's safe-delete soft-deleted it) — this only reflects that
   * outcome: drop it from the shared cache so `/requests` doesn't show a
   * stale card, then navigate away. Mirrors `GeneratorDetailView`'s
   * `handleDeleted`/`removeFromCache` (Bölüm 9.55), same reasoning.
   */
  function handleDeleted() {
    removeFromCache(live.id);
    router.push("/requests");
  }

  async function confirmSelection(promptId: string | null) {
    setIsSelecting(true);
    setSelectionError(null);
    try {
      await selectRealResponse(live.id, promptId);
      setSelectionTarget(null);
    } catch (err) {
      setSelectionError(
        err instanceof Error ? err.message : "İşlem gerçekleştirilemedi, lütfen tekrar dene.",
      );
    } finally {
      setIsSelecting(false);
    }
  }

  const typeMeta = live.contentType ? CONTENT_TYPE_META[live.contentType] : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <article
        className={cn(
          "space-y-5 rounded-lg border border-border-soft bg-surface p-5 shadow-card transition-colors duration-700 sm:p-6",
          isRequestFlashed && "bg-primary/10 ring-1 ring-primary/40",
        )}
      >
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <ContentTypeLabel icon={Sparkles} label="Prompt İsteği" detail={typeMeta?.label ?? live.preferredTool} />
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant={STATUS_VARIANTS[live.status]}>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                {STATUS_LABELS[live.status]}
              </Badge>
              <PostMenu requestId={live.id} authorId={live.author.id} onDeleted={handleDeleted} />
            </div>
          </div>
          <h1 className="text-h1 font-semibold text-text">{live.title}</h1>
          <Link href={profileHref(live.author)} className="group inline-flex items-center gap-2.5 rounded-md">
            <Avatar src={live.author.avatarUrl} alt={live.author.displayName} size={32} />
            <span className="leading-tight">
              <span className="block text-label font-semibold text-text group-hover:text-primary">{live.author.displayName}</span>
              <span className="block text-caption text-text-muted">
                @{live.author.username} · {formatRelativeTime(live.createdAt)}
              </span>
            </span>
          </Link>
        </header>

        <div className="flex flex-wrap items-center gap-0.5 border-y border-border-soft py-1.5">
          <LikeButton id={live.id} likeCount={live.likeCount} contentType="request" size={18} />
        </div>

        <section aria-labelledby="request-brief-title" className="overflow-hidden rounded-lg border border-border-soft bg-surface-soft">
          <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-2.5">
            <h2 id="request-brief-title" className="font-sans text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
              İstek
            </h2>
            <CopyPromptButton text={live.description} />
          </div>
          <p className="whitespace-pre-wrap px-4 py-4 text-body text-text">{live.description}</p>
        </section>

        {live.referenceImage && (
          <figure className="space-y-2">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border-soft bg-surface-soft">
              <Image src={live.referenceImage.url} alt={live.referenceImage.alt} fill sizes="768px" className="object-cover" />
            </div>
            <figcaption className="text-caption text-text-muted">Referans görsel</figcaption>
          </figure>
        )}

        {live.creativeDirection && (
          <div className="rounded-md border-l-2 border-primary bg-primary-soft/50 px-4 py-3">
            <p className="mb-1 text-caption font-semibold uppercase tracking-[0.08em] text-primary">Yaratıcı Yön</p>
            <p className="text-small text-text">{live.creativeDirection}</p>
          </div>
        )}

        {(live.tags.length > 0 || live.preferredTool) && (
          <div className="flex flex-wrap gap-1.5">
            {live.tags.map((tag) => (
              <Link
                key={tag.slug}
                href={tagHref(tag)}
                className="inline-flex h-7 items-center rounded-full border border-border-soft bg-surface px-2.5 text-caption font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
              >
                #{tag.label}
              </Link>
            ))}
            {live.preferredTool && <Badge variant="neutral">{live.preferredTool}</Badge>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border-soft pt-4">
          {isOwnRequest
            ? !hasSelection && (
                <Button type="button" variant="outline" size="sm" onClick={handleToggleStatus}>
                  <MessageSquareOff size={14} />
                  {isClosed ? "Açık olarak işaretle" : "İsteği kapat"}
                </Button>
              )
            : !isClosed && (
                <Link href={`/create?answerRequest=${live.id}`} className={buttonClassName({ size: "sm", className: "h-9" })}>
                  <PenLine size={14} />
                  Yanıtla
                </Link>
              )}
          <span className="ml-auto" />
          <ShareTriggerButton target={{ contentType: "request", request: live }} label="Paylaş" />
        </div>
        {!isOwnRequest && isClosed && (
          <p className="text-caption text-text-muted">Bu istek kapandı, artık yeni yanıt kabul edilmiyor.</p>
        )}
        {isOwnRequest && <EditHistoryPanel contentType="prompt_request" contentId={live.id} />}
      </article>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-h2 font-semibold text-text">
          Yaratıcı Yanıtlar
          <span className="rounded-xs bg-surface-soft px-1.5 font-sans text-caption font-semibold tabular-nums text-text-muted">{answers.length}</span>
        </h2>
        {responseHighlightNotFound && (
          <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-muted">
            Bu yanıt artık mevcut değil.
          </p>
        )}
        {answers.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border py-8 text-center text-small text-text-muted">
            <p>Bu isteğe henüz yanıt verilmedi.</p>
            {!isClosed && !isOwnRequest && (
              <Link href={`/create?answerRequest=${live.id}`} className="font-medium text-primary underline">
                İlk yanıtı sen ver
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {answers.map((prompt) => {
              const isSelected = live.selectedResponsePromptId === prompt.id;
              const isPendingThis = selectionTarget?.id === prompt.id && selectionTarget.confirming;

              return (
                <div
                  key={prompt.id}
                  ref={(el) => {
                    if (el) responseRefs.current.set(prompt.id, el);
                    else responseRefs.current.delete(prompt.id);
                  }}
                  className={cn(
                    "space-y-2 rounded-lg transition-colors duration-700",
                    flashedResponseId === prompt.id && "-m-1.5 bg-primary/10 p-1.5 ring-1 ring-primary/40",
                  )}
                >
                  <PromptCard prompt={prompt} />
                  {isOwnRequest && (
                    <div className="flex flex-wrap items-center gap-2 px-1">
                      {isSelected ? (
                        <>
                          {isPendingThis ? (
                            <>
                              <span className="text-xs text-text-muted">Seçimi kaldırmak istediğine emin misin?</span>
                              <button
                                type="button"
                                onClick={() => setSelectionTarget(null)}
                                className="text-xs font-medium text-text-muted hover:text-text"
                              >
                                Vazgeç
                              </button>
                              <button
                                type="button"
                                disabled={isSelecting}
                                onClick={() => confirmSelection(null)}
                                className="text-xs font-medium text-danger hover:underline"
                              >
                                Seçimi kaldır
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectionTarget({ id: prompt.id, confirming: true })}
                              className="text-xs font-medium text-text-muted hover:text-text"
                            >
                              Seçimi kaldır
                            </button>
                          )}
                        </>
                      ) : isPendingThis ? (
                        <>
                          <span className="text-xs text-text-muted">
                            Bu yanıtı seçmek istediğine emin misin? Seçtiğinde istek kapatılacak ve yeni yanıt kabul
                            edilmeyecek.
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectionTarget(null)}
                            className="text-xs font-medium text-text-muted hover:text-text"
                          >
                            Vazgeç
                          </button>
                          <button
                            type="button"
                            disabled={isSelecting}
                            onClick={() => confirmSelection(prompt.id)}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Yanıtı seç
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectionTarget({ id: prompt.id, confirming: true })}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Yanıtı seç
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {selectionError && <p className="text-sm text-danger">{selectionError}</p>}
      </section>

      <section className="rounded-lg border border-border-soft bg-surface p-4 sm:p-5">
        {/*
          Kapalı bir istekte de yorumlar/yanıtlar AÇIK kalmalı — "kapalı"
          yalnızca isteğin yeni bir tam yanıt (Prompt) kabul etmediği
          anlamına geliyor (yukarıdaki "Yanıtla" linki/`validate_prompt_
          response_target` sunucu kontrolü), yorum sistemine hiç dokunmuyor.
          `PromptDetailView` de zaten hiç `disabledReason` geçirmiyor —
          burası da artık aynı, koşulsuz davranışı kullanıyor.
        */}
        <CommentSection target={{ requestId: live.id }} highlightCommentId={highlightCommentId} />
      </section>
    </div>
  );
}
