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

await scenario("14 the account section: the wizard first, then curl examples, the personal MCP address with its key header, the rules and a link to Settings", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  const account = page.locator("#dev-account");
  await account.getByRole("heading", { name: "Hesabınla bağla", level: 2 }).waitFor();
  await account.locator("[data-dev-connect]").getByText("Deneysel", { exact: true }).waitFor();
  const me = page.locator("[data-dev-me]");
  await page.getByRole("heading", { name: "Kodla kullan (kişisel anahtar)", level: 3 }).waitFor();
  await me.locator("pre", { hasText: `curl "${API}/me"` }).waitFor();
  await me.locator("pre", { hasText: `${API}/me/prompts?status=draft` }).waitFor();
  await me.locator("pre", { hasText: "@promptly-prompts.json" }).waitFor();
  await me.locator("pre", { hasText: new RegExp(`^${MCP.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/me$`) }).waitFor();
  await me.locator("pre", { hasText: "--header \"Authorization: Bearer pmt_YOUR_KEY\"" }).waitFor();
  await me.getByText(/«Oturum açma yok» yapıp bir istek başlığı ekleyebilirsin/).waitFor();
  assert.ok(!(await page.locator("body").innerText()).match(/pmt_[A-Za-z0-9_-]{43}/), "no real-looking key on the page");
  const link = page.getByRole("link", { name: "Anahtar oluştur" });
  assert.match(await link.getAttribute("href"), /\/settings\/developer\/?$/);
  await page.getByText(/okumada dakikada 120, yazmada dakikada 30/).waitFor();
  await shot(page, "developers-me");
});

await scenario("15 English personal-key section and a working copy button", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "Use from code (personal key)" }).waitFor();
  await page.getByText(/A key is like a password/).waitFor();
  await page.getByRole("button", { name: /Copy: Check who you are/ }).click();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes(`${API}/me`));
}, { lang: "en" });

const SECTION_IDS = ["dev-start", "dev-mcp", "dev-account", "dev-api", "dev-editors", "dev-rules"];
const pager = (page) => page.locator("[data-dev-pager]");
const inView = (page, id) => page.evaluate((i) => { const top = document.getElementById(i).getBoundingClientRect().top; return top > -40 && top < 260; }, id);

await scenario("16 the page is six sections in a fixed order, each labelled 'Bölüm n / 6', and there is NO table of contents at the top", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.getByRole("heading", { name: "Geliştiriciler", level: 1 }).waitFor();
  const ids = await page.locator("[data-dev-section]").evaluateAll((els) => els.map((el) => el.id));
  assert.deepEqual(ids, SECTION_IDS);
  for (let n = 1; n <= 6; n++) await page.getByText(`Bölüm ${n} / 6`, { exact: true }).waitFor();
  assert.equal(await page.locator("main nav").count(), 1, "the only in-page navigation is the floating pager");
  await page.getByRole("heading", { name: "Hangi yolu seçmeliyim?", level: 2 }).waitFor();
  await page.getByRole("heading", { name: "Hesabınla bağla", level: 2 }).waitFor();
  await page.getByRole("heading", { name: "Kod editörleri ve komut satırı araçları", level: 2 }).waitFor();
});

await scenario("17 the floating pager starts on section 1, ▲ is disabled; ▼ goes to the next section and the label + progress follow", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  const bar = pager(page);
  await bar.getByText("Başlangıç", { exact: true }).waitFor();
  await bar.getByText("1 / 6", { exact: true }).waitFor();
  assert.equal(await bar.getByRole("button", { name: "Önceki bölüm" }).isDisabled(), true);
  await bar.getByRole("button", { name: "Sonraki bölüm" }).click();
  await bar.getByText("Claude'a bağla", { exact: true }).waitFor();
  await bar.getByText("2 / 6", { exact: true }).waitFor();
  await page.waitForFunction(() => { const top = document.getElementById("dev-mcp").getBoundingClientRect().top; return top > -40 && top < 260; });
  assert.equal(await bar.getByRole("button", { name: "Önceki bölüm" }).isDisabled(), false);
  await bar.getByRole("button", { name: "Önceki bölüm" }).click();
  await bar.getByText("1 / 6", { exact: true }).waitFor();
});

