import { ImagePromptCard } from "./image-prompt-card";
import { TextPromptCard } from "./text-prompt-card";
import type { Prompt } from "@/types";

type CollectionRemoval = { isDefault: boolean; onRemove: () => Promise<void> };

/** Dispatches to the card shape appropriate for the prompt's content type. */
export function PromptCard({
  prompt,
  onDeleted,
  collectionRemoval,
}: {
  prompt: Prompt;
  onDeleted?: () => void;
  /** Only passed by a collection's own detail page — see PostMenu. */
  collectionRemoval?: CollectionRemoval;
}) {
  if (prompt.contentType === "image") {
    return <ImagePromptCard prompt={prompt} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />;
  }
  return <TextPromptCard prompt={prompt} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />;
}
