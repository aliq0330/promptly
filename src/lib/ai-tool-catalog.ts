/**
 * Central catalog of AI tools/models a creator can *recommend* on a prompt,
 * prompt request or generator. Pure metadata — nothing here calls a model.
 * Tool and model names are brand names, so they are never translated.
 *
 * A selection is stored as a plain string: `"<toolId>"` or
 * `"<toolId>:<modelId>"`. Old rows have no selection (empty array) and keep
 * working; a legacy free-text `tool` column is only a display fallback.
 */
import type { ContentTypeId } from "@/lib/content-taxonomy";

export interface AiToolModel {
  id: string;
  name: string;
}

export interface AiTool {
  id: string;
  name: string;
  provider: string;
  /** Content types this tool belongs to. */
  types: ContentTypeId[];
  /** Only suggested when this text category is chosen (e.g. coding tools). */
  category?: string;
  models: AiToolModel[];
  isActive: boolean;
  icon: "image" | "text" | "audio" | "video" | "code";
  website?: string;
}

const m = (id: string, name: string): AiToolModel => ({ id, name });

export const AI_TOOLS: AiTool[] = [
  // Image
  { id: "midjourney", name: "Midjourney", provider: "Midjourney", types: ["image"], icon: "image", isActive: true, website: "https://www.midjourney.com", models: [m("v7", "V7"), m("v6-1", "V6.1"), m("niji-7", "Niji 7")] },
  { id: "gpt-image", name: "GPT Image", provider: "OpenAI", types: ["image"], icon: "image", isActive: true, models: [m("gpt-image-1", "GPT Image 1")] },
  { id: "flux", name: "FLUX", provider: "Black Forest Labs", types: ["image"], icon: "image", isActive: true, models: [m("flux-1-1-pro", "FLUX 1.1 Pro"), m("flux-kontext", "FLUX Kontext")] },
  { id: "imagen", name: "Imagen", provider: "Google", types: ["image"], icon: "image", isActive: true, models: [m("imagen-4", "Imagen 4")] },
  { id: "nano-banana", name: "Nano Banana", provider: "Google", types: ["image"], icon: "image", isActive: true, models: [] },
  { id: "ideogram", name: "Ideogram", provider: "Ideogram", types: ["image"], icon: "image", isActive: true, models: [m("v3", "3.0")] },
  { id: "firefly", name: "Adobe Firefly", provider: "Adobe", types: ["image"], icon: "image", isActive: true, models: [] },
  // Video
  { id: "veo", name: "Veo", provider: "Google", types: ["video"], icon: "video", isActive: true, models: [m("veo-3-1", "Veo 3.1")] },
  { id: "runway", name: "Runway", provider: "Runway", types: ["video"], icon: "video", isActive: true, models: [m("gen-4-5", "Gen-4.5"), m("gen-4", "Gen-4")] },
  { id: "seedance", name: "Seedance", provider: "ByteDance", types: ["video"], icon: "video", isActive: true, models: [m("seedance-2-5", "Seedance 2.5")] },
  { id: "kling", name: "Kling", provider: "Kuaishou", types: ["video"], icon: "video", isActive: true, models: [] },
  { id: "luma", name: "Luma", provider: "Luma AI", types: ["video"], icon: "video", isActive: true, models: [] },
  { id: "wan", name: "Wan", provider: "Alibaba", types: ["video"], icon: "video", isActive: true, models: [] },
  { id: "grok-imagine", name: "Grok Imagine Video", provider: "xAI", types: ["video"], icon: "video", isActive: true, models: [] },
  // Audio
  { id: "suno", name: "Suno", provider: "Suno", types: ["audio"], icon: "audio", isActive: true, models: [m("v6", "v6")] },
  { id: "udio", name: "Udio", provider: "Udio", types: ["audio"], icon: "audio", isActive: true, models: [] },
  { id: "elevenlabs", name: "ElevenLabs", provider: "ElevenLabs", types: ["audio"], icon: "audio", isActive: true, models: [m("music-v2-5", "Music v2.5"), m("text-to-sound", "Text to Sound")] },
  { id: "lyria", name: "Google Lyria", provider: "Google", types: ["audio"], icon: "audio", isActive: true, models: [] },
  // Text
  { id: "chatgpt", name: "ChatGPT", provider: "OpenAI", types: ["text"], icon: "text", isActive: true, models: [] },
  { id: "claude", name: "Claude", provider: "Anthropic", types: ["text"], icon: "text", isActive: true, models: [m("opus", "Claude Opus"), m("sonnet", "Claude Sonnet"), m("haiku", "Claude Haiku")] },
  { id: "gemini", name: "Gemini", provider: "Google", types: ["text"], icon: "text", isActive: true, models: [] },
  { id: "grok", name: "Grok", provider: "xAI", types: ["text"], icon: "text", isActive: true, models: [] },
  { id: "deepseek", name: "DeepSeek", provider: "DeepSeek", types: ["text"], icon: "text", isActive: true, models: [] },
  { id: "qwen", name: "Qwen", provider: "Alibaba", types: ["text"], icon: "text", isActive: true, models: [] },
  { id: "mistral", name: "Mistral", provider: "Mistral AI", types: ["text"], icon: "text", isActive: true, models: [] },
  // Coding (text › coding)
  { id: "claude-code", name: "Claude Code", provider: "Anthropic", types: ["text"], category: "coding", icon: "code", isActive: true, models: [] },
  { id: "cursor", name: "Cursor", provider: "Anysphere", types: ["text"], category: "coding", icon: "code", isActive: true, models: [] },
  { id: "copilot", name: "GitHub Copilot", provider: "GitHub", types: ["text"], category: "coding", icon: "code", isActive: true, models: [] },
  { id: "codex", name: "Codex", provider: "OpenAI", types: ["text"], category: "coding", icon: "code", isActive: true, models: [] },
];

