/**
 * The one "Çalıştır" service — hands a piece of prompt text to an AI tool the
 * user already uses. Promptly never calls a model and never holds an API
 * key: it opens the tool's own site/app (the OS routes the https link to the
 * installed app on phones) and, when the tool can't be pre-filled via URL,
 * leaves the text on the clipboard.
 *
 * Deliberately content-agnostic: callers pass plain text, so a prompt, a
 * generator's built prompt, a personalized prompt — and later a workflow's
 * composed prompt or a preset-derived one — all share this single path.
 */
import { AI_TOOLS, findTool, parseToolRef, type AiTool } from "@/lib/ai-tool-catalog";
import { copyTextToClipboard } from "@/lib/utils";

const PREFERRED_TOOL_KEY = "promptly-preferred-ai-tool";

/** Encoded prompts longer than this aren't put in a URL (browser/server URL limits) — copied instead. */
const MAX_PREFILL_ENCODED_LENGTH = 1800;

export interface RunToolOption {
  tool: AiTool;
  recommended: boolean;
}

export interface RunToolList {
  /** Recommended + featured (+ the user's last pick) — always visible. */
  primary: RunToolOption[];
  /** Everything else runnable, behind "Diğer AI araçları". */
  more: RunToolOption[];
}

export function isRunnableTool(tool: AiTool): boolean {
  return tool.isActive && Boolean(tool.run);
}

/**
 * Builds the run menu: tools the creator recommended come first (labelled),
 * then the featured chat assistants, then the user's last-used tool; the rest
 * is collapsed. Tools without a `run` config (e.g. Cursor) are never offered.
 */
export function buildRunToolList(recommendedRefs: string[] | null | undefined, lastUsedId?: string | null): RunToolList {
  const recommendedIds = new Set<string>();
  for (const ref of recommendedRefs ?? []) {
    const tool = findTool(parseToolRef(ref).toolId);
    if (tool && isRunnableTool(tool)) recommendedIds.add(tool.id);
  }
  const runnable = AI_TOOLS.filter(isRunnableTool);
  const byId = new Map(runnable.map((tool) => [tool.id, tool]));
  const primaryIds: string[] = [...recommendedIds];
  for (const tool of runnable) if (tool.run?.featured && !primaryIds.includes(tool.id)) primaryIds.push(tool.id);
  if (lastUsedId && byId.has(lastUsedId) && !primaryIds.includes(lastUsedId)) primaryIds.push(lastUsedId);

  const toOption = (tool: AiTool): RunToolOption => ({ tool, recommended: recommendedIds.has(tool.id) });
  return {
    primary: primaryIds.map((id) => toOption(byId.get(id)!)),
    more: runnable.filter((tool) => !primaryIds.includes(tool.id)).map(toOption),
  };
}

/** `{prompt}` filled in, or null when the tool has no pre-fill URL or the text is too long for one. */
export function buildPrefillUrl(tool: AiTool, text: string): string | null {
  const template = tool.run?.prefillUrl;
  if (!template) return null;
  const encoded = encodeURIComponent(text);
  if (encoded.length > MAX_PREFILL_ENCODED_LENGTH) return null;
  return template.replace("{prompt}", encoded);
}

export interface RunWithAIResult {
  tool: AiTool;
  /** The text was placed in the tool via URL — nothing to paste. */
  prefilled: boolean;
  /** The tab/app actually opened (false = popup blocked). */
  opened: boolean;
  /** The text is on the clipboard. */
  copied: boolean;
  /** Where we sent (or tried to send) the user — lets the UI offer a manual link. */
  url: string;
}

/**
 * MUST be called synchronously from a click handler: `window.open` and the
 * clipboard write both need the user gesture. The clipboard write is started
 * first (before the new tab steals focus), the tab is opened in the same
 * tick, and only then do we await the clipboard result.
 */
export async function runWithAI({ content, toolId }: { content: string; toolId: string }): Promise<RunWithAIResult | null> {
  const tool = findTool(toolId);
  const text = content.trim();
  if (!tool?.run || !text) return null;

  const copyPromise = copyTextToClipboard(text);
  const prefillUrl = buildPrefillUrl(tool, text);
  const url = prefillUrl ?? tool.run.webUrl;

  const win = window.open(url, "_blank");
  if (win) {
    try {
      win.opener = null;
    } catch {
      // cross-origin hardening is best-effort
    }
  }
  const copied = await copyPromise;
  setPreferredRunTool(tool.id);
  return { tool, prefilled: Boolean(prefillUrl), opened: Boolean(win), copied, url };
}

/** Prompt + optional negative prompt as one runnable text (chat tools have no separate negative field). */
export function composeRunText(prompt: string, negativePrompt?: string | null): string {
  const negative = negativePrompt?.trim();
  return negative ? `${prompt.trim()}\n\nNegative prompt: ${negative}` : prompt.trim();
}

export function getPreferredRunTool(): string | null {
  try {
    return localStorage.getItem(PREFERRED_TOOL_KEY);
  } catch {
    return null;
  }
}

export function setPreferredRunTool(toolId: string) {
  try {
    localStorage.setItem(PREFERRED_TOOL_KEY, toolId);
  } catch {
    // private mode: the choice just won't persist
  }
}
