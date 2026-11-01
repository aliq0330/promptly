# 312 — Geliştiriciler sayfası: diğer araçlarda kurulum

**Sorun:** `/developers` (301) uzak MCP için tek bir "Cursor ve diğer istemciler" JSON'u gösteriyordu; ama istemciler adres anahtarını
farklı adlandırır, o JSON yalnız Cursor'da çalışır. ChatGPT, Claude Desktop (yerel), Python ve no-code araçlar hiç yoktu.

**Yapılan:** `lib/developers.ts` her istemcinin KENDİ biçimini üretir (saf, birim testli): Cursor `url`, VS Code `servers`+`type:"http"`,
Windsurf `serverUrl`, Gemini CLI (`gemini mcp add --transport http --scope user`), Codex CLI (`[mcp_servers.promptly] url`),
Claude Desktop yerel `npx` JSON'u, Python `requests`. Sayfada ChatGPT adımları (yalnız metin), "Kod editörleri ve komut satırı araçları"
kutusu (kopyalanabilir blok/istemci), Claude Desktop, API bölümünde Python + Zapier/Make/n8n notu. TR+EN çeviriler eklendi.

**Doğrulama:** `developers.test.ts` (4), `run-developers.mjs` 13/13 (ağ taklitli; telefonda taşma yok, İngilizce, kopyalama).
**Denenmedi:** hiçbir istemcide GERÇEK kurulum. Biçimler üçüncü taraf kurulum kılavuzlarından doğrulandı (resmî belge değil); menü yolları
(özellikle ChatGPT geliştirici modu, plan şartları) sürüme göre değişir, sayfa metni bunu söyler.
