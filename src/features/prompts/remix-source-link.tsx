"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Repeat2, Sparkles } from "lucide-react";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { promptHref, requestHref } from "@/lib/utils";
import type { Prompt } from "@/types";

/**
 * Makes the origin relationship visible on the card itself — either a
 * remix of another real prompt, or something derived from a real request
 * response. Uses the same cache-then-fetch pattern as `PromptDetailView`'s
 * remix chain: cheap when the source is already loaded (e.g. it's in the
 * same feed batch), a live fetch otherwise.
 */
export function RemixSourceLink({ origin }: { origin: Exclude<Prompt["origin"], { type: "original" }> }) {
  const { getCached: getCachedPrompt, fetchById: fetchPromptById } = useRealPrompts();
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();

  const sourceId = origin.type === "remix" ? origin.sourcePromptId : origin.requestId;
  const cached = origin.type === "remix" ? getCachedPrompt(sourceId) : getCachedRequest(sourceId);
  const [fetched, setFetched] = useState<{ title: string } | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    const fetcher = origin.type === "remix" ? fetchPromptById(sourceId) : fetchRequestById(sourceId);
    fetcher.then((result) => {
      if (!cancelled && result) setFetched({ title: result.title });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.type, sourceId, Boolean(cached)]);

  const title = cached?.title ?? fetched?.title;

  if (origin.type === "remix") {
    return (
      <Link
        href={promptHref({ id: origin.sourcePromptId })}
        className="relative z-10 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
      >
        <Repeat2 size={12} className="shrink-0" />
        <span className="line-clamp-1">{title ? `"${title}" içeriğinden remix` : "Bir prompttan remixlendi"}</span>
      </Link>
    );
  }

  return (
    <Link
      href={requestHref({ id: origin.requestId })}
      className="relative z-10 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
    >
      <Sparkles size={12} className="shrink-0" />
      <span className="line-clamp-1">
        {title ? `"${title}" isteğine verilen yanıttan` : "Bir istek yanıtından türetildi"}
      </span>
    </Link>
  );
}
