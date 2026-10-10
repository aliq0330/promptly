"use client";

import { ToolLine } from "@/features/content/tool-chips";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MessageSquareOff, PenLine, Reply, Sparkles, SquareTerminal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { contentActionClassName } from "@/features/content/action-styles";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { PromptCard } from "@/features/prompts/prompt-card";
import { CommentSection } from "@/features/prompts/comment-section";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { RelationMapLink } from "@/features/relations/relation-map-link";
import { EditHistoryPanel } from "@/features/prompts/edit-history-panel";
import { LikeButton } from "@/features/prompts/like-button";
import { PostMenu } from "@/features/prompts/post-menu";
import { TaxonomyLinks } from "@/features/content/taxonomy-links";
import { CreatorSummary } from "@/features/profile/creator-summary";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { RelatedRequests } from "./related-requests";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchPromptsForRequest } from "@/lib/supabase/prompts";
import { useRealRequests } from "./real-requests-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "./request-card";
import { parseHighlightValue } from "@/lib/notification-utils";
import { cn, formatCount, profileHref } from "@/lib/utils";
import { AsideSection, DetailActionBar, DetailAside, DetailByline, DetailComments, DetailShell, DetailTags, DetailTitle, Eyebrow } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Prompt, PromptRequest } from "@/types";
import { ScrollablePrompt } from "@/features/content/scrollable-prompt";

/** Same fade timing as the comment-thread flash — one shared feel across the app for "you just jumped here from a notification". */
const HIGHLIGHT_DURATION_MS = 2500;

