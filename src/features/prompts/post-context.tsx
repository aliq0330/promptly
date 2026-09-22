"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Blocks, CheckCircle2, CornerUpRight, GitBranch } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { generatorHref, promptHref, requestHref } from "@/lib/utils";
import type { Prompt, PromptRequest } from "@/types";

/**
 * Lavender, left-bar-accented "this post is derived from something else"
 * boxes shown right under the post header, before the post's own title —
 * one for a remix's source prompt, one for a request response's request.
 * Both fetch the referenced row via the same cache-then-fetch pattern as
 * the rest of the app (cheap when it's already in the feed's own batch, a
 * real fetch otherwise) — replaces the old plain-text `RemixSourceLink`.
 */
function ContextBox({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative z-10 block space-y-2 rounded-md border-l-4 border-primary bg-accent-surface/70 p-3 transition-colors hover:bg-accent-surface"
    >
      {children}
    </Link>
  );
}

/** Only rendered by a card that already checked `prompt.origin.type === "remix"`. */
export function RemixContext({ sourcePromptId }: { sourcePromptId: string }) {
  const { getCached, fetchById } = useRealPrompts();
  const cached = getCached(sourcePromptId);
  const [fetched, setFetched] = useState<Prompt | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchById(sourcePromptId).then((result) => {
      if (!cancelled && result) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePromptId, Boolean(cached)]);

  const source = cached ?? fetched;
  const thumbnail = source?.media[0];

  if (source?.deletedAt) {
    return (
      <ContextBox href={promptHref({ id: sourcePromptId })}>
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <GitBranch size={14} />
          Türetilen çalışma
        </span>
        <span className="block text-sm text-text-muted">Bu paylaşım silindi.</span>
      </ContextBox>
    );
  }

  return (
    <ContextBox href={promptHref({ id: sourcePromptId })}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <GitBranch size={14} />
        Türetilen çalışma
      </span>
      <span className="flex items-center gap-3">
        {thumbnail && (
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface">
            <Image src={thumbnail.url} alt={thumbnail.alt} fill sizes="48px" className="object-cover" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-text">
            {source?.title ?? "Bir prompt"}
          </span>
          {source && (
            <span className="block truncate text-xs text-text-muted">
              {source.author.displayName} tarafından paylaşıldı
            </span>
          )}
        </span>
      </span>
      <span className="flex items-center gap-1 text-xs font-medium text-primary">
        Orijinal gönderiyi gör
        <ArrowUpRight size={12} />
      </span>
    </ContextBox>
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

  return (
    <ContextBox href={requestHref({ id: requestId })}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <CornerUpRight size={14} />
          Bir isteğe yanıt
        </span>
        {request && <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>}
      </span>

      <span className="block text-sm font-semibold text-text">&ldquo;{request?.title ?? "Bir istek"}&rdquo;</span>

      {isSelected && (
        <span className="flex w-fit items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
          <CheckCircle2 size={12} />
          Bu yanıt seçildi
        </span>
      )}

      {request && (
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <Avatar src={request.author.avatarUrl} alt={request.author.displayName} size={18} />
          {request.author.displayName} tarafından oluşturulan prompt isteğine yanıt verildi.
        </span>
      )}

      <span className="flex items-center gap-1 text-xs font-medium text-primary">
        İsteği görüntüle
        <ArrowUpRight size={12} />
      </span>
    </ContextBox>
  );
}

/**
 * "Generated with [Generator]" (Generator Builder module's own §21-24
 * bridge) — only rendered by a card whose `prompt.generatedFrom` is set.
 * Unlike `RemixContext`/`RequestResponseContext`, no cache-then-fetch is
 * needed: `generatedFrom` already carries the generator's real title/slug
 * directly on the prompt row (`createRealPrompt`'s own denormalized
 * columns), so this never needs a second network round trip just to show
 * which generator produced this prompt.
 */
export function GeneratorSourceContext({ generatedFrom }: { generatedFrom: NonNullable<Prompt["generatedFrom"]> }) {
  return (
    <ContextBox href={generatorHref({ slug: generatedFrom.generatorSlug })}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Blocks size={14} />
        Generator ile oluşturuldu
      </span>
      <span className="block truncate text-sm font-semibold text-text">&ldquo;{generatedFrom.generatorTitle}&rdquo;</span>
      <span className="flex items-center gap-1 text-xs font-medium text-primary">
        Generatoru gör
        <ArrowUpRight size={12} />
      </span>
    </ContextBox>
  );
}
