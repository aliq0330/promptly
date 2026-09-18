"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, MessageSquareOff, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PromptCard } from "@/features/prompts/prompt-card";
import { CommentSection } from "@/features/prompts/comment-section";
import { useLocalPrompts } from "@/features/prompts/local-prompts-provider";
import { ResponseCard } from "./response-card";
import { useRequests } from "./requests-provider";
import { getResponsesForRequest } from "@/mocks/request-responses";
import { formatRelativeTime } from "@/lib/utils";
import type { PromptRequest } from "@/types";

const STATUS_LABELS: Record<PromptRequest["status"], string> = {
  open: "Açık",
  answered: "Yanıtlandı",
  closed: "Kapandı",
};

/**
 * Shared request detail rendering — used by both `/requests/[id]` (known
 * mock requests, server-rendered) and `/requests/local` (requests created
 * in this browser, which have no static page since their ids don't exist
 * at build time; see `requestHref()` in lib/utils.ts, same reasoning as
 * `PromptDetailView`/`/prompts/local`).
 */
export function RequestDetailView({ request }: { request: PromptRequest }) {
  const router = useRouter();
  const { getForRequest } = useLocalPrompts();
  const { updateStatus, deleteRequest, selectResponse, getRequestById } = useRequests();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Re-read the live version of the request from the provider so status/
  // selection changes below reflect immediately without a page reload.
  const live = getRequestById(request.id) ?? request;

  const legacyResponses = getResponsesForRequest(live.id);
  const localAnswers = getForRequest(live.id);
  const totalAnswers = legacyResponses.length + localAnswers.length;

  const isOwnRequest = live.author.id === "me";
  const canManage = isOwnRequest && live.id.startsWith("local-req-");
  const isClosed = live.status === "closed";

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    deleteRequest(live.id);
    router.push("/requests");
  }

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text">{live.title}</h1>
          <Badge>{STATUS_LABELS[live.status]}</Badge>
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
          {canManage ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateStatus(live.id, isClosed ? "open" : "closed")}
              >
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
        </div>
        {!canManage && isClosed && (
          <p className="text-xs text-text-muted">
            Bu istek kapatıldığı için yeni yanıt kabul edilmiyor.
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text">Yaratıcı Yanıtlar ({totalAnswers})</h2>
        {totalAnswers === 0 ? (
          <div className="space-y-3 py-6 text-center text-sm text-text-muted">
            <p>Bu isteğe henüz yanıt verilmedi.</p>
            {!isClosed && !canManage && (
              <Link href={`/create?answerRequest=${live.id}`} className="font-medium text-primary underline">
                İlk yanıtı sen ver
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {localAnswers.map((prompt) => (
              <div key={prompt.id} className="space-y-2">
                <PromptCard prompt={prompt} />
                {canManage && (
                  <div className="flex items-center gap-2 px-1">
                    {live.selectedResponsePromptId === prompt.id ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-primary">
                        <CheckCircle2 size={14} />
                        Seçilen yanıt
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selectResponse(live.id, prompt.id)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Yanıtı seç
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {legacyResponses.map((response) => (
              <ResponseCard key={response.id} response={response} />
            ))}
          </div>
        )}
      </section>

      <CommentSection
        target={{ requestId: live.id }}
        disabledReason={isClosed ? "Bu istek kapatıldığı için yeni yorum eklenemiyor." : undefined}
      />
    </div>
  );
}
