"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MessageSquareOff, Sparkles, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PromptCard } from "@/features/prompts/prompt-card";
import { CommentSection } from "@/features/prompts/comment-section";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchPromptsForRequest } from "@/lib/supabase/prompts";
import { useRealRequests } from "./real-requests-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "./request-card";
import { parseHighlightValue } from "@/lib/notification-utils";
import { cn, formatRelativeTime } from "@/lib/utils";
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
    deleteRequest: deleteRealRequest,
    selectResponse: selectRealResponse,
  } = useRealRequests();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await deleteRealRequest(live.id);
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

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text">{live.title}</h1>
          <Badge variant={STATUS_VARIANTS[live.status]}>{STATUS_LABELS[live.status]}</Badge>
        </div>
        <p className="text-sm text-text-muted">{live.description}</p>

        {live.referenceImage && (
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-accent-surface">
            <Image
              src={live.referenceImage.url}
              alt={live.referenceImage.alt}
              fill
              sizes="768px"
              className="object-cover"
            />
          </div>
        )}

        {live.creativeDirection && (
          <div className="rounded-md bg-accent-surface p-3 text-sm text-text">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Yaratıcı Yön
            </p>
            {live.creativeDirection}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {live.tags.map((tag) => (
            <Badge key={tag.slug} variant="outline">
              {tag.label}
            </Badge>
          ))}
          {live.preferredTool && <Badge variant="outline">{live.preferredTool}</Badge>}
        </div>
        <div className="flex items-center gap-2 pt-1 text-xs text-text-muted">
          <Avatar src={live.author.avatarUrl} alt={live.author.displayName} size={24} />
          <span>{live.author.displayName}</span>
          <span>· {formatRelativeTime(live.createdAt)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isOwnRequest ? (
            !hasSelection && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={handleToggleStatus}>
                  <MessageSquareOff size={14} />
                  {isClosed ? "Açık olarak işaretle" : "İsteği kapat"}
                </Button>
                <Button
                  type="button"
                  variant={confirmingDelete ? "primary" : "ghost"}
                  size="sm"
                  onClick={handleDelete}
                  onBlur={() => setConfirmingDelete(false)}
                >
                  <Trash2 size={14} />
                  {confirmingDelete ? "Emin misin? Tekrar tıkla" : "İsteği sil"}
                </Button>
              </>
            )
          ) : (
            !isClosed && (
              <Link
                href={`/create?answerRequest=${live.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
              >
                <Sparkles size={14} />
                Yanıtla
              </Link>
            )
          )}
          {isOwnRequest && hasSelection && (
            <Button
              type="button"
              variant={confirmingDelete ? "primary" : "ghost"}
              size="sm"
              onClick={handleDelete}
              onBlur={() => setConfirmingDelete(false)}
            >
              <Trash2 size={14} />
              {confirmingDelete ? "Emin misin? Tekrar tıkla" : "İsteği sil"}
            </Button>
          )}
        </div>
        {!isOwnRequest && isClosed && (
          <p className="text-xs text-text-muted">Bu istek kapandı, artık yeni yanıt kabul edilmiyor.</p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text">Yaratıcı Yanıtlar ({answers.length})</h2>
        {responseHighlightNotFound && (
          <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text-muted">
            Bu yanıt artık mevcut değil.
          </p>
        )}
        {answers.length === 0 ? (
          <div className="space-y-3 py-6 text-center text-sm text-text-muted">
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
                                className="text-xs font-medium text-red-600 hover:underline"
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
        {selectionError && <p className="text-sm text-red-500">{selectionError}</p>}
      </section>

      <CommentSection
        target={{ requestId: live.id }}
        disabledReason={isClosed ? "Bu istek kapatıldığı için yeni yorum eklenemiyor." : undefined}
        highlightCommentId={highlightCommentId}
      />
    </div>
  );
}
