// Ekipler başlığı (docs/history/350-*): ekip = "tamamen kapalı" topluluk. /teams listesi, Ekip oluştur, Topluluklar'dan ayrışma, gezinme girişleri,
// ekip sayfasında "ekip" dili ve Space'ler-ilk sekme sırası, görünürlük ayarının kilidi, Mesajlar'da "Ekip sohbetleri" kapısı, TR/EN, telefon.
// Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (kurallar: supabase/tests/teams-home.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { setupSpaces } from "./mock-spaces.mjs";
import { installDetailData } from "./detail-fixtures.mjs";

const PORT = 4217;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const T1 = "c1000000-0000-4000-8000-000000000b01";
const T2 = "c1000000-0000-4000-8000-000000000b02";
const OPEN = "c1000000-0000-4000-8000-000000000b03";
const RESTRICTED = "c1000000-0000-4000-8000-000000000b04";
const calls = (db, name) => db.calls.filter((c) => c.method === "RPC" && c.table === name);
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

/** İki ekip (biri benim yönettiğim, 2 Space'li) + bir herkese açık + bir kapalı topluluk. */
function seed(db, { teams = true } = {}) {
  if (teams) {
    db.addCommunity(T1, { name: "Ekip Atölyesi", visibility: "private", myRole: "owner", members: [[U.bob, "admin"], [U.carol, "member"]], description: "Pazarlama ekibi" });
    db.addCommunity(T2, { name: "Destek Ekibi", visibility: "private", myRole: "member", members: [[U.bob, "owner"]] });
    for (let i = 1; i <= 2; i += 1) db.addSpace(i, { owner: ME, communityId: T1, kind: "moodboard", title: `Pano ${i}`, members: [[U.bob, "editor"]], created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-02T10:00:00Z" });
  }
  db.addCommunity(OPEN, { name: "Açık Topluluk", visibility: "public", myRole: "owner", members: [[U.bob, "member"]] });
  db.addCommunity(RESTRICTED, { name: "Kapalı Topluluk", visibility: "restricted", myRole: "member", members: [[U.bob, "owner"]] });
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup = seed } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  setupSpaces(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/teams-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

await scenario("1. /teams: yalnız üye olduğum tamamen kapalı topluluklar (ekipler) listelenir; açık ve kapalı topluluk listelenmez; kartta üye + Space sayısı", async ({ page, db }) => {
  await page.goto(`${BASE}/teams`);
  await page.getByRole("heading", { name: "Ekipler", exact: true }).waitFor();
  const list = page.getByTestId("teams-list");
  await list.waitFor();
  assert.equal(await list.locator("li").count(), 2);
  const card = page.locator(`[data-team-card="${T1}"]`);
  await card.getByText("Ekip Atölyesi").waitFor();
  await card.getByText("2 Space").waitFor();
  await card.getByText("3 üye").waitFor();
  assert.equal(await page.getByText("Açık Topluluk").count(), 0);
  assert.equal(await page.getByText("Kapalı Topluluk").count(), 0);
  assert.equal(calls(db, "list_my_teams").length, 1, "tek RPC");
});

await scenario("2. Ekip kartı: 'Space'ler' ekibin Space'ler sekmesine, 'Ekip sohbeti' ekip sohbetine gider", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  const card = page.locator(`[data-team-card="${T1}"]`);
  assert.match(await card.locator("[data-team-open-spaces]").getAttribute("href"), new RegExp(`communities/local/?\\?id=${T1}&tab=spaces`));
  assert.match(await card.locator("[data-team-open-chat]").getAttribute("href"), new RegExp(`messages/local/?\\?id=${T1}`));
});

await scenario("3. ekibim yoksa: boş durum + davet ipucu; 'Ekip oluştur' pencereyi açar", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  await page.getByText("Henüz bir ekibin yok").waitFor();
  const link = page.getByRole("link", { name: "Davetlerime bak" });
  assert.match(await link.getAttribute("href"), /communities\/?\?tab=invites/);
  await page.locator("[data-team-create]").click();
  await page.getByRole("dialog").last().getByRole("heading", { name: "Ekip oluştur" }).waitFor();
}, { setup: (db) => seed(db, { teams: false }) });

await scenario("4. Ekip oluştur: görünürlük seçici/kategori/akış/kurallar YOK, 'tamamen kapalı' notu var; gönderim p_visibility=private; ekibin Space'ler sekmesine gider", async ({ page, db }) => {
  await page.goto(`${BASE}/teams`);
  await page.locator("[data-team-create]").click();
  const d = page.getByRole("dialog").last();
  await d.getByRole("heading", { name: "Ekip oluştur" }).waitFor();
  await d.locator("[data-team-private-note]").waitFor();
  assert.equal(await d.getByRole("radio", { name: /^(Herkese açık|Kapalı|Tamamen kapalı)/ }).count(), 0, "görünürlük seçilmez");
  assert.equal(await d.getByLabel("Kategori").count(), 0);
  await d.getByLabel("Ekip adı").fill("Yeni Ekip");
  await d.getByRole("button", { name: "Ekibi oluştur" }).click();
  await page.waitForURL(/communities\/local\/?\?id=.*tab=spaces/);
  const call = calls(db, "create_community")[0].body;
  assert.equal(call.p_visibility, "private");
  assert.equal(call.p_name, "Yeni Ekip");
});

await scenario("5. Topluluklar sayfası ekipleri GÖSTERMEZ: Topluluklarım ve Yönettiklerim listelerinde yalnız açık/kapalı topluluklar", async ({ page, db }) => {
  await page.goto(`${BASE}/communities?tab=mine`);
  await page.getByText("Açık Topluluk").first().waitFor();
  await page.getByText("Kapalı Topluluk").first().waitFor();
  assert.equal(await page.getByText("Ekip Atölyesi").count(), 0);
  assert.equal(await page.getByText("Destek Ekibi").count(), 0);
  assert.ok(calls(db, "list_my_communities").length >= 1);
  // Yönettiklerim sekmesi: yalnız ekip yönettiğim için değil, açık topluluk yönettiğim için var; listede ekip yok.
  await page.goto(`${BASE}/communities?tab=managed`);
  await page.getByText("Açık Topluluk").first().waitFor();
  assert.equal(await page.getByText("Ekip Atölyesi").count(), 0);
});

await scenario("6. Gezinme: masaüstü kenar çubuğunda 'Ekipler' (Kütüphanem grubu) /teams'e gider; telefonda hesap menüsünde", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  const side = page.getByRole("complementary", { name: "Yan menü" });
  const link = side.getByRole("link", { name: "Ekipler" });
  await link.waitFor();
  assert.match(await link.getAttribute("href"), /\/teams/);
});

