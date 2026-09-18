import { PromptCard } from "./prompt-card";
import type { Prompt } from "@/types";

/**
 * CSS multi-column masonry: each card keeps its own natural height instead
 * of being stretched to match the tallest card in a CSS Grid row (the
 * cause of the large empty gaps under short cards on tablet/desktop).
 * `break-inside-avoid` stops a card from being split across two columns.
 * Pure CSS — reflows correctly on resize/orientation change with no JS
 * measurement needed.
 */
export function PromptGrid({ prompts }: { prompts: Prompt[] }) {
  if (prompts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">Henüz gösterilecek prompt yok.</p>
    );
  }

  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
      {prompts.map((prompt) => (
        <div key={prompt.id} className="mb-4 break-inside-avoid">
          <PromptCard prompt={prompt} />
        </div>
      ))}
    </div>
  );
}
