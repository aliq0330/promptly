import { PromptGrid } from "@/features/prompts/prompt-grid";
import { mockPrompts } from "@/mocks/prompts";

// Placeholder "saved" selection until prompt_saves exists (CLAUDE.md section 6).
const SAVED_PROMPT_IDS = new Set(["p3", "p5", "p7", "p11", "p15"]);

export default function SavedPage() {
  const saved = mockPrompts.filter((prompt) => SAVED_PROMPT_IDS.has(prompt.id));

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Kaydedilenler</h1>
      <PromptGrid prompts={saved} />
    </div>
  );
}
