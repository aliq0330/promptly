import { PromptCard } from "./prompt-card";
import { GeneratorCard } from "@/features/generators/generator-card";
import type { Generator, Prompt } from "@/types";

type PromptGridProps = { prompts: Prompt[]; generators?: never } | { generators: Generator[]; prompts?: never };

/**
 * CSS multi-column masonry: each card keeps its own natural height instead
 * of being stretched to match the tallest card in a CSS Grid row (the
 * cause of the large empty gaps under short cards on tablet/desktop).
 * `break-inside-avoid` stops a card from being split across two columns.
 * Pure CSS — reflows correctly on resize/orientation change with no JS
 * measurement needed.
 *
 * Pass exactly one of `prompts`/`generators` — a generator list (Bölüm
 * 9.36's Prompt/Generator parity pass: `/generators`, search's generator
 * section, a collection's mixed content) uses this SAME masonry, not a
 * separate CSS grid with its own, inconsistent column/gap values.
 */
export function PromptGrid(props: PromptGridProps) {
  const items: { key: string; node: React.ReactNode }[] = props.generators
    ? props.generators.map((generator) => ({ key: generator.id, node: <GeneratorCard generator={generator} /> }))
    : props.prompts.map((prompt) => ({ key: prompt.id, node: <PromptCard prompt={prompt} /> }));

  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">
        {props.generators ? "Henüz gösterilecek generator yok." : "Henüz gösterilecek prompt yok."}
      </p>
    );
  }

  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
      {items.map((item) => (
        <div key={item.key} className="mb-4 break-inside-avoid">
          {item.node}
        </div>
      ))}
    </div>
  );
}
