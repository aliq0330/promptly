/**
 * `npx promptly-mcp` — stdio MCP sunucusu. stdout protokole aittir; günlük yalnız stderr'e yazılır.
 *
 * Ayarlar (ortam değişkeni, hepsi isteğe bağlı):
 * - PROMPTLY_SUPABASE_URL / PROMPTLY_SUPABASE_ANON_KEY — derlemeye gömülü herkese açık değerlerin yerine (kendi kopyan/test için).
 * - PROMPTLY_MCP_PROMPTS — istemcinin "prompts" listesine eklenecek popüler prompt sayısı (varsayılan 20, 0 = kapalı).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRestClient, PublicApiError } from "../../src/lib/public-api/index.ts";
import { createPromptlyServer } from "./server.ts";

declare const __PROMPTLY_SUPABASE_URL__: string;
declare const __PROMPTLY_SUPABASE_ANON_KEY__: string;
declare const __PROMPTLY_MCP_VERSION__: string;

const log = (message: string) => process.stderr.write(`[promptly-mcp] ${message}\n`);

function setting(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

async function main(): Promise<void> {
  const url = setting("PROMPTLY_SUPABASE_URL", typeof __PROMPTLY_SUPABASE_URL__ === "string" ? __PROMPTLY_SUPABASE_URL__ : "");
  const anonKey = setting("PROMPTLY_SUPABASE_ANON_KEY", typeof __PROMPTLY_SUPABASE_ANON_KEY__ === "string" ? __PROMPTLY_SUPABASE_ANON_KEY__ : "");
  const version = typeof __PROMPTLY_MCP_VERSION__ === "string" ? __PROMPTLY_MCP_VERSION__ : "0.0.0";
  const promptCount = Number.parseInt(setting("PROMPTLY_MCP_PROMPTS", "20"), 10);

  let client;
  try {
    client = createRestClient({ url, anonKey });
  } catch (error) {
    if (error instanceof PublicApiError && error.code === "not_configured") {
      log("This build has no Promptly address. Set PROMPTLY_SUPABASE_URL and PROMPTLY_SUPABASE_ANON_KEY, or install the published package.");
      process.exit(1);
    }
    throw error;
  }

  const { server, loadPopularPrompts } = createPromptlyServer({ client, version, log });
  await server.connect(new StdioServerTransport());
  log(`ready (v${version})`);
  // Bağlandıktan SONRA: istemci beklemez, liste gelince `prompts/list_changed` bildirimi gider.
  const added = await loadPopularPrompts(Number.isFinite(promptCount) ? promptCount : 20);
  if (added > 0) log(`${added} popular prompts available as MCP prompts`);
}

main().catch((error) => {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
