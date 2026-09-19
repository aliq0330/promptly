"use client";

import Link from "next/link";
import { Repeat2, Sparkles } from "lucide-react";
import { getPromptById } from "@/mocks/prompts";
import { useRequests } from "@/features/requests/requests-provider";
import { promptHref, requestHref } from "@/lib/utils";
import type { Prompt } from "@/types";

/**
 * Makes the origin relationship visible on the card itself — either a
 * remix of another prompt, or something derived from a request response
 * (CLAUDE.md section 1: both count as remix-style origins whose chain
 * must stay visible). Uses `useRequests()` (mock + local merge) instead of
 * the mock-only `getRequestById` so a real answer's origin banner correctly
 * names and links to a locally-created request too.
 */
export function RemixSourceLink({ origin }: { origin: Exclude<Prompt["origin"], { type: "original" }> }) {
  const { getRequestById } = useRequests();

  if (origin.type === "remix") {
    const originalPrompt = getPromptById(origin.sourcePromptId);
    return (
      <Link
        href={promptHref({ id: origin.sourcePromptId })}
        className="relative z-10 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
      >
        <Repeat2 size={12} className="shrink-0" />
        <span className="line-clamp-1">
          {originalPrompt ? `"${originalPrompt.title}" içeriğinden remix` : "Bir prompttan remixlendi"}
        </span>
      </Link>
    );
  }

  const request = getRequestById(origin.requestId);
  return (
    <Link
      href={requestHref({ id: origin.requestId })}
      className="relative z-10 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
    >
      <Sparkles size={12} className="shrink-0" />
      <span className="line-clamp-1">
        {request ? `"${request.title}" isteğine verilen yanıttan` : "Bir istek yanıtından türetildi"}
      </span>
    </Link>
  );
}
