import { AiError, FALLBACK_MODELS, type AiKind, type AiModel, type AiOutput, type AiProvider } from "./types";

/**
 * Direct browser → provider calls with the user's own key. Nothing here goes
 * through Promptly's servers, and the key is only ever sent to the provider's
 * own endpoint (in a header, never in a URL).
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_BASE = "https://api.openai.com/v1";

function scrub(message: string, key: string): string {
  let out = message;
  if (key) out = out.split(key).join("•••");
  return out.replace(/\s+/g, " ").trim().slice(0, 220);
}

async function request(url: string, init: RequestInit, key: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") throw error;
    throw new AiError("network");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body: fall through to status-based handling.
  }
  if (response.ok) return body;
  const detail = scrub(
    ((body as { error?: { message?: string } } | null)?.error?.message as string | undefined) ?? "",
    key,
  );
  if (response.status === 401 || response.status === 403) throw new AiError("invalid_key", detail);
  if (response.status === 429) throw new AiError("quota", detail);
  if (response.status === 404) throw new AiError("model", detail);
  if (response.status === 400 && /api key|apikey|credential/i.test(detail)) throw new AiError("invalid_key", detail);
  if (response.status === 400 && /safety|policy|blocked|moderation/i.test(detail)) throw new AiError("blocked", detail);
  throw new AiError("unknown", detail);
}

// ---------------------------------------------------------------- models ----

function sortModels(models: AiModel[]): AiModel[] {
  return models.sort((a, b) => b.id.localeCompare(a.id));
}

export async function listModels(provider: AiProvider, kind: AiKind, key: string, signal?: AbortSignal): Promise<AiModel[]> {
  if (provider === "gemini") {
    const data = (await request(`${GEMINI_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal }, key)) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
    };
    const ids = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((id) => id.startsWith("gemini"));
    const isImage = (id: string) => /image/.test(id);
    const picked = ids.filter((id) => (kind === "image" ? isImage(id) : !isImage(id) && !/tts|embedding|live|audio|robotics|computer/.test(id)));
    return sortModels(picked.map((id) => ({ id, label: id })));
  }
  const data = (await request(`${OPENAI_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, signal }, key)) as { data?: { id: string }[] };
  const ids = (data.data ?? []).map((m) => m.id);
  const picked =
    kind === "image"
      ? ids.filter((id) => /^(gpt-image|dall-e-3)/.test(id))
      : ids.filter((id) => /^(gpt-|o\d)/.test(id) && !/image|audio|realtime|tts|transcribe|embedding|moderation|search|instruct|codex|preview|-\d{4}-\d{2}-\d{2}$/.test(id));
  return sortModels(picked.map((id) => ({ id, label: id })));
}

export function fallbackModels(provider: AiProvider, kind: AiKind): AiModel[] {
  return FALLBACK_MODELS[provider][kind];
}

// ------------------------------------------------------------- generation ----

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

async function geminiGenerate(kind: AiKind, model: string, prompt: string, key: string, signal?: AbortSignal): Promise<AiOutput> {
  const payload: Record<string, unknown> = { contents: [{ parts: [{ text: prompt }] }] };
  if (kind === "image") payload.generationConfig = { responseModalities: ["TEXT", "IMAGE"] };
  const data = (await request(
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(payload), signal },
    key,
  )) as { candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (data.promptFeedback?.blockReason) throw new AiError("blocked", data.promptFeedback.blockReason);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  if (kind === "image") {
    const image = parts.find((p) => p.inlineData?.data);
    if (!image?.inlineData?.data) throw new AiError(data.candidates?.[0]?.finishReason === "SAFETY" ? "blocked" : "empty");
    return { kind, imageUrl: `data:${image.inlineData.mimeType ?? "image/png"};base64,${image.inlineData.data}` };
  }
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new AiError("empty");
  return { kind, text };
}

async function openaiGenerate(kind: AiKind, model: string, prompt: string, key: string, signal?: AbortSignal): Promise<AiOutput> {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  if (kind === "image") {
    const body: Record<string, unknown> = { model, prompt, n: 1 };
    // dall-e-3 returns a URL by default (not fetchable cross-origin); ask for base64. gpt-image-* is always base64 and rejects the field.
    if (model.startsWith("dall-e")) body.response_format = "b64_json";
    const data = (await request(`${OPENAI_BASE}/images/generations`, { method: "POST", headers, body: JSON.stringify(body), signal }, key)) as {
      data?: { b64_json?: string }[];
    };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new AiError("empty");
    return { kind, imageUrl: `data:image/png;base64,${b64}` };
  }
  const data = (await request(
    `${OPENAI_BASE}/chat/completions`,
    { method: "POST", headers, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }), signal },
    key,
  )) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("empty");
  return { kind, text };
}

/** Runs ONE generation. Callers fan out for several results (providers differ on `n`). */
export async function generateOne(
  provider: AiProvider,
  kind: AiKind,
  model: string,
  prompt: string,
  key: string,
  signal?: AbortSignal,
): Promise<AiOutput> {
  const out = provider === "gemini" ? await geminiGenerate(kind, model, prompt, key, signal) : await openaiGenerate(kind, model, prompt, key, signal);
  if (out.imageUrl) {
    const size = await measureImage(out.imageUrl);
    return { ...out, ...size };
  }
  return out;
}

function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1024, height: img.naturalHeight || 1024 });
    img.onerror = () => resolve({ width: 1024, height: 1024 });
    img.src = url;
  });
}
