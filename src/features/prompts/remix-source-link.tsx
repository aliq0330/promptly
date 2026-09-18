import Link from "next/link";
import { Repeat2 } from "lucide-react";
import { getPromptById } from "@/mocks/prompts";
import type { Prompt } from "@/types";

/** Makes the original-vs-remix relationship visible on the card itself. */
export function RemixSourceLink({ origin }: { origin: Extract<Prompt["origin"], { type: "remix" }> }) {
  const originalPrompt = getPromptById(origin.sourcePromptId);

  return (
    <Link
      href={`/prompts/${origin.sourcePromptId}`}
      className="relative z-10 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
    >
      <Repeat2 size={12} className="shrink-0" />
      <span className="line-clamp-1">
        {originalPrompt ? `"${originalPrompt.title}" içeriğinden remix` : "Bir prompttan remixlendi"}
      </span>
    </Link>
  );
}
