export type AiProvider = "gemini" | "openai";
export type AiKind = "text" | "image";

export const AI_PROVIDERS: readonly AiProvider[] = ["gemini", "openai"];

export interface AiModel {
  id: string;
  label: string;
}

/** One generated item: text, or an image as a `data:` URL (always base64, so it can be published as a real file). */
export interface AiOutput {
  kind: AiKind;
  text?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
}

export type AiErrorKind = "invalid_key" | "quota" | "network" | "blocked" | "model" | "empty" | "unknown";

export class AiError extends Error {
  kind: AiErrorKind;
  constructor(kind: AiErrorKind, message = "") {
    super(message);
    this.kind = kind;
  }
}

/** Safe fallbacks shown until (or if) the provider's own model list loads. */
export const FALLBACK_MODELS: Record<AiProvider, Record<AiKind, AiModel[]>> = {
  gemini: {
    text: [
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
    ],
    image: [{ id: "gemini-2.5-flash-image", label: "gemini-2.5-flash-image" }],
  },
  openai: {
    text: [
      { id: "gpt-4.1", label: "gpt-4.1" },
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
    ],
    image: [{ id: "gpt-image-1", label: "gpt-image-1" }],
  },
};

/** Promptly's own tool id (src/lib/ai-tool-catalog.ts) for a provider/kind, used when publishing a result. */
export function toolIdFor(provider: AiProvider, kind: AiKind): string {
  if (provider === "gemini") return kind === "image" ? "nano-banana" : "gemini";
  return kind === "image" ? "gpt-image" : "chatgpt";
}
