// Ekip / Topluluk / Space oluşturma: telefonda kendi adresi olan tam ekran sayfa, tablet/masaüstünde pencere (docs/history/473-*).
// Ağ taklitli. Gerçek Supabase'e KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { setupSpaces } from "./mock-spaces.mjs";

const BASE = `http://localhost:${process.env.PORT ?? 4197}/promptly`;
const server = await serve(Number(process.env.PORT ?? 4197));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function scenario(name, fn, viewport) {
  const db = createDb();
  setupCommunities(db);
  setupSpaces?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.addInitScript(() => { try { localStorage.setItem("promptly-language", "tr"); localStorage.setItem("promptly-tour-seen", "1"); } catch {} });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  try { await fn({ page, db }); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", `${name}\n      ${String(e.message).split("\n").slice(0, 6).join("\n      ")}`]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/create-fail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const KINDS = [
  ["teams", "/teams/new", "Ekip oluştur"],
  ["communities", "/communities/new", "Topluluk oluştur"],
  ["spaces", "/spaces/new", "Yeni Space"],
];

for (const [kind, href, title] of KINDS) {
  await scenario(`telefon: ${href} tam ekran sayfa (uygulama menüsü yok, altta tam genişlik birincil eylem)`, async ({ page }) => {
    await page.goto(`${BASE}${href}`);
    const shell = page.locator("[data-create-page]");
    await shell.waitFor();
    assert.equal(await page.locator("html[data-compose-open]").count(), 1, "uygulama menüleri gizli");
    assert.ok((await shell.getByRole("heading", { name: title }).count()) >= 1, "başlık");
    const footer = page.locator("[data-create-page-footer]");
    await footer.waitFor();
    const primary = footer.locator("> *:last-child");
    const box = await primary.boundingBox();
    assert.ok(box.width > PHONE.width - 40, `birincil eylem tam genişlik (${box.width})`);
    assert.ok(box.height >= 44, `eylem yüksekliği ${box.height}`);
    assert.equal(await shell.locator("[data-create-page-body] input, [data-create-page-body] textarea").first().isVisible(), true, "form alanı");
  }, PHONE);

  await scenario(`masaüstü: ${href} liste sayfasına yönlenir ve pencere açılır`, async ({ page }) => {
    await page.goto(`${BASE}${href}`);
    await page.waitForURL(new RegExp(`/promptly/${kind}/?(\\?.*)?$`));
    await page.locator("[role=dialog]").first().waitFor();
    assert.equal(await page.locator("[data-create-page]").count(), 0, "tam ekran sayfa yok");
    assert.ok(!page.url().includes("new=1"), "parametre adresten silindi");
  }, DESKTOP);
}

await scenario("telefon: Ekipler'de Ekip oluştur düğmesi /teams/new adresine götürür", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  await page.locator("[data-team-create]").first().click();
  await page.waitForURL(/\/teams\/new\/?$/);
  await page.locator("[data-create-page]").waitFor();
}, PHONE);

await scenario("masaüstü: Ekipler'de Ekip oluştur pencere açar (sayfa değişmez)", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  await page.locator("[data-team-create]").first().click();
  await page.locator("[role=dialog]").first().waitFor();
  assert.ok(/\/teams\/?$/.test(new URL(page.url()).pathname), page.url());
}, DESKTOP);

for (const [s, r] of results) console.log(`${s} ${r}`);
console.log(`${results.filter(([s]) => s === "PASS").length}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(results.some(([s]) => s === "FAIL") ? 1 : 0);
