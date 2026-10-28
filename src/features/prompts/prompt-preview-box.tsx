"use client";

import { CopyPromptButton } from "./copy-prompt-button";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { cn, formatCount } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Prompt } from "@/types";

/**
 * The prompt block — Promptly's signature element. The literal prompt text
 * is always shown in the same calm monospace panel (`prompt-text` utility),
 * so on every card the thing you actually copy is visually distinct from
 * the title/description written about it. Shared by every prompt card
 * (and a request response, which is the same `prompts` row shape).
 * `CopyPromptButton` always copies the real, full `promptText`, never this
 * block's clamped display text.
 *
 * Meydan (docs/history/190-*): a borderless soft panel headed "PROMPT · <tool>",
 * with the real use count (`copy_count`) and a bare "Kopyala" on the right.
 */
export function PromptPreviewBox({ prompt, lines = 4, variant = "panel" }: { prompt: Prompt; lines?: 3 | 4 | 6; variant?: "panel" | "art" }) {
  const { t } = useTranslation();
  const tool = resolveToolRefs(prompt.tools)[0]?.label ?? prompt.tool;
  if (variant === "art") {
    // The visual card's art for a prompt without a picture: the prompt itself, in the platform's signature mono, filling the
    // picture box on the quiet brand tint and fading out where a long prompt is cut off. The type glyph in the card's corner
    // and the title on hover say the rest.
    return (
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-primary-soft px-5 py-6">
        <p className="prompt-text h-full overflow-hidden break-words whitespace-pre-line text-text [mask-image:linear-gradient(#000_60%,transparent_100%)]">
          {prompt.promptText}
        </p>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-soft">
      <div className="flex items-center gap-2 pl-3.5 pr-1.5 pt-2">
        <span className="min-w-0 flex-1 truncate text-caption font-semibold uppercase tracking-[0.06em] text-text-secondary">
          Prompt{tool ? <span className="normal-case tracking-normal text-text-muted"> · {tool}</span> : null}
        </span>
        {prompt.copyCount > 0 && (
          <span className="shrink-0 text-caption tabular-nums text-text-muted">{t("prompt.usesShort", { count: formatCount(prompt.copyCount) })}</span>
        )}
        <CopyPromptButton text={prompt.promptText} promptId={prompt.id} variant="link" />
      </div>
      {/* Padding lives on the wrapper: padding on the clamped element itself
          would reveal part of the next (clamped-away) line. */}
      <div className="px-3.5 pb-3 pt-1">
        <p
          className={cn(
            "prompt-text break-words whitespace-pre-line text-text-secondary",
            lines === 3 && "line-clamp-3",
            lines === 4 && "line-clamp-4",
            lines === 6 && "line-clamp-6",
          )}
        >
          {prompt.promptText}
        </p>
      </div>
    </div>
  );
}
