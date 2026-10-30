"use client";

import { RunButton } from "@/features/content/run-with-ai";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { PromptTryButton } from "@/features/prompts/prompt-try-sheet";
import { OpenInStudioButton } from "@/features/studio/open-in-studio-button";
import { buttonClassName } from "@/components/ui/button";
import type { Prompt } from "@/types";

/** The quiet gray buttons next to the joined pill — same height as the pill, no border. */
const SOFT = "h-11 flex-1 bg-surface-soft px-4 text-label text-text hover:bg-border-soft sm:flex-none [&_svg]:text-primary";

/**
 * The actions under a prompt's text (docs/history/229-*): ONE joined primary pill — Kopyala | Çalıştır (both hand the text out of Promptly) —
 * and two quiet buttons for trying it inside Promptly: Studio'da aç and Hazır ayarla dene (a sheet; nothing preset-related is drawn on the page).
 * Düzenleme öner lives in the ⋮ menu (docs/history/279-*), not here.
 */
export function PromptActions({ prompt, text }: { prompt: Prompt; text: string }) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex w-full divide-x divide-primary-foreground/30 overflow-hidden rounded-full bg-primary shadow-xs sm:w-auto">
        <CopyPromptButton text={text} promptId={prompt.id} variant="segment" size="md" />
        <RunButton text={text} recommendedRefs={prompt.tools} promptId={prompt.id} variant="segment" />
      </div>
      <div className="flex gap-2.5">
        <OpenInStudioButton kind="prompt" id={prompt.id} quiet className={SOFT} />
        <PromptTryButton prompt={prompt} text={text} className={buttonClassName({ variant: "ghost", size: "md", className: `${SOFT} gap-2 font-semibold` })} />
      </div>
    </div>
  );
}
