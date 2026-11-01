# Promptly MCP

Use [Promptly](https://aliq0330.github.io/promptly)'s public prompt library from Claude, Cursor, VS Code and any other
[MCP](https://modelcontextprotocol.io) client: search prompts, read them with their `{variables}`, and get the filled-in text.

*Türkçesi aşağıda.*

## No install: use the hosted URL

Promptly also runs this MCP server on the internet, so nothing has to be installed on your computer. Add this address as a **remote MCP
server / custom connector** in a client that supports them (no account, no key; read-only):

```
https://xqxybhjcyrvaroknucdq.supabase.co/functions/v1/mcp
```

- **Claude Code:** `claude mcp add --transport http promptly https://xqxybhjcyrvaroknucdq.supabase.co/functions/v1/mcp`
- **Claude (claude.ai and the apps):** Settings → Connectors → *Add custom connector* → paste the address. Availability depends on your plan.
- **Cursor and other clients:** `{ "mcpServers": { "promptly": { "url": "https://xqxybhjcyrvaroknucdq.supabase.co/functions/v1/mcp" } } }`

The hosted version offers the four tools and the `find-prompt` prompt (it does not list the popular prompts as MCP prompts — it keeps no
session). Opening the address in a browser shows a short status JSON. It is untested in claude.ai specifically.

## Install (runs on your computer)

No account and no API key needed. Requires Node.js 18.17+.

**Claude Code**

```sh
claude mcp add promptly -- npx -y promptly-mcp
```

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`~/.cursor/mcp.json`) and most other clients:

```json
{
  "mcpServers": {
    "promptly": { "command": "npx", "args": ["-y", "promptly-mcp"] }
  }
}
```

## What you get

| Tool | What it does |
|---|---|
| `search_prompts` | Search by text, type (image/text/audio/video), category, tags, AI tool; paged |
| `popular_prompts` | Most copied or liked prompts, optionally from the last week/month/year |
| `get_prompt` | Full prompt: text, variables (defaults, options), tools, tags, author credit and link |
| `fill_prompt` | Fill the `{variables}` and get the final text |

**Prompts:** `find-prompt` ("describe what you want to create") plus the 20 most copied Promptly prompts, with their variables as
arguments. In Claude Code they appear as `/mcp__promptly__…` commands.

Try: *"Find me a Promptly prompt for a cozy coffee shop logo and fill it for 'Kahve Durağı'."*

## Good to know

- **Read-only.** Nothing is written to Promptly. It sees exactly what a signed-out visitor of the website sees: published, public
  prompts (community-only content is excluded).
- **User-generated content.** Prompt texts are written by Promptly users. The server tells the model to treat them as data, never as
  instructions — still, read a prompt before you run it somewhere that matters.
- **Credit the author.** Every prompt carries `source` (author + link). Keep it when you share or reuse a prompt.
- Using a prompt here does not count as a "copy" on Promptly yet.

### Settings (optional environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PROMPTLY_MCP_PROMPTS` | `20` | How many popular prompts to offer as MCP prompts (`0` = only `find-prompt`) |
| `PROMPTLY_SUPABASE_URL`, `PROMPTLY_SUPABASE_ANON_KEY` | built in | Point at another Promptly deployment |

There is also an HTTP API with the same data: `https://<project>.supabase.co/functions/v1/api/v1` (OpenAPI document at
`/v1/openapi.json`).

---

## Türkçe

**Kurulumsuz kullanım:** Promptly bu MCP sunucusunu internette de çalıştırıyor. Uzak MCP sunucusu / özel bağlayıcı destekleyen bir istemciye şu adresi
ekle (hesap ve anahtar gerekmez, yalnız okur): `https://xqxybhjcyrvaroknucdq.supabase.co/functions/v1/mcp` — Claude Code: `claude mcp add --transport http promptly https://xqxybhjcyrvaroknucdq.supabase.co/functions/v1/mcp`; claude.ai ve
uygulamalar: Ayarlar → Bağlayıcılar → *Özel bağlayıcı ekle* (kullanılabilirlik planına bağlı). Bu sürüm dört aracı ve `find-prompt`'u sunar; oturum
tutmadığı için popüler prompt'ları MCP prompt'u olarak listelemez. claude.ai'da özellikle denenmedi.

Promptly'nin herkese açık prompt kütüphanesini Claude, Cursor, VS Code ve diğer MCP istemcilerinin içinden kullan: prompt ara,
`{değişkenleriyle}` birlikte oku, doldurulmuş son metni al. Hesap ya da API anahtarı gerekmez (Node.js 18.17+).

**Kurulum:** Claude Code'da `claude mcp add promptly -- npx -y promptly-mcp`; Claude Desktop / Cursor için yukarıdaki JSON'u ayar
dosyasına ekle.

**Araçlar:** `search_prompts` (metin, tür, kategori, etiket, AI aracıyla arama), `popular_prompts` (en çok kopyalanan/beğenilen),
`get_prompt` (tam metin + değişkenler + yazar atfı), `fill_prompt` (değişkenleri doldurur). Ayrıca `find-prompt` ve en çok kopyalanan
20 prompt, değişkenleri argüman olarak, hazır prompt listesinde.

**Bilmen gerekenler:** yalnız okur, Promptly'ye hiçbir şey yazmaz; oturumsuz bir ziyaretçinin gördüğünü görür (topluluğa özgü içerik
hariç). Prompt metinleri kullanıcı içeriğidir — model onları talimat değil veri olarak alır. Bir promptu paylaşırken ya da yeniden
kullanırken yazar atfını (`source`) koru.
