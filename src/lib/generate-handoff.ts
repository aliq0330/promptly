/**
 * Hand-off from the Üret page to the Prompt create form ("Prompt olarak
 * yayınla"). An image can't travel in a URL, so it is parked in sessionStorage
 * for one navigation and consumed (removed) as soon as the form reads it.
 */
const KEY = "promptly-generate-handoff";

export interface GenerateHandoff {
  contentType: "image" | "text";
  promptText: string;
  toolId: string;
  /** `data:` URL of the generated image (image results only). */
  imageUrl?: string;
  width?: number;
  height?: number;
  /** Text results: the generated text is the prompt text itself. */
}

export function stashHandoff(data: GenerateHandoff): boolean {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    // Quota (a very large image) or storage blocked.
    return false;
  }
}

export function takeHandoff(): GenerateHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as GenerateHandoff;
    if (!parsed || typeof parsed.promptText !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
