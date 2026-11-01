// "Geliştiriciler" sayfası (docs/history/301-*): MCP adresi + kopyalama, API örnekleri, kurallar, ziyaretçiye açık, İngilizce, telefonda taşma yok ve
// sayfaya giden bağlantılar (geniş kenar çubuğu, Ayarlar, telefonda hesap menüsü). Ağ taklitli; gerçek cihaza/Supabase'e KARŞI DENENMEDİ.
// Derleme adresi: NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co (CI ile aynı).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = 4203;
const BASE = `http://localhost:${PORT}/promptly`;
const MCP = "https://example.supabase.co/functions/v1/mcp";
const API = "https://example.supabase.co/functions/v1/api/v1";
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
  await installMock(context, db, { guest });
  await context.addInitScript(([l]) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); } catch {} }, [lang]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/developers-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };

await scenario("1 the page shows the MCP address, the tool list and the rules", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "Geliştiriciler", level: 1 }).waitFor();
  await page.locator("pre", { hasText: MCP }).first().waitFor();
  for (const tool of ["search_prompts", "popular_prompts", "get_prompt", "fill_prompt"]) await page.locator("code", { hasText: tool }).waitFor();
  await page.getByRole("heading", { name: "Bilmen gerekenler" }).waitFor();
  await page.getByText(/dakikada yaklaşık 60 istek.*429.*Retry-After/).waitFor(); // adil kullanım sınırı sayısı koddan gelir (docs/history/302-*)
  await page.locator("pre", { hasText: `claude mcp add --transport http promptly ${MCP}` }).waitFor();
  await shot(page, "developers-desktop");
});

await scenario("2 the API section shows the base address, curl examples and the OpenAPI link", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.locator("pre", { hasText: new RegExp(`^${API.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`) }).waitFor();
  await page.locator("pre", { hasText: `curl "${API}/prompts?q=` }).waitFor();
  await page.locator("pre", { hasText: `${API}/prompts/<id>/fill` }).waitFor();
  assert.equal(await page.getByRole("link", { name: "openapi.json" }).getAttribute("href"), `${API}/openapi.json`);
});

await scenario("3 the copy button puts the address on the clipboard and confirms", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  const button = page.getByRole("button", { name: /Kopyala: Bağlayıcı adresi/ });
  await button.click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), MCP);
  await page.getByText("Kopyalandı").waitFor({ state: "attached" });
});

await scenario("4 a signed-out visitor reads it without logging in", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "Geliştiriciler", level: 1 }).waitFor();
  assert.ok(!/\/login/.test(page.url()), "no redirect to login");
}, { guest: true });

await scenario("5 English labels", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "Developers", level: 1 }).waitFor();
  await page.getByRole("heading", { name: "Connect to Claude (MCP)" }).waitFor();
  await page.getByRole("heading", { name: "Good to know" }).waitFor();
  await page.getByText(/about 60 requests per minute per IP.*429.*Retry-After/).waitFor();
  await page.getByRole("button", { name: /Copy: Connector address/ }).waitFor();
}, { lang: "en" });

await scenario("6 phone: nothing overflows sideways", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "Geliştiriciler", level: 1 }).waitFor();
  assert.ok(await overflowFree(page));
  await shot(page, "developers-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("7 the wide sidebar links to it (also for visitors)", async ({ page }) => {
  await page.goto(BASE + "/privacy/");
  const link = page.locator("aside[data-app-chrome]").getByRole("link", { name: "Geliştiriciler" });
  assert.match(await link.getAttribute("href"), /\/developers\/?$/);
  await link.click();
  await page.waitForURL(/\/developers\/?$/);
}, { guest: true });

await scenario("8 Settings has a row for it", async ({ page }) => {
  await page.goto(BASE + "/settings/developer/");
  await page.getByRole("heading", { name: "Geliştirici", level: 1 }).waitFor();
  const row = page.getByRole("link", { name: /Geliştirici belgeleri/ }).first();
  await row.click();
  await page.waitForURL(/\/developers\/?$/);
});

