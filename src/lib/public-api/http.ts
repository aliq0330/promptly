/**
 * Açık API'nin HTTP katmanı — `Request → Response`. Edge Function `api` (`supabase/functions/api/index.ts`) yalnız bunu
 * `Deno.serve`'e verir; Node testleri de aynı işleyiciyi doğrudan çağırır (Node 18+ `Request`/`Response` taşır).
 *
 * Yollar (`/functions/v1/api` önekinden sonra): `GET /v1`, `GET /v1/openapi.json`, `GET /v1/prompts`, `GET /v1/prompts/popular`,
 * `GET /v1/prompts/{id}` (`?format=json|markdown|csv`), `POST /v1/prompts/{id}/fill`. Salt-okunur; yazma YOK (Faz 2: kullanıcı
 * kendi oturumuyla — `docs/history/297-*`).
 *
 * CORS `*`: yanıtlar yalnız herkese açık veridir, çerez/kimlik taşınmaz.
 */
import { serializeCsv } from "../exchange/csv.ts";
import { serializeJson } from "../exchange/json.ts";
import { serializeMarkdown } from "../exchange/markdown.ts";
import type { ExchangePrompt } from "../exchange/prompt-format.ts";
import { openApiDocument, PUBLIC_API_VERSION } from "./openapi.ts";
import { fillPrompt, getPrompt, popularPrompts, searchPrompts, type PublicPrompt } from "./prompts.ts";
import { createRestClient, PublicApiError, type PublicApiConfig, type RestClient } from "./rest.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

const STATUS: Record<PublicApiError["code"], number> = { bad_request: 400, not_found: 404, upstream: 502, timeout: 504, not_configured: 500 };
const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status = 200, cache = status === 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      // Herkese açık okuma: kısa önbellek (kenar + tarayıcı); hata ve doldurma sonucu önbelleğe girmez.
      "Cache-Control": cache ? "public, max-age=60" : "no-store",
    },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status, false);
}

/** `/api/v1/prompts` → `/prompts`; `/v1` bölümü yoksa null. Önek (fonksiyon adı, yerel `supabase functions serve` yolu) ne olursa olsun çalışır. */
export function routeOf(pathname: string): string | null {
  // Barındırılan ortamda yol `/api/v1/...`; dışarıdan bakan adres `/functions/v1/api/v1/...` — Supabase'in kendi `/functions/v1` öneki atlanır.
  const match = /(?:^|\/)v1(\/.*)?$/.exec(pathname.replace(/^\/functions\/v1(?=\/)/, "").replace(/\/+$/, ""));
  if (!match) return null;
  return match[1] ?? "/";
}

/**
 * Sunucu adresi (OpenAPI `servers`, dizindeki `docs`): verilmişse `publicBaseUrl` (Edge Function `SUPABASE_URL`'den kurar — çalışma
 * zamanının gördüğü istek adresi dışarıdaki adresle aynı olmayabilir), yoksa isteğin adresinden API'nin `/v1` bölümüne kadar olan kısım.
 */
function serverUrlOf(url: URL, publicBaseUrl?: string): string {
  if (publicBaseUrl) return publicBaseUrl.replace(/\/+$/, "");
  const path = url.pathname;
  const offset = path.startsWith("/functions/v1/") ? "/functions/v1".length : 0;
  const index = path.slice(offset).search(/(?:^|\/)v1(?:\/|$)/);
  const prefix = index >= 0 ? path.slice(0, offset + index) : "";
  return `${url.origin}${prefix}/v1`;
}

function listParam(url: URL, name: string): string[] {
  return url.searchParams.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
}

function intParam(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new PublicApiError("bad_request", `${name} must be an integer.`);
  return value;
}

function exchangeOf(prompt: PublicPrompt): ExchangePrompt {
  const { title, description, promptText, contentType, category, subcategory, tools, tags, variables, source } = prompt;
  return { title, description, promptText, contentType, category, subcategory, tools, tags, variables, ...(source ? { source } : {}) };
}