export const MAX_TOOLS = 3;

export function findTool(id: string): AiTool | null {
  return AI_TOOLS.find((tool) => tool.id === id) ?? null;
}

/** Active tools for a content type; coding tools only appear for text › coding. */
export function getToolsForContentType(type: ContentTypeId, category?: string | null): AiTool[] {
  return AI_TOOLS.filter(
    (tool) => tool.isActive && tool.types.includes(type) && (!tool.category || tool.category === category),
  );
}

export function parseToolRef(ref: string): { toolId: string; modelId: string | null } {
  const [toolId, modelId] = ref.split(":");
  return { toolId, modelId: modelId ?? null };
}

export function makeToolRef(toolId: string, modelId?: string | null): string {
  return modelId ? `${toolId}:${modelId}` : toolId;
}

export interface ResolvedToolRef {
  ref: string;
  tool: AiTool;
  model: AiToolModel | null;
  /** "Midjourney" or "Midjourney V7". */
  label: string;
}

/** Unknown refs (catalog entry later removed) are dropped rather than shown raw. */
export function resolveToolRefs(refs: string[] | null | undefined): ResolvedToolRef[] {
  const out: ResolvedToolRef[] = [];
  for (const ref of refs ?? []) {
    const { toolId, modelId } = parseToolRef(ref);
    const tool = findTool(toolId);
    if (!tool) continue;
    const model = modelId ? (tool.models.find((mm) => mm.id === modelId) ?? null) : null;
    out.push({ ref, tool, model, label: model ? `${tool.name} ${model.name}` : tool.name });
  }
  return out;
}

/** Matches on tool name, provider and model names ("mid", "veo", "suno"). */
export function searchTools(tools: AiTool[], query: string): AiTool[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  return tools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(q) ||
      tool.provider.toLowerCase().includes(q) ||
      tool.models.some((mm) => mm.name.toLowerCase().includes(q)),
  );
}

/** Sanitises stored/legacy values into a clean array. */
export function normalizeToolRefs(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, MAX_TOOLS) : [];
}