await scenario("9 phone: the account menu links to it", async ({ page }) => {
  await page.goto(BASE + "/settings/");
  await page.getByRole("button", { name: "Hesap menüsü" }).click();
  const item = page.getByRole("menu", { name: "Hesap menüsü" }).getByRole("menuitem", { name: "Geliştiriciler" });
  assert.match(await item.getAttribute("href"), /\/developers\/?$/);
  await item.click();
  await page.waitForURL(/\/developers\/?$/);
  assert.equal(await page.getByRole("menu").count(), 0, "menu closes on navigation");
}, { viewport: { width: 390, height: 844 } });

await scenario("10 other clients: ChatGPT steps and one block per client with ITS OWN address key", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "ChatGPT", level: 3, exact: true }).waitFor();
  await page.getByText(/geliştirici modunu aç/).waitFor();
  const clients = page.locator("[data-dev-clients]");
  for (const name of ["Cursor", "VS Code", "Windsurf", "Gemini CLI", "Codex CLI"]) await clients.getByRole("heading", { name, level: 3 }).waitFor();
  await clients.locator("pre", { hasText: `"url": "${MCP}"` }).first().waitFor(); // Cursor
  await clients.locator("pre", { hasText: '"type": "http"' }).waitFor(); // VS Code
  await clients.locator("pre", { hasText: `"serverUrl": "${MCP}"` }).waitFor(); // Windsurf
  await clients.locator("pre", { hasText: `gemini mcp add --transport http --scope user promptly ${MCP}` }).waitFor();
  await clients.locator("pre", { hasText: `[mcp_servers.promptly]` }).waitFor();
  await page.getByRole("heading", { name: "Claude Desktop (yerel paket)" }).waitFor();
  await page.locator("pre", { hasText: '"command": "npx"' }).waitFor();
  await shot(page, "developers-clients");
});

await scenario("11 the API section also shows Python and the no-code note", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.locator("pre", { hasText: `requests.get("${API}/prompts"` }).waitFor();
  await page.getByRole("heading", { name: "Zapier, Make, n8n" }).waitFor();
});

await scenario("12 English client labels and copy button for a client block", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "Code editors and command-line tools" }).waitFor();
  await page.getByRole("heading", { name: "Claude Desktop (local package)" }).waitFor();
  await page.getByRole("button", { name: /Copy: Windsurf/ }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), JSON.stringify({ mcpServers: { promptly: { serverUrl: MCP } } }, null, 2));
}, { lang: "en" });

await scenario("13 phone: the client blocks do not overflow sideways", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.locator("[data-dev-clients]").scrollIntoViewIfNeeded();
  assert.ok(await overflowFree(page));
  await shot(page, "developers-clients-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("14 the personal-key section: curl examples, the personal MCP address with its key header, the rules and a link to Settings", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  const me = page.locator("[data-dev-me]");
  await page.getByRole("heading", { name: "Hesabınla kullan (kişisel anahtar)" }).waitFor();
  await me.locator("pre", { hasText: `curl "${API}/me"` }).waitFor();
  await me.locator("pre", { hasText: `${API}/me/prompts?status=draft` }).waitFor();
  await me.locator("pre", { hasText: "@promptly-prompts.json" }).waitFor();
  await me.locator("pre", { hasText: new RegExp(`^${MCP.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/me$`) }).waitFor();
  await me.locator("pre", { hasText: "--header \"Authorization: Bearer pmt_YOUR_KEY\"" }).waitFor();
  await me.getByText(/«Oturum açma yok» yapıp bir istek başlığı ekleyebilirsin/).waitFor();
  await me.getByText("Hesabınla giriş (OAuth) — deneysel").waitFor();
  assert.ok(!(await page.locator("body").innerText()).match(/pmt_[A-Za-z0-9_-]{43}/), "no real-looking key on the page");
  const link = page.getByRole("link", { name: "Anahtar oluştur" });
  assert.match(await link.getAttribute("href"), /\/settings\/developer\/?$/);
  await page.getByText(/okumada dakikada 120, yazmada dakikada 30/).waitFor();
  await shot(page, "developers-me");
});

await scenario("15 English personal-key section and a working copy button", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "Use your own account (personal key)" }).waitFor();
  await page.getByText(/A key is like a password/).waitFor();
  await page.getByRole("button", { name: /Copy: Check who you are/ }).click();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes(`${API}/me`));
}, { lang: "en" });

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(`${s}  ${n}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
