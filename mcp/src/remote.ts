/**
 * Promptly MCP — İNTERNET ÜZERİNDEN (Streamable HTTP) çalışan hâl. Aynı sunucu tanımı (`server.ts`: 4 araç + `find-prompt`) bir `Request → Response`
 * işleyicisine bağlanır; Edge Function `mcp` (`supabase/functions/mcp`) bunu `Deno.serve`'e verir, testler doğrudan çağırır.
 *
 * Tasarım (docs/history/299-*):
 * - OTURUMSUZ + düz JSON cevap: Edge Function'lar istekler arasında bellek tutmaz, SSE akışı da gerekmez. Her POST için yeni sunucu + yeni taşıma.
 * - Kimlik doğrulamasız, yalnız okur: açık API ile aynı yetki (anon anahtar). Hesap, token, çerez yok → CORS `*` güvenli.
 * - Popüler prompt listesi (`loadPopularPrompts`) burada YOK: oturum olmadığı için her istekte veritabanını yoklardı. Araçlar + `find-prompt` yeter.
 * - GET/DELETE akış/oturum içindir; sunmuyoruz (405). Tarayıcıdan açan kişi ise kısa bir bilgi JSON'u görür.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerOf, checkRequest, clientKeyOf, looksLikeCredential, RATE_LIMIT_EXPOSE_HEADERS, withRateLimitHeaders, type MeBackend, type PromptUseRecorder, type RateLimiter, type RestClient } from "../../src/lib/public-api/index.ts";
import { createPromptlyServer } from "./server.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, authorization, apikey, x-client-info, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Expose-Headers": `mcp-session-id, mcp-protocol-version, www-authenticate, ${RATE_LIMIT_EXPOSE_HEADERS}`,
  "Access-Control-Max-Age": "86400",
};

/** Bir araç çağrısı küçük bir JSON'dur; 64 KB'tan büyüğü kötüye kullanım. */
export const REMOTE_MAX_BODY_BYTES = 64 * 1024;

export interface RemoteHandlerOptions {
  /** Tembel: ayar eksikse (ortam değişkeni yok) içe aktarma sırasında değil istekte hata verilir. */
  getClient: () => RestClient;
  version: string;
  /** Kullanıcıya gösterilmeyen iç günlük (Edge Function'da `console.error`). */
  log?: (message: string, error?: unknown) => void;
  /** IP başına hız sınırı (docs/history/302-*); yalnız POST sayılır. Verilmezse sınır yok. */
  rateLimiter?: RateLimiter;
  /** `get_prompt` / `fill_prompt` ile okunan promptları sayar (docs/history/304-*; Yaratıcı panelinde "API / MCP"). Verilmezse sayılmaz. */
  usage?: PromptUseRecorder;
  /**
   * Kişisel adres `…/mcp/me` (docs/history/315-*): kimlik ister (kişisel API anahtarı ya da OAuth belirteci), kimlikli araçları ekler. Verilmezse bu adres 404.
   * `resourceMetadataUrl`/`authorizationServers`: OAuth istemcileri (claude.ai, ChatGPT) kimliksiz isteğe verilen 401'deki `WWW-Authenticate` başlığından
   * korumalı kaynak metadatasını (RFC 9728) bulur ve girişi başlatır.
   */
  me?: { backend: MeBackend; resourceUrl?: string; resourceMetadataUrl?: string; authorizationServers?: string[] };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonRpcError(status: number, code: number, message: string, extra: Record<string, string> = {}): Response {
  return withCors(
    new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
    }),
  );
}

/** Spesifikasyon: istemci hem `application/json` hem `text/event-stream` kabul ettiğini söyler. Eksik bildirenleri (basit istemciler) hoşgörüyle tamamlarız. */
function withAcceptHeader(request: Request): Request {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) return request;
  const headers = new Headers(request.headers);
  headers.set("accept", "application/json, text/event-stream");
  return new Request(request, { headers });
}

