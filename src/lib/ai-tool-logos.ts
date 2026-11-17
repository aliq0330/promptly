/**
 * Real brand marks of the AI tools in `ai-tool-catalog.ts`, served from `public/tools/<toolId>.svg`.
 *
 * Source: LobeHub "lobe-icons" (MIT, @lobehub/icons-static-svg 1.103.0). The marks themselves stay the property of their owners and are
 * used only to name the tool they stand for (credit in the Terms → "Üçüncü taraf lisansları"). Where the vendor ships no separate mark
 * for a model (Imagen, Veo, Lyria, Wan, Seedance…) the provider's own mark is used. Adding a tool to the catalog = add its SVG here too
 * (`ai-tool-logos.test.ts` checks every catalog tool has a file and that the `mono` flag matches the file).
 *
 * `mono` marks are single-colour (`fill="currentColor"`): drawn as a mask in the text colour so they stay readable in dark mode.
 * The others keep their own brand colours and are drawn as a plain image.
 */
export const MONO_TOOL_LOGOS: ReadonlySet<string> = new Set([
  "midjourney", "gpt-image", "flux", "ideogram", "runway", "grok-imagine", "suno", "elevenlabs", "chatgpt", "grok", "cursor", "copilot",
]);

export const COLOR_TOOL_LOGOS: ReadonlySet<string> = new Set([
  "imagen", "nano-banana", "firefly", "veo", "seedance", "kling", "luma", "wan", "udio", "lyria", "claude", "gemini", "perplexity",
  "ms-copilot", "deepseek", "qwen", "mistral", "claude-code", "codex",
]);

export interface ToolLogoSpec {
  /** Path under `public/` (no base path — `publicAssetUrl` adds it). */
  path: string;
  mono: boolean;
}

export function toolLogo(toolId: string): ToolLogoSpec | null {
  const mono = MONO_TOOL_LOGOS.has(toolId);
  if (!mono && !COLOR_TOOL_LOGOS.has(toolId)) return null;
  return { path: `/tools/${toolId}.svg`, mono };
}