await scenario("18 tapping the name opens the section list; choosing a section scrolls there and closes the list; Escape closes it too", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  const bar = pager(page);
  await bar.getByRole("button", { name: /Bölüm listesi/ }).click();
  const list = bar.locator("[data-dev-pager-list]");
  assert.equal(await list.getByRole("button").count(), 6);
  assert.equal(await list.getByRole("button", { name: /Başlangıç/ }).getAttribute("aria-current"), "true");
  await list.getByRole("button", { name: /HTTP API/ }).click();
  await list.waitFor({ state: "detached" });
  await page.waitForFunction(() => { const top = document.getElementById("dev-api").getBoundingClientRect().top; return top > -40 && top < 260; });
  await bar.getByText("4 / 6", { exact: true }).waitFor();
  await bar.getByRole("button", { name: /Bölüm listesi/ }).click();
  await list.waitFor();
  await page.keyboard.press("Escape");
  await list.waitFor({ state: "detached" });
});

await scenario("19 the start cards jump to their sections (account card → 'Hesabınla bağla')", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.locator("[data-dev-start='dev-account']").click();
  await page.waitForFunction(() => { const top = document.getElementById("dev-account").getBoundingClientRect().top; return top > -40 && top < 260; });
  await pager(page).getByText("Hesabınla bağla", { exact: true }).waitFor();
  assert.ok(await inView(page, "dev-account"));
});

await scenario("20 at the very bottom the last section is current and ▼ is disabled", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bar = pager(page);
  await bar.getByText("Bilmen gerekenler", { exact: true }).waitFor();
  await bar.getByText("6 / 6", { exact: true }).waitFor();
  assert.equal(await bar.getByRole("button", { name: "Sonraki bölüm" }).isDisabled(), true);
});

await scenario("21 phone: the pager floats ABOVE the bottom nav, inside the screen, and nothing overflows sideways", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  const bar = pager(page);
  await bar.waitFor();
  const nav = await page.locator("nav[data-app-nav]").boundingBox();
  const box = await bar.boundingBox();
  assert.ok(box.y + box.height <= nav.y + 0.5, `pager (${box.y + box.height}) sits above the nav (${nav.y})`);
  assert.ok(box.x >= 0 && box.x + box.width <= 390, "pager is inside the screen");
  await bar.getByRole("button", { name: /Bölüm listesi/ }).click();
  const list = await bar.locator("[data-dev-pager-list]").boundingBox();
  assert.ok(list.x >= 0 && list.x + list.width <= 390 && list.y >= 0, "the list fits the screen");
  assert.ok(await overflowFree(page));
  await shot(page, "developers-pager-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("22 English pager labels", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  const bar = pager(page);
  await bar.getByRole("button", { name: "Next section" }).waitFor(); // dil yüklenene kadar Türkçe çizilir
  assert.equal(await bar.getAttribute("aria-label"), "Page sections");
  await bar.getByRole("button", { name: "Next section" }).click();
  await bar.getByText("Connect to Claude", { exact: true }).waitFor();
  await bar.getByRole("button", { name: /Section list/ }).click();
  await bar.getByRole("button", { name: /Good to know/ }).waitFor();
}, { lang: "en" });

await scenario("23 the account wizard works on /developers too (same component): route tiles, step 1/5, the key route has 8 steps", async ({ page }) => {
  await page.goto(BASE + "/developers/");
  const guide = page.locator("#dev-account [data-dev-connect]");
  await guide.getByText("Adım 1 / 5").waitFor();
  await guide.getByRole("heading", { name: "Uygulamanı aç", level: 3 }).waitFor();
  await guide.getByRole("radio", { name: /Anahtarla bağlan/ }).click();
  await guide.getByText("Adım 1 / 8").waitFor();
  const link = guide.getByRole("link", { name: "Anahtarlarım'a git" });
  assert.match(await link.getAttribute("href"), /\/settings\/developer\/?$/);
});

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(`${s}  ${n}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