await scenario("6b. Telefon: hesap menüsünde 'Ekipler' bağlantısı var; yatay taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  await page.getByTestId("teams-list").waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await page.getByRole("button", { name: "Hesap menüsü" }).click();
  await page.getByRole("menu", { name: "Hesap menüsü" }).getByRole("menuitem", { name: "Ekipler" }).waitFor();
}, { viewport: { width: 390, height: 844 } });

await scenario("7. Mesajlar menüsü: 'Ekip sohbetleri' ayrı kapı — Ekipler'e gider; 'Topluluklara git' kapısı durur", async ({ page }) => {
  await page.goto(`${BASE}/messages`);
  await page.locator("[data-section-menu]:visible").first().click();
  await page.getByRole("radio", { name: "Topluluklara git" }).waitFor();
  await page.getByRole("radio", { name: "Ekip sohbetleri" }).click();
  await page.waitForURL(/\/teams\/?$/);
});

await scenario("8. Ekip sayfası: kapak 'Ekip' yazar, ilk sekme Space'ler, Akış 'Paylaşımlar'; 'Ekip sohbetini aç'; görünürlük etiketi 'Ekip · tamamen kapalı'", async ({ page }) => {
  await page.goto(`${BASE}/communities/local?id=${T1}`);
  await page.locator("h1").first().waitFor();
  await page.getByTestId("team-spaces").waitFor();
  await page.getByText("Ekip", { exact: true }).first().waitFor();
  await page.getByText("Ekip · tamamen kapalı").first().waitFor();
  await page.locator("[data-open-chat]").getByText("Ekip sohbetini aç").waitFor();
  await page.locator("[data-section-menu]").first().click();
  const names = (await page.locator("[data-section-option]").allInnerTexts()).map((x) => x.split("\n")[0].trim());
  assert.deepEqual(names.slice(0, 2), ["Space'ler", "Paylaşımlar"]);
  assert.ok(!names.includes("Akış"));
});

await scenario("9. Ayarlar: ekipte görünürlük değiştirilemez (not var, seçici yok); toplulukta yalnız iki düzey seçilir", async ({ page }) => {
  await page.goto(`${BASE}/communities/local?id=${T1}&tab=manage&section=settings`);
  await page.locator("[data-team-visibility-note]").waitFor();
  assert.equal(await page.getByRole("radio", { name: /^(Herkese açık|Kapalı|Tamamen kapalı)/ }).count(), 0);
  await page.goto(`${BASE}/communities/local?id=${OPEN}&tab=manage&section=settings`);
  await page.getByRole("radio", { name: /^Herkese açık/ }).waitFor();
  assert.equal(await page.getByRole("radio", { name: /^(Herkese açık|Kapalı|Tamamen kapalı)/ }).count(), 2);
  assert.equal(await page.getByRole("radio", { name: /^Tamamen kapalı/ }).count(), 0);
});

await scenario("10. İngilizce + telefon: Teams başlığı, kart, boş durum, oluşturma penceresi çevrili; yatay taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/teams`);
  await page.getByRole("heading", { name: "Teams", exact: true }).waitFor();
  await page.getByText("2 Spaces").waitFor();
  await page.locator(`[data-team-card="${T1}"] [data-team-open-chat]`).getByText("Team chat").waitFor();
  await page.locator("[data-team-create]").click();
  const d = page.getByRole("dialog").last();
  await d.getByRole("heading", { name: "Create a team" }).waitFor();
  await d.getByLabel("Team name").waitFor();
  assert.ok(await overflowFree(page));
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/communities/local?id=${T1}`);
  await page.getByText("Open team chat").waitFor();
  await page.locator("[data-section-menu]").first().click();
  const names = (await page.locator("[data-section-option]").allInnerTexts()).map((x) => x.split("\n")[0].trim());
  assert.deepEqual(names.slice(0, 2), ["Spaces", "Posts"]);
}, { viewport: { width: 390, height: 844 }, lang: "en" });

console.log(results.map(([status, name]) => `${status === "PASS" ? "✓" : "✗"} ${name}`).join("\n"));
const failed = results.filter(([status]) => status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
