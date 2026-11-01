/**
 * "Geliştiriciler" sayfasının (`/developers`, docs/history/301-*) adresleri ve kopyalanabilir örnekleri. Saf: ortam değişkenini
 * çağıran verir, bu yüzden birim testlidir. Adresler Edge Function'ların canlı adresleridir (docs/history/297-*, 299-*); sayfa
 * metinleri uydurma adres göstermesin diye hepsi buradan gelir.
 */

export interface DeveloperEndpoints {
  /** İnternet üzerinden MCP (Streamable HTTP, yalnız okur). */
  mcpUrl: string;
  /** Açık API kökü (`/v1`). */
  apiBase: string;
  openApiUrl: string;
}

/** `https://<ref>.supabase.co` → uç noktalar. Adres boşsa null (sayfa örnek göstermez, yalnız açıklama gösterir). */
export function developerEndpoints(supabaseUrl: string | undefined | null): DeveloperEndpoints | null {
  const base = (supabaseUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(base)) return null;
  const apiBase = `${base}/functions/v1/api/v1`;
  return { mcpUrl: `${base}/functions/v1/mcp`, apiBase, openApiUrl: `${apiBase}/openapi.json` };
}

export interface DeveloperSnippets {
  claudeCode: string;
  cursorJson: string;
  localNpx: string;
  curlSearch: string;
  curlGet: string;
  curlFill: string;
  fetchJs: string;
}

export function developerSnippets(endpoints: DeveloperEndpoints): DeveloperSnippets {
  const { mcpUrl, apiBase } = endpoints;
  return {
    claudeCode: `claude mcp add --transport http promptly ${mcpUrl}`,
    cursorJson: JSON.stringify({ mcpServers: { promptly: { url: mcpUrl } } }, null, 2),
    localNpx: "claude mcp add promptly -- npx -y promptly-mcp",
    curlSearch: `curl "${apiBase}/prompts?q=cyberpunk&content_type=image&limit=5"`,
    curlGet: `curl "${apiBase}/prompts/<id>"`,
    curlFill: `curl -X POST "${apiBase}/prompts/<id>/fill" \\\n  -H "Content-Type: application/json" \\\n  -d '{"values":{"subject":"a lighthouse"}}'`,
    fetchJs: `const res = await fetch("${apiBase}/prompts?q=logo&limit=3");\nconst { items } = await res.json();\nconsole.log(items[0].title, items[0].url);`,
  };
}
