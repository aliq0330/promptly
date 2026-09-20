"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Sparkles, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { promptHref, requestHref } from "@/lib/utils";
import type { Prompt, PromptRequest } from "@/types";

const CARD_CLASS =
  "block w-56 space-y-1.5 rounded-md border border-border bg-surface p-2.5 text-left transition-colors hover:bg-accent-surface/60";

/** A message's shared-prompt content card — a real prompt, or "Bu içerik artık mevcut değil" for one that's gone/emptied (Bölüm 9.7's safe-delete). */
export function SharedPromptCard({ promptId }: { promptId: string }) {
  const { getCached, fetchById } = useRealPrompts();
  const cached = getCached(promptId);
  const [fetched, setFetched] = useState<Prompt | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchById(promptId).then((result) => {
      if (!cancelled && result) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, Boolean(cached)]);

  const prompt = cached ?? fetched;
  const thumbnail = prompt?.media[0];
  const unavailable = prompt?.deletedAt;

  if (unavailable) {
    return (
      <div className={CARD_CLASS}>
        <span className="text-xs text-text-muted">Bu içerik artık mevcut değil.</span>
      </div>
    );
  }

  return (
    <Link href={promptHref({ id: promptId })} className={CARD_CLASS}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Terminal size={13} />
        Paylaşılan Prompt
      </span>
      {thumbnail && (
        <span className="relative block h-24 w-full overflow-hidden rounded-sm bg-background">
          <Image src={thumbnail.url} alt={thumbnail.alt} fill sizes="220px" className="object-cover" />
        </span>
      )}
      <span className="block truncate text-sm font-semibold text-text">{prompt?.title ?? "Yükleniyor…"}</span>
      <span className="flex items-center gap-1 text-xs text-primary">
        İçeriği aç
        <ArrowUpRight size={11} />
      </span>
    </Link>
  );
}

/** A message's shared-request content card — same shape as `SharedPromptCard`. */
export function SharedRequestCard({ requestId }: { requestId: string }) {
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

  return (
    <Link href={requestHref({ id: requestId })} className={CARD_CLASS}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles size={13} />
          Paylaşılan İstek
        </span>
        {request && <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>}
      </span>
      <span className="block truncate text-sm font-semibold text-text">
        {request ? `"${request.title}"` : "Yükleniyor…"}
      </span>
      <span className="flex items-center gap-1 text-xs text-primary">
        İsteği görüntüle
        <ArrowUpRight size={11} />
      </span>
    </Link>
  );
}
