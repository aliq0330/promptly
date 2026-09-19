"use client";

import { formatCount } from "@/lib/utils";
import { useLocalPrompts } from "@/features/prompts/local-prompts-provider";

/**
 * Response count that reflects genuinely-published local answers on top of
 * the mock's static responseCount — same optimistic-adjustment idea used
 * for likes/comments elsewhere in the app.
 */
export function RequestResponseCount({ requestId, baseCount }: { requestId: string; baseCount: number }) {
  const { getForRequest } = useLocalPrompts();
  const count = baseCount + getForRequest(requestId).length;
  return <span className="shrink-0 text-xs text-text-muted">{formatCount(count)} yanıt</span>;
}