export function createRemoteHandler(options: RemoteHandlerOptions): (request: Request) => Promise<Response> {
  const log = options.log ?? (() => {});
  return async (request) => {
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    const pathname = new URL(request.url).pathname;
    const isMeta = /\/oauth-protected-resource\/?$/.test(pathname);
    const isMe = !isMeta && /\/me\/?$/.test(pathname);
    if ((isMe || isMeta) && !options.me) return jsonRpcError(404, -32000, "Not found.");
    if (isMeta && options.me) {
      return withCors(
        new Response(
          JSON.stringify({
            resource: options.me.resourceUrl ?? request.url.replace(/\/oauth-protected-resource\/?$/, "/me"),
            authorization_servers: options.me.authorizationServers ?? [],
            bearer_methods_supported: ["header"],
            resource_name: "Promptly (my account)",
          }),
          { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
        ),
      );
    }

    if (method === "GET" || method === "DELETE") {
      // Akış (SSE) isteyen bir MCP istemcisi: bu sunucu akış sunmaz → spesifikasyonun öngördüğü 405.
      if (method === "DELETE" || (request.headers.get("accept") ?? "").includes("text/event-stream")) {
        return jsonRpcError(405, -32000, "This server answers POST requests only (stateless, no streams or sessions).", { Allow: "POST, OPTIONS" });
      }
      return withCors(
        new Response(
          JSON.stringify({
            name: "Promptly MCP",
            version: options.version,
            transport: "streamable-http (stateless, JSON)",
            usage: isMe
              ? "Personal Promptly MCP: works on YOUR account. Send a personal API key (Promptly → Settings → Developer keys) as `Authorization: Bearer pmt_…`, or sign in via OAuth."
              : "Add this URL as a remote MCP server / custom connector in your MCP client. No account or key needed; read-only.",
            tools: isMe
              ? ["search_prompts", "popular_prompts", "get_prompt", "fill_prompt", "list_my_prompts", "get_my_prompt", "list_my_saved", "save_prompt_draft"]
              : ["search_prompts", "popular_prompts", "get_prompt", "fill_prompt"],
            site: "https://aliq0330.github.io/promptly",
          }),
          { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
        ),
      );
    }
    if (method !== "POST") return jsonRpcError(405, -32000, "Method not allowed.", { Allow: "POST, OPTIONS" });

    // Kişisel adres: kimlik YOKSA ya da biçimi kimlik gibi değilse 401 + korumalı kaynak metadatası (OAuth istemcilerinin girişi başlatması için).
    // Geçerliliği burada sorulmaz (her MCP isteği veritabanı turu olurdu); araç çağrısı bearer'ı yeniden doğrular ve geçersizse araç hatası döner.
    let bearer: string | null = null;
    if (isMe) {
      bearer = bearerOf(request.headers);
      if (!bearer || !looksLikeCredential(bearer)) {
        const hint = options.me?.resourceMetadataUrl ? `Bearer resource_metadata="${options.me.resourceMetadataUrl}"` : 'Bearer realm="promptly"';
        return jsonRpcError(401, -32001, "Authentication required: send a Promptly API key or sign in.", { "WWW-Authenticate": hint });
      }
    }

    const limit = await checkRequest(options.rateLimiter, request);
    if (limit && !limit.allowed) {
      return withRateLimitHeaders(jsonRpcError(429, -32000, `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`), limit);
    }

    let client: RestClient;
    try {
      client = options.getClient();
    } catch (error) {
      log("remote MCP is not configured", error);
      return jsonRpcError(500, -32603, "Server is not configured.");
    }

    // Her istek: yeni sunucu + yeni taşıma (oturumsuz taşıma istekler arasında yeniden kullanılamaz).
    const clientKey = clientKeyOf(request.headers);
    const { server } = createPromptlyServer({
      client,
      version: options.version,
      me: isMe && bearer && options.me ? { backend: options.me.backend, bearer } : undefined,
      log: (message) => log(message),
      onPromptUse: options.usage ? (promptId) => options.usage!.record(promptId, clientKey) : undefined,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: REMOTE_MAX_BODY_BYTES,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(withAcceptHeader(request));
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      return withRateLimitHeaders(withCors(new Response(response.body, { status: response.status, statusText: response.statusText, headers })), limit);
    } catch (error) {
      log("remote MCP request failed", error);
      return jsonRpcError(500, -32603, "Internal error.");
    } finally {
      // Taşıma/sunucu bu istekle bitti; kaynakları bırak (hata olsa da sessizce).
      await server.close().catch(() => {});
    }
  };
}
