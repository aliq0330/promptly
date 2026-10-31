/**
 * Promptly açık API çekirdeği (`docs/history/297-*`). Tek giriş noktası: MCP paketi (`mcp/`) ve Edge Function `api` buradan alır.
 * Bağımlılıksız ve çerçevesizdir (yalnız `fetch`); Deno kopyası `scripts/sync-function-shared.mjs` ile üretilir.
 */
export * from "./rest.ts";
export * from "./prompts.ts";
export { createApiHandler, routeOf, type ApiHandlerOptions } from "./http.ts";
export { openApiDocument, PUBLIC_API_VERSION } from "./openapi.ts";
