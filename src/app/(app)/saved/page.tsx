"use client";

import { PromptGrid } from "@/features/prompts/prompt-grid";
import { useSave } from "@/features/prompts/like-save-provider";
import { mockPrompts } from "@/mocks/prompts";

export default function SavedPage() {
  const { isSaved } = useSave();
  const saved = mockPrompts.filter((prompt) => isSaved(prompt.id));

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Kaydedilenler</h1>
      {saved.length === 0 ? (
        <p className="py-12 text-center text-sm text-text-muted">
          Henüz hiçbir şey kaydetmedin. Bir prompt kartındaki kaydet ikonuna tıklayarak buraya
          ekleyebilirsin.
        </p>
      ) : (
        <PromptGrid prompts={saved} />
      )}
    </div>
  );
}
