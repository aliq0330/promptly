import type { Preset, Prompt, PromptMedia, PromptRequest, Workflow } from "@/types";

export type ImageSource =
  | { kind: "prompt"; data: Prompt }
  | { kind: "request"; data: PromptRequest }
  | { kind: "workflow"; data: Workflow }
  | { kind: "preset"; data: Preset };

/**
 * The still picture a piece of content shows on its card, if it has one — what an Albüm band/collage takes its colours
 * from (docs/history/203-*). A video/audio prompt's output file is not a still picture, so it counts as none.
 */
export function contentImage(source: ImageSource): PromptMedia | null {
  if (source.kind === "prompt") return source.data.contentType === "image" ? (source.data.media[0] ?? null) : null;
  if (source.kind === "request") return source.data.media[0] ?? null;
  if (source.kind === "workflow") return source.data.media[0] ?? null;
  return source.data.coverUrl ? { id: `${source.data.id}-cover`, url: source.data.coverUrl, width: 4, height: 3, alt: "" } : null;
}
