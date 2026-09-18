import { ImagePromptCard } from "./image-prompt-card";
import { TextPromptCard } from "./text-prompt-card";
import type { Prompt } from "@/types";

/** Dispatches to the card shape appropriate for the prompt's content type. */
export function PromptCard({ prompt }: { prompt: Prompt }) {
  if (prompt.contentType === "image") {
    return <ImagePromptCard prompt={prompt} />;
  }
  return <TextPromptCard prompt={prompt} />;
}
