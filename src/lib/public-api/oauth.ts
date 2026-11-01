/**
 * Promptly'nin kendi OAuth sunucusunun HTTP katmanı (`docs/history/317-*`). Bağımlılıksız (yalnız `Request`/`Response`); Node + Deno.
 *
 * İŞ MANTIĞI VERİTABANINDADIR (`20261102130000_oauth_server.sql`, `_oauth_*` fonksiyonları): kayıt doğrulaması, PKCE, tek kullanımlık kod, yenileme döndürme,
 * yeniden kullanım tespiti. Bu dosya yalnız HTTP'yi (RFC 6749/7591/7009/8414/9728 biçimleri) o fonksiyonlara çevirir; ikinci bir kural yazılmaz.
 * Edge Function `oauth` bunu doğrudan Postgres bağlantısıyla (`query`) çalıştırır.
 *
 * Güvenlik özeti: yalnız KAMUYA AÇIK istemci (secret yok) + PKCE `S256` zorunlu; `redirect_uri` kayıtlı adresle BİREBİR eşleşmeli (eşleşmezse kullanıcı hiçbir
 * yere yönlendirilmez); kullanıcı onayı site sayfasındadır (`/oauth/connect`); verilen belirteç `pmt_` kişisel anahtarıdır (`read` ve isteğe bağlı `write`, 1 saat).
 */
import { checkRequest, withRateLimitHeaders, RATE_LIMIT_EXPOSE_HEADERS, type RateLimiter } from "./rate-limit.ts";

/** Bir SQL çağrısı: `text` + konumsal parametreler → satırlar (sahip rol bağlantısı; her çağrı kendi başına atomiktir). */
export type OauthQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface OauthHandlerOptions {
  query: OauthQuery;
  /** Yetkilendirme sunucusunun kimliği: `https://<ref>.supabase.co/functions/v1/oauth` (metadata `issuer`). */
  issuer: string;
  /** Onay sayfasının kökü: `https://aliq0330.github.io/promptly`. */
  siteUrl: string;
  /** Kabul edilen kaynak göstergeleri (RFC 8707): kişisel MCP adresi. Verilen `resource` bunlardan biri olmalı. */
  resources: string[];
  /** Genel (IP başına) ve kayıt (IP başına, çok daha dar) hız sınırlayıcıları; yoksa sınır yok. */
  rateLimiter?: RateLimiter;
  registerLimiter?: RateLimiter;
  onError?: (error: unknown) => void;
}

export const OAUTH_SCOPES = ["read", "write"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 16 * 1024;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, accept, mcp-protocol-version",
  "Access-Control-Expose-Headers": RATE_LIMIT_EXPOSE_HEADERS,
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Pragma: "no-cache", ...extra },
  });
}

function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status);
}

/** Kullanıcıya gösterilen düz hata sayfası (geçersiz istemci/dönüş adresi: kimseye yönlendirme YAPILMAZ). */
function errorPage(message: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Promptly</title>` +
    `<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1 style="font-size:1.25rem">Promptly</h1><p>${escapeHtml(message)}</p></body>`;
  return new Response(html, { status: 400, headers: { ...CORS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** Kuyruk adı: `…/oauth/token`, `/token`, `…/.well-known/oauth-authorization-server` hepsi aynı uca düşer. */
export function oauthRouteOf(pathname: string): "metadata" | "authorize" | "token" | "register" | "revoke" | "jwks" | null {
  const path = pathname.replace(/\/+$/, "");
  if (/(?:^|\/)\.well-known\/(?:oauth-authorization-server|openid-configuration)(?:\/|$)/.test(path) || /\/openid-configuration$/.test(path)) return "metadata";
  const tail = /(?:^|\/)(authorize|token|register|revoke|jwks)$/.exec(path);
  return tail ? (tail[1] as "authorize" | "token" | "register" | "revoke" | "jwks") : null;
}

export function oauthMetadata(issuer: string, siteUrl: string): Record<string, unknown> {
  const base = issuer.replace(/\/+$/, "");
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    revocation_endpoint: `${base}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...OAUTH_SCOPES],
    // Kimlik belirteci (OpenID) VERMEYİZ. Ama MCP istemcileri (resmî SDK) keşfin son yedeğinde `…/.well-known/openid-configuration` yanıtını OpenID sağlayıcı
    // belgesi diye doğrular ve bu üç alanı zorunlu tutar; boş anahtar kümesi (`/jwks`) ile şemayı karşılarız (canlıda SDK ile yakalandı, docs/history/317-*).
    jwks_uri: `${base}/jwks`,
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    service_documentation: `${siteUrl.replace(/\/+$/, "")}/developers/`,
  };
}

