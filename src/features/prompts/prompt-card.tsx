import { ImagePromptCard } from "./image-prompt-card";
import { TextPromptCard } from "./text-prompt-card";
import type { Prompt } from "@/types";

/** Dispatches to the card shape appropriate for the prompt's content type. */
export function PromptCard({ prompt, onDeleted }: { prompt: Prompt; onDeleted?: () => void }) {
  if (prompt.contentType === "image") {
    return <ImagePromptCard prompt={prompt} onDeleted={onDeleted} />;
  }
  return <TextPromptCard prompt={prompt} onDeleted={onDeleted} />;
}
