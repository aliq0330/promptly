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
  /** İstemciler adres anahtarını farklı adlandırır: Cursor `url`, VS Code `servers`+`type`, Windsurf `serverUrl`, Gemini CLI `httpUrl`, Codex TOML. */
  cursorJson: string;
  vscodeJson: string;
  windsurfJson: string;
  geminiCli: string;
  codexToml: string;
  localNpx: string;
  claudeDesktopJson: string;
  curlSearch: string;
  curlGet: string;
  curlFill: string;
  fetchJs: string;
  pythonRequests: string;
}

export function developerSnippets(endpoints: DeveloperEndpoints): DeveloperSnippets {
  const { mcpUrl, apiBase } = endpoints;
  return {
    claudeCode: `claude mcp add --transport http promptly ${mcpUrl}`,
    cursorJson: JSON.stringify({ mcpServers: { promptly: { url: mcpUrl } } }, null, 2),
    vscodeJson: JSON.stringify({ servers: { promptly: { type: "http", url: mcpUrl } } }, null, 2),
    windsurfJson: JSON.stringify({ mcpServers: { promptly: { serverUrl: mcpUrl } } }, null, 2),
    geminiCli: `gemini mcp add --transport http --scope user promptly ${mcpUrl}`,
    codexToml: `[mcp_servers.promptly]\nurl = "${mcpUrl}"`,
    localNpx: "claude mcp add promptly -- npx -y promptly-mcp",
    claudeDesktopJson: JSON.stringify({ mcpServers: { promptly: { command: "npx", args: ["-y", "promptly-mcp"] } } }, null, 2),
    curlSearch: `curl "${apiBase}/prompts?q=cyberpunk&content_type=image&limit=5"`,
    curlGet: `curl "${apiBase}/prompts/<id>"`,
    curlFill: `curl -X POST "${apiBase}/prompts/<id>/fill" \\\n  -H "Content-Type: application/json" \\\n  -d '{"values":{"subject":"a lighthouse"}}'`,
    fetchJs: `const res = await fetch("${apiBase}/prompts?q=logo&limit=3");\nconst { items } = await res.json();\nconsole.log(items[0].title, items[0].url);`,
    pythonRequests: `import requests\n\nres = requests.get("${apiBase}/prompts", params={"q": "logo", "limit": 3})\nfor item in res.json()["items"]:\n    print(item["title"], item["url"])`,
  };
}
