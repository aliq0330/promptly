"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Blocks, Sparkles, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useRealGenerators } from "@/features/generators/real-generators-provider";
import { fetchGeneratorBySlug } from "@/lib/supabase/generators";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { generatorHref, promptHref, requestHref } from "@/lib/utils";
import type { Generator, Prompt, PromptRequest } from "@/types";

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

/**
 * A message's shared-generator content card — same shape/behavior as
 * `SharedPromptCard`, except it's found by SLUG (a generator's real
 * route, `generatorHref`) rather than an id, and looked up client-side
 * from `parseGeneratorShareBody`'s recognized plain-text pattern instead
 * of a database column (Bölüm 9.52 — a generator has no `shared_
 * generator_id` in `messages`). `useRealGenerators()`'s own cache is
 * searched by slug first (no new provider), falling back to a real fetch.
 */
export function SharedGeneratorCard({ slug }: { slug: string }) {
  const { realGenerators } = useRealGenerators();
  const cached = realGenerators.find((generator) => generator.slug === slug);
  const [fetched, setFetched] = useState<Generator | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchGeneratorBySlug(slug).then((result) => {
      if (!cancelled && result) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, Boolean(cached)]);

  const generator = cached ?? fetched;

  return (
    <Link href={generatorHref({ slug })} className={CARD_CLASS}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Blocks size={13} />
        Paylaşılan Generator
      </span>
      <span className="block truncate text-sm font-semibold text-text">{generator?.title ?? "Yükleniyor…"}</span>
      <span className="flex items-center gap-1 text-xs text-primary">
        Generatoru aç
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