/** `?format=` indirmesi: sitedeki "Dışa aktar" ile birebir aynı dosya (değişim çekirdeği). */
function download(prompt: PublicPrompt, format: string): Response {
  const item = [exchangeOf(prompt)];
  const files: Record<string, { body: string; type: string; ext: string }> = {
    json: { body: serializeJson(item), type: "application/json", ext: "json" },
    markdown: { body: serializeMarkdown(item), type: "text/markdown", ext: "md" },
    csv: { body: serializeCsv(item), type: "text/csv", ext: "csv" },
  };
  const file = files[format];
  if (!file) return errorResponse("bad_request", "format must be one of: json, markdown, csv.", 400);
  return new Response(file.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": `${file.type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="promptly-${prompt.id.slice(0, 8)}.${file.ext}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}

async function readValues(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new PublicApiError("bad_request", "Request body is too large.");
  if (text.trim() === "") return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new PublicApiError("bad_request", "Body must be JSON.");
  }
  const values = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).values : undefined;
  if (values === undefined || values === null) return {};
  if (typeof values !== "object" || Array.isArray(values)) throw new PublicApiError("bad_request", "values must be an object.");
  return values as Record<string, unknown>;
}

async function route(request: Request, client: RestClient, publicBaseUrl?: string): Promise<Response> {
  const url = new URL(request.url);
  const path = routeOf(url.pathname);
  if (path === null) return errorResponse("not_found", "Use /v1 — see /v1/openapi.json.", 404);
  const segments = path.split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  if (segments.length === 0) {
    if (method !== "GET") return errorResponse("method_not_allowed", "Use GET.", 405);
    return json({
      name: "Promptly Public API",
      version: PUBLIC_API_VERSION,
      docs: `${serverUrlOf(url, publicBaseUrl)}/openapi.json`,
      site: client.siteUrl,
      endpoints: ["GET /prompts", "GET /prompts/popular", "GET /prompts/{id}", "POST /prompts/{id}/fill"],
    });
  }
  if (segments.length === 1 && segments[0] === "openapi.json") {
    if (method !== "GET") return errorResponse("method_not_allowed", "Use GET.", 405);
    return json(openApiDocument(serverUrlOf(url, publicBaseUrl)));
  }
  if (segments[0] !== "prompts" || segments.length > 3) return errorResponse("not_found", "Unknown endpoint — see /v1/openapi.json.", 404);

  if (segments.length === 1) {
    if (method !== "GET") return errorResponse("method_not_allowed", "Use GET.", 405);
    const page = await searchPrompts(client, {
      query: url.searchParams.get("q"),
      contentType: url.searchParams.get("content_type"),
      category: url.searchParams.get("category"),
      subcategory: url.searchParams.get("subcategory"),
      tags: listParam(url, "tag"),
      tools: listParam(url, "tool"),
      sort: url.searchParams.get("sort"),
      limit: intParam(url, "limit"),
      cursor: url.searchParams.get("cursor"),
    });
    return json(page);
  }
  if (segments.length === 2 && segments[1] === "popular") {
    if (method !== "GET") return errorResponse("method_not_allowed", "Use GET.", 405);
    const items = await popularPrompts(client, {
      period: url.searchParams.get("period"),
      by: url.searchParams.get("by"),
      contentType: url.searchParams.get("content_type"),
      limit: intParam(url, "limit"),
    });
    return json({ items });
  }
  if (segments.length === 2) {
    if (method !== "GET") return errorResponse("method_not_allowed", "Use GET.", 405);
    const prompt = await getPrompt(client, decodeURIComponent(segments[1]));
    const format = url.searchParams.get("format");
    return format ? download(prompt, format) : json(prompt);
  }
  if (segments[2] === "fill") {
    if (method !== "POST") return errorResponse("method_not_allowed", "Use POST with {\"values\": {...}}.", 405);
    const values = await readValues(request);
    const prompt = await getPrompt(client, decodeURIComponent(segments[1]));
    return json({ ...fillPrompt(prompt, values), source: prompt.source ?? null }, 200, false);
  }
  return errorResponse("not_found", "Unknown endpoint — see /v1/openapi.json.", 404);
}

export interface ApiHandlerOptions {
  config: PublicApiConfig;
  /** Dışarıdan görünen API kökü, ör. `https://<ref>.supabase.co/functions/v1/api/v1`. */
  publicBaseUrl?: string;
  /** Beklenmeyen hatalar için (Edge Function'da `console.error`). */
  onError?: (error: unknown) => void;
}

export function createApiHandler(options: ApiHandlerOptions): (request: Request) => Promise<Response> {
  let client: RestClient | null = null;
  return async (request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      client ??= createRestClient(options.config);
      return await route(request, client, options.publicBaseUrl);
    } catch (error) {
      if (error instanceof PublicApiError) {
        if (error.code === "upstream" || error.code === "not_configured") options.onError?.(error);
        return errorResponse(error.code, error.message, STATUS[error.code]);
      }
      options.onError?.(error);
      return errorResponse("internal", "Unexpected error.", 500);
    }
  };
}