async function readBody(request: Request): Promise<{ fields: Record<string, string>; json: unknown } | null> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return null;
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (type.includes("application/json")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const fields: Record<string, string> = {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) if (typeof value === "string") fields[key] = value;
      }
      return { fields, json: parsed };
    } catch {
      return { fields: {}, json: null };
    }
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) if (!(key in fields)) fields[key] = value;
  return { fields, json: null };
}

/** `Authorization: Basic base64(client_id:secret)` → client_id (kamuya açık istemci secret göndermez; yalnız kimlik alınır). */
function basicClientId(request: Request): string | null {
  const match = /^Basic\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const id = decoded.split(":")[0];
    return id || null;
  } catch {
    return null;
  }
}

function redirectWith(redirectUri: string, params: Record<string, string | undefined>): Response {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Cache-Control": "no-store", ...CORS } });
}

/** Veritabanının bilerek fırlattığı kısa kodlar (`invalid_redirect_uri: …`) → OAuth hata kodu. */
function dbErrorCode(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /\b(invalid_client_metadata|invalid_redirect_uri|invalid_client|invalid_request|server_busy)\b/.exec(message);
  return match ? match[1] : null;
}

export function createOauthHandler(options: OauthHandlerOptions): (request: Request) => Promise<Response> {
  const { query, issuer, siteUrl } = options;
  const resources = new Set(options.resources);
  const connectUrl = (raw: string) => `${siteUrl.replace(/\/+$/, "")}/oauth/connect/?request=${encodeURIComponent(raw)}`;

  async function register(request: Request): Promise<Response> {
    const body = await readBody(request);
    const data = body?.json;
    if (!data || typeof data !== "object" || Array.isArray(data)) return oauthError("invalid_client_metadata", "Body must be a JSON object.");
    const meta = data as Record<string, unknown>;
    const name = typeof meta.client_name === "string" ? meta.client_name : "";
    const uris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris.filter((u): u is string => typeof u === "string") : [];
    if (!name.trim()) return oauthError("invalid_client_metadata", "client_name is required.");
    if (uris.length === 0 || uris.length !== (meta.redirect_uris as unknown[]).length) return oauthError("invalid_redirect_uri", "redirect_uris must be a non-empty array of strings.");
    const clientUri = typeof meta.client_uri === "string" ? meta.client_uri : null;
    try {
      const [row] = await query("select public._oauth_register_client($1, array(select jsonb_array_elements_text($2::text::jsonb)), $3) as client", [
        name,
        JSON.stringify(uris),
        clientUri,
      ]);
      const client = (row?.client ?? null) as { client_id: string; client_name: string; redirect_uris: string[]; client_id_issued_at: number } | null;
      if (!client) throw new Error("empty registration result");
      return json(
        {
          client_id: client.client_id,
          client_name: client.client_name,
          redirect_uris: client.redirect_uris,
          client_id_issued_at: client.client_id_issued_at,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          scope: OAUTH_SCOPES.join(" "),
        },
        201,
      );
    } catch (error) {
      const code = dbErrorCode(error);
      if (code === "invalid_redirect_uri" || code === "invalid_client_metadata") return oauthError(code, "Check client_name and redirect_uris (https or localhost, at most 5, no fragments or credentials).");
      if (code === "server_busy") return oauthError("temporarily_unavailable", "Try again later.", 503);
      throw error;
    }
  }

  async function authorize(url: URL): Promise<Response> {
    const p = url.searchParams;
    const clientId = p.get("client_id") ?? "";
    const redirectUri = p.get("redirect_uri") ?? "";
    if (!UUID.test(clientId) || !redirectUri) return errorPage("This sign-in link is not valid (unknown application).");
    // Önce istemci + dönüş adresi doğrulanır: geçersizse KİMSEYE yönlendirme yapılmaz (açık yönlendirme olmaz).
    const [known] = await query("select exists (select 1 from public.oauth_clients where id = $1::uuid and $2 = any (redirect_uris)) as ok", [clientId, redirectUri]);
    if (known?.ok !== true) return errorPage("This sign-in link is not valid (unknown application or return address).");

    const state = p.get("state") ?? undefined;
    const fail = (error: string, description: string) => redirectWith(redirectUri, { error, error_description: description, state });
    if (p.get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
    if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(p.get("code_challenge") ?? "")) {
      return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
    }
    const resource = p.get("resource") ?? undefined;
    if (resource !== undefined && !resources.has(resource)) return fail("invalid_target", "Unknown resource.");
    if (state !== undefined && state.length > 512) return fail("invalid_request", "state is too long.");

    try {
      const [row] = await query("select public._oauth_start_request($1::uuid, $2, $3, $4, $5, $6) as request", [
        clientId,
        redirectUri,
        p.get("code_challenge"),
        state ?? null,
        p.get("scope") ?? null,
        resource ?? null,
      ]);
      const raw = typeof row?.request === "string" ? row.request : null;
      if (!raw) throw new Error("empty request token");
      return new Response(null, { status: 302, headers: { Location: connectUrl(raw), "Cache-Control": "no-store", ...CORS } });
    } catch (error) {
      if (dbErrorCode(error) === "server_busy") return fail("temporarily_unavailable", "Try again later.");
      throw error;
    }
  }

  async function token(request: Request): Promise<Response> {
    const body = await readBody(request);
    if (!body) return oauthError("invalid_request", "Body is too large.");
    const f = body.fields;
    const clientId = f.client_id || basicClientId(request) || "";
    if (!UUID.test(clientId)) return oauthError("invalid_client", "Unknown client.", 401);
    if (f.resource && !resources.has(f.resource)) return oauthError("invalid_target", "Unknown resource.");

    let result: Record<string, unknown> | null = null;
    if (f.grant_type === "authorization_code") {
      if (!f.code || !f.code_verifier || !f.redirect_uri) return oauthError("invalid_request", "code, code_verifier and redirect_uri are required.");
      const [row] = await query("select public._oauth_exchange_code($1::uuid, $2, $3, $4) as result", [clientId, f.code, f.redirect_uri, f.code_verifier]);
      result = (row?.result ?? null) as Record<string, unknown> | null;
    } else if (f.grant_type === "refresh_token") {
      if (!f.refresh_token) return oauthError("invalid_request", "refresh_token is required.");
      const [row] = await query("select public._oauth_refresh($1::uuid, $2) as result", [clientId, f.refresh_token]);
      result = (row?.result ?? null) as Record<string, unknown> | null;
    } else {
      return oauthError("unsupported_grant_type", "Supported: authorization_code, refresh_token.");
    }
    if (!result) throw new Error("empty token result");
    if (typeof result.error === "string") return oauthError(result.error, "The grant is invalid, expired or was revoked.");
    return json({ token_type: "Bearer", ...result });
  }

  async function revoke(request: Request): Promise<Response> {
    const body = await readBody(request);
    const f = body?.fields ?? {};
    const clientId = f.client_id || basicClientId(request) || "";
    if (UUID.test(clientId) && f.token) await query("select public._oauth_revoke($1::uuid, $2)", [clientId, f.token]);
    return json({});
  }

  return async (request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const route = oauthRouteOf(url.pathname);
    if (!route) return oauthError("not_found", "Unknown endpoint.", 404);

    const limited = await checkRequest(options.rateLimiter, request);
    if (limited && !limited.allowed) return withRateLimitHeaders(oauthError("temporarily_unavailable", `Too many requests. Try again in ${limited.retryAfterSeconds} seconds.`, 429), limited);

    try {
      if (route === "metadata") {
        if (request.method !== "GET") return oauthError("invalid_request", "Use GET.", 405);
        const response = json(oauthMetadata(issuer, siteUrl));
        response.headers.set("Cache-Control", "public, max-age=300");
        return withRateLimitHeaders(response, limited);
      }
      if (route === "jwks") {
        if (request.method !== "GET") return oauthError("invalid_request", "Use GET.", 405);
        const response = json({ keys: [] });
        response.headers.set("Cache-Control", "public, max-age=300");
        return withRateLimitHeaders(response, limited);
      }
      if (route === "authorize") {
        if (request.method !== "GET") return errorPage("Use GET.");
        return withRateLimitHeaders(await authorize(url), limited);
      }
      if (request.method !== "POST") return oauthError("invalid_request", "Use POST.", 405);
      if (route === "register") {
        const strict = await checkRequest(options.registerLimiter, request);
        if (strict && !strict.allowed) return withRateLimitHeaders(oauthError("temporarily_unavailable", `Too many registrations. Try again in ${strict.retryAfterSeconds} seconds.`, 429), strict);
        return withRateLimitHeaders(await register(request), limited);
      }
      if (route === "token") return withRateLimitHeaders(await token(request), limited);
      return withRateLimitHeaders(await revoke(request), limited);
    } catch (error) {
      options.onError?.(error);
      return withRateLimitHeaders(oauthError("server_error", "Unexpected error.", 500), limited);
    }
  };
}
