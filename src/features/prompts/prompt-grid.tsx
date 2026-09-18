import { PromptCard } from "./prompt-card";
import type { Prompt } from "@/types";

export function PromptGrid({ prompts }: { prompts: Prompt[] }) {
  if (prompts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">Henüz gösterilecek prompt yok.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {prompts.map((prompt) => (
        <PromptCard key={prompt.id} prompt={prompt} />
      ))}
    </div>
  );
}
