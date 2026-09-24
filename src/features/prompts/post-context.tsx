"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Blocks, CheckCircle2, CornerUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { generatorHref, requestHref } from "@/lib/utils";
import type { Prompt, PromptRequest } from "@/types";

/**
 * Compact, quiet "this post is derived from something else" box shown
 * right under the post header, before the post's own title — a
 * request response's request. Fetches the referenced row via the same
 * cache-then-fetch pattern as the rest of the app (cheap when it's already
 * in the feed's own batch, a real fetch otherwise). Remix was fully
 * removed from this platform (kullanıcının açık talebi) — the sibling
 * `RemixContext` box this file used to also export is gone.
 */
function ContextBox({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group/ctx relative z-10 block space-y-1 rounded-md border border-border-soft bg-surface-soft px-3 py-2.5 transition-colors duration-200 hover:border-border"
    >
      {children}
    </Link>
  );
}

/** Only rendered by a card that already checked `prompt.origin.type === "request-response"`. */
export function RequestResponseContext({
  requestId,
  currentPromptId,
}: {
  requestId: string;
  /** This response's own prompt id — compared against the request's `selectedResponsePromptId` for the "Bu yanıt seçildi" tag. */
  currentPromptId: string;
}) {
  const { getCached, fetchById } = useRealRequests();
  const cached = getCached(requestId);
  const [fetched, setFetched] = useState<PromptRequest | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchById(requestId).then((result) => {
      if (!cancelled && result) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, Boolean(cached)]);

  const request = cached ?? fetched;
  const isSelected = request?.selectedResponsePromptId === currentPromptId;

  if (request?.deletedAt) {
    return (
      <ContextBox href={requestHref({ id: requestId })}>
        <span className="flex items-center gap-1.5 text-caption font-medium text-text-muted">
          <CornerUpRight size={13} />
          Bir isteğe yanıt
        </span>
        <span className="block text-small text-text-muted">Bu istek silindi.</span>
      </ContextBox>
    );
  }

  return (
    <ContextBox href={requestHref({ id: requestId })}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-caption font-medium text-text-muted">
          <CornerUpRight size={13} className="shrink-0 text-primary" />
          <span className="truncate">
            Bir isteğe yanıt
            {request && <> · {request.author.displayName}</>}
          </span>
        </span>
        {request && <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>}
      </span>

      <span className="flex items-center gap-1 text-label font-semibold text-text">
        <span className="truncate">{request?.title ?? "Bir istek"}</span>
        <ArrowUpRight size={13} className="shrink-0 text-text-muted transition-colors group-hover/ctx:text-primary" />
      </span>

      {isSelected && (
        <span className="mt-1 flex w-fit items-center gap-1 rounded-xs bg-success/12 px-2 py-0.5 text-caption font-medium text-success">
          <CheckCircle2 size={12} />
          Bu yanıt seçildi
        </span>
      )}
    </ContextBox>
  );
}

/**
 * "Generated with [Generator]" (Generator Builder module's own §21-24
 * bridge) — only rendered by a card whose `prompt.generatedFrom` is set.
 * Unlike `RequestResponseContext`, no cache-then-fetch is needed:
 * `generatedFrom` already carries the generator's real title/slug directly
 * on the prompt row (`createRealPrompt`'s own denormalized columns), so
 * this never needs a second network round trip just to show which
 * generator produced this prompt.
 */
export function GeneratorSourceContext({ generatedFrom }: { generatedFrom: NonNullable<Prompt["generatedFrom"]> }) {
  return (
    <ContextBox href={generatorHref({ slug: generatedFrom.generatorSlug })}>
      <span className="flex items-center gap-1.5 text-caption font-medium text-text-muted">
        <Blocks size={13} className="shrink-0 text-primary" />
        Generator ile oluşturuldu
      </span>
      <span className="flex items-center gap-1 text-label font-semibold text-text">
        <span className="truncate">{generatedFrom.generatorTitle}</span>
        <ArrowUpRight size={13} className="shrink-0 text-text-muted transition-colors group-hover/ctx:text-primary" />
      </span>
    </ContextBox>
  );
}