/** Real request detail rendering, used by `/requests/local?id=…`. */
export function RequestDetailView({ request }: { request: PromptRequest }) {
  const { t, language } = useTranslation();
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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
  // Own-request status management ("İsteği kapat/aç") or the "Yanıtla" CTA
  // — genuinely distinct from the like/comment/reply/share action row above
  // (Prompt has no equivalent of either), so it's not part of the "SADECE 4
  // aksiyon" row; only rendered when there's actually something to show.
  const showManagementAction = isOwnRequest ? !hasSelection : !isClosed;

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
        err instanceof Error ? err.message : t("common.errorGeneric"),
      );
    } finally {
      setIsSelecting(false);
    }
  }

  // Older references may have no stored dimensions (0) — fall back to 4:3 instead of NaN.
  const referenceRatio = live.referenceImage?.width && live.referenceImage.height
    ? clampedAspectRatio(live.referenceImage.width, live.referenceImage.height)
    : 4 / 3;

  const typeMeta = live.contentType ? CONTENT_TYPE_META[live.contentType] : null;

  return (
    <DetailShell
      aside={
        <DetailAside>
          <CreatorSummary creator={live.author} isOwn={isOwnRequest} />
          <ContributorsList answers={answers} />
          <RelatedRequests request={live} />
        </DetailAside>
      }
    >
      <article
        className={cn(
          "min-w-0 space-y-6 rounded-lg transition-colors duration-700",
          isRequestFlashed && "bg-primary/10 ring-1 ring-primary/40",
        )}
      >
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <ContentTypeLabel icon={Sparkles} label={t("request.title")} detail={typeMeta ? t(typeMeta.labelKey) : null} />
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant={STATUS_VARIANTS[live.status]}>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                {t(STATUS_LABELS[live.status])}
              </Badge>
              <PostMenu requestId={live.id} authorId={live.author.id} onDeleted={handleDeleted} />
            </div>
          </div>
          <DetailTitle>{live.title}</DetailTitle>
          <DetailByline person={live.author} createdAt={live.createdAt} language={language} />
        </header>

        {/*
          "Aksiyon satırı" (Prompt İsteği Aksiyon Satırı Son Düzenleme
          görevi) — SADECE 4 gerçek aksiyon, Prompt'un kendi action row'uyla
          aynı bileşenler/mantık: Beğeni · Yorum · Yanıt (gerçek yanıt
          sayısı — bu sayfada zaten aşağıda görünen "Yaratıcı Yanıtlar"
          bölümüne kaydırıyor, yeni bir davranış icat edilmedi), sonra HER
          ZAMAN en sağda Paylaş. Kart ile birebir aynı 4 öğe/sıra — hiçbir
          "Kopyala" yok (Prompt İsteği'ne özel olarak kaldırıldı, genel
          Prompt sistemindeki Kopyala butonuna dokunulmadı).
        */}
        <DetailActionBar trailing={<ShareTriggerButton target={{ contentType: "request", request: live }} label={t("common.share")} />}>
          <LikeButton id={live.id} likeCount={live.likeCount} contentType="request" size={18} />
          <CommentCountLink requestId={live.id} baseCount={live.commentCount} size={18} />
          <a
            href="#request-responses"
            className={contentActionClassName(false)}
            title={t("request.replies")}
            aria-label={`${t("request.replies")} (${formatCount(live.responseCount)})`}
          >
            <Reply size={18} strokeWidth={1.75} />
            <span aria-hidden>{formatCount(live.responseCount)}</span>
          </a>
          <StatisticsButton target={{ contentType: "request", contentId: live.id, likeCount: live.likeCount, commentCount: live.commentCount }} size={18} label={t("statistics.title")} />
          <RelationMapLink kind="request" id={live.id} />
        </DetailActionBar>

        <section aria-labelledby="request-brief-title" className="overflow-hidden rounded-xl border border-border-soft bg-surface-soft shadow-card">
          <div className="border-b border-border-soft px-4 py-3">
            <Eyebrow as="h2" id="request-brief-title" icon={SquareTerminal}>
              {t("request.title")}
            </Eyebrow>
          </div>
          <ScrollablePrompt className="px-4 py-4 text-[0.875rem] text-text">{live.description}</ScrollablePrompt>
        </section>

        {live.referenceImage && (
          <figure className="space-y-2">
            <button
              type="button"
              onClick={() => setLightboxIndex(0)}
              aria-label={t("media.viewFullscreen")}
              className="relative block w-full overflow-hidden rounded-xl border border-border-soft bg-surface-soft shadow-card"
              // Supporting preview, not a hero image: capped at ~480px tall (same as the prompt page).
              style={{
                aspectRatio: referenceRatio,
                maxWidth: `${Math.round(480 * referenceRatio)}px`,
              }}
            >
              <Image src={live.referenceImage.url} alt={live.referenceImage.alt} fill sizes="(min-width: 1024px) 720px, 100vw" className="object-cover" />
            </button>
            <figcaption className="text-caption text-text-muted">{t("request.referenceImage")}</figcaption>
            {live.media.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {live.media.slice(1).map((extra, index) => (
                  <button
                    key={extra.id}
                    type="button"
                    onClick={() => setLightboxIndex(index + 1)}
                    aria-label={t("media.viewFullscreen")}
                    className="h-16 w-16 overflow-hidden rounded-md border border-border-soft"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a small thumbnail strip */}
                    <img src={extra.url} alt={extra.alt} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </figure>
        )}
        {lightboxIndex !== null && (
          <ImageLightbox
            images={live.media.map((item) => ({ url: item.url, alt: item.alt }))}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}

        {live.creativeDirection && (
          <div className="rounded-r-lg border-l-2 border-primary bg-primary-soft/50 px-4 py-3.5">
            <Eyebrow tone="primary" className="mb-2">
              {t("request.creativeDirection")}
            </Eyebrow>
            <p className="font-serif text-[1.0625rem] leading-relaxed text-text">{live.creativeDirection}</p>
          </div>
        )}

        {live.contentType && <TaxonomyLinks contentType={live.contentType} category={live.category} subcategory={live.subcategory} />}

        <ToolLine label={t("tool.preferredLabel")} refs={live.tools} legacy={live.preferredTool} />

        <DetailTags tags={live.tags} />

        {showManagementAction && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-soft pt-4">
            {isOwnRequest ? (
              <Button type="button" variant="outline" size="sm" onClick={handleToggleStatus}>
                <MessageSquareOff size={14} />
                {isClosed ? t("request.markAsOpen") : t("request.closeRequest")}
              </Button>
            ) : (
              <Link href={`/create?answerRequest=${live.id}`} className={buttonClassName({ size: "sm", className: "h-9" })}>
                <PenLine size={14} />
                {t("request.reply")}
              </Link>
            )}
          </div>
        )}
        {!isOwnRequest && isClosed && (
          <p className="text-caption text-text-muted">{t("request.requestClosedNoNewReplies")}</p>
        )}
        {isOwnRequest && <EditHistoryPanel contentType="prompt_request" contentId={live.id} />}
      <section id="request-responses" className="scroll-mt-20 space-y-3">
        <h2 className="flex items-center gap-2 text-h2 text-text">
          {t("request.creativeReplies")}
          <span className="rounded-xs bg-surface-soft px-1.5 font-sans text-caption font-semibold tabular-nums text-text-muted">{answers.length}</span>
        </h2>
        {responseHighlightNotFound && (
          <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-muted">
            {t("request.replyNoLongerAvailable")}
          </p>
        )}
        {answers.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border py-8 text-center text-small text-text-muted">
            <p>{t("request.noRepliesYet")}</p>
            {!isClosed && !isOwnRequest && (
              <Link href={`/create?answerRequest=${live.id}`} className="font-medium text-primary underline">
                {t("request.beTheFirstToReply")}
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
                              <span className="text-xs text-text-muted">{t("request.confirmUnselect")}</span>
                              <button
                                type="button"
                                onClick={() => setSelectionTarget(null)}
                                className="text-xs font-medium text-text-muted hover:text-text"
                              >
                                {t("common.cancel")}
                              </button>
                              <button
                                type="button"
                                disabled={isSelecting}
                                onClick={() => confirmSelection(null)}
                                className="text-xs font-medium text-danger hover:underline"
                              >
                                {t("request.unselectReply")}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectionTarget({ id: prompt.id, confirming: true })}
                              className="text-xs font-medium text-text-muted hover:text-text"
                            >
                              {t("request.unselectReply")}
                            </button>
                          )}
                        </>
                      ) : isPendingThis ? (
                        <>
                          <span className="text-xs text-text-muted">{t("request.confirmSelect")}</span>
                          <button
                            type="button"
                            onClick={() => setSelectionTarget(null)}
                            className="text-xs font-medium text-text-muted hover:text-text"
                          >
                            {t("common.cancel")}
                          </button>
                          <button
                            type="button"
                            disabled={isSelecting}
                            onClick={() => confirmSelection(prompt.id)}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {t("request.selectReply")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectionTarget({ id: prompt.id, confirming: true })}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {t("request.selectReply")}
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

      <DetailComments>
        {/*
          Kapalı bir istekte de yorumlar/yanıtlar AÇIK kalmalı — "kapalı"
          yalnızca isteğin yeni bir tam yanıt (Prompt) kabul etmediği
          anlamına geliyor (yukarıdaki "Yanıtla" linki/`validate_prompt_
          response_target` sunucu kontrolü), yorum sistemine hiç dokunmuyor.
          `PromptDetailView` de zaten hiç `disabledReason` geçirmiyor —
          burası da artık aynı, koşulsuz davranışı kullanıyor.
        */}
        <CommentSection target={{ requestId: live.id }} highlightCommentId={highlightCommentId} />
      </DetailComments>
      </article>
    </DetailShell>
  );
}

/** Distinct authors of the real replies loaded above — no extra query, nothing rendered until there is at least one. */
function ContributorsList({ answers }: { answers: Prompt[] }) {
  const { t } = useTranslation();
  const authors = Array.from(new Map(answers.map((a) => [a.author.id, a.author])).values());
  if (authors.length === 0) return null;
  return (
    <AsideSection id="request-contributors-title" title={t("request.contributors")}>
      <ul className="divide-y divide-border-soft">
        {authors.slice(0, 6).map((author) => (
          <li key={author.id}>
            <Link href={profileHref(author)} className="group flex items-center gap-2.5 px-3.5 py-2.5 transition-colors duration-200 hover:bg-surface-soft">
              <Avatar src={author.avatarUrl} alt={author.displayName} size={28} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-label font-semibold text-text transition-colors group-hover:text-primary">{author.displayName}</span>
                <span className="block truncate text-caption text-text-muted">@{author.username}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AsideSection>
  );
}
