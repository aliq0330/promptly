import { test } from "node:test";
import assert from "node:assert/strict";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { createOauthHandler, type OauthQuery } from "../../src/lib/public-api/index.ts";

// Resmî MCP SDK'sının (claude.ai gibi istemcilerin kullandığı keşif sırası) keşif + dinamik kayıt + yetki başlatma akışını Promptly'nin OAuth işleyicisine karşı
// süreç içinde çalıştırır. Canlıda yakalanan hata: SDK `…/oauth/.well-known/openid-configuration` yanıtını OpenID sağlayıcı belgesi diye doğruluyor ve
// jwks_uri / subject_types_supported / id_token_signing_alg_values_supported alanlarını zorunlu tutuyor (docs/history/317-*).
const BASE = "https://proj.supabase.co";
const ISSUER = `${BASE}/functions/v1/oauth`;
const RESOURCE = `${BASE}/functions/v1/mcp/me`;
const PRM = `${BASE}/functions/v1/mcp/oauth-protected-resource`;
const CLIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

test("the official MCP SDK discovers the authorization server, registers a public client and starts the authorization", async () => {
  const query: OauthQuery = async (sql, params = []) => {
    if (sql.includes("_oauth_register_client")) {
      return [{ client: { client_id: CLIENT_ID, client_name: params[0], redirect_uris: JSON.parse(String(params[1])), client_id_issued_at: 1 } }];
    }
    if (sql.includes("_oauth_start_request")) return [{ request: "REQ" }];
    return [];
  };
  const handler = createOauthHandler({ query, issuer: ISSUER, siteUrl: "https://aliq0330.github.io/promptly", resources: [RESOURCE] });

  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(`${init?.method ?? "GET"} ${url.replace(BASE, "")}`);
    if (url === PRM) {
      return new Response(JSON.stringify({ resource: RESOURCE, authorization_servers: [ISSUER] }), { headers: { "content-type": "application/json" } });
    }
    // Supabase'in ağ geçidi: işlev dışı `/.well-known/…` adresleri anahtar ister (canlıda 401).
    if (url.startsWith(`${BASE}/.well-known/`)) return new Response('{"message":"No API key found in request"}', { status: 401 });
    if (url.startsWith(ISSUER)) return handler(new Request(url, init));
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const saved: { client?: { client_id: string }; redirect?: URL; verifier?: string } = {};
  const provider: OAuthClientProvider = {
    get redirectUrl() { return CALLBACK; },
    get clientMetadata() {
      return { client_name: "Claude", redirect_uris: [CALLBACK], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
    },
    clientInformation: () => saved.client as never,
    saveClientInformation: (info) => { saved.client = info as never; },
    tokens: () => undefined,
    saveTokens: () => {},
    redirectToAuthorization: (url) => { saved.redirect = url; },
    saveCodeVerifier: (v) => { saved.verifier = v; },
    codeVerifier: () => saved.verifier ?? "",
  };
  try {
    const result = await auth(provider, { serverUrl: RESOURCE, resourceMetadataUrl: new URL(PRM) });
    assert.equal(result, "REDIRECT");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(saved.client?.client_id, CLIENT_ID, "the client registered itself (DCR)");
  assert.ok(seen.some((line) => line === "POST /functions/v1/oauth/register"), seen.join("\n"));
  // Yetki adresi bizim uç noktamız; PKCE S256 ve kaynak göstergesi var.
  const redirect = saved.redirect;
  assert.ok(redirect, "the SDK asked to redirect the user to the authorization endpoint");
  assert.equal(redirect.origin + redirect.pathname, `${ISSUER}/authorize`);
  assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
  assert.equal(redirect.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(redirect.searchParams.get("redirect_uri"), CALLBACK);
  assert.equal(redirect.searchParams.get("resource"), RESOURCE);
});
