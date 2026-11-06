// Ekip kütüphanesi (docs/history/348-*): yeni Space türü, sahibin onay işareti (rozet, süzgeç, Onayla/Onayı kaldır, metin değişince düşer),
// ekip ortak değişkenleri (yalnız üye görür, düzenleyici yazar, izleyici yalnız okur) ve "Doldur ve kopyala" penceresi. Ağ taklitli; gerçek
// Supabase'e KARŞI DENENMEDİ (kurallar: supabase/tests/space-team-library.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";
import { installDetailData } from "./detail-fixtures.mjs";

const PORT = 4215;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const D1 = "d1000000-0000-4000-8000-000000000001";
const D2 = "d1000000-0000-4000-8000-000000000002";
const D3 = "d1000000-0000-4000-8000-000000000003";
const calls = (db, name) => db.calls.filter((c) => c.method === "RPC" && c.table === name);
const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !(await fn())) await new Promise((r) => setTimeout(r, 100));
};
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

/** Üç taslak (biri onaylı) + iki ortak değişken. `me`: ben bu kütüphanede hangi roldeyim ("owner" → sahibi benim). */
function library(db, { me = "owner", visibility = "private" } = {}) {
  const owner = me === "owner" ? ME : U.bob.id;
  const members = me === "owner" ? [[U.bob, "editor"]] : me === "none" ? [] : [[U.alice, me]];
  const s = db.addSpace(1, { owner, kind: "team_library", title: "Pazarlama ekibi", visibility, members });
  db.addItem(s.id, { id: D1, kind: "prompt", is_draft: true, title: "Satış e-postası", body: "Merhaba {musteri}, {marka_adi} adına yazıyorum. Ton: {ton}", approved_at: "2026-11-05T10:00:00Z", approved_by: owner });
  db.addItem(s.id, { id: D2, kind: "prompt", is_draft: true, title: "Destek yanıtı", body: "Sayın {musteri}, talebiniz alındı." });
  db.addItem(s.id, { id: D3, kind: "prompt", is_draft: true, title: "Ham fikir", body: "Yalnızca düz metin, değişken yok." });
  db.spaceVariables.push({ space_id: s.id, name: "marka_adi", value: "Acme", updated_at: "2026-11-05T09:00:00Z" });
  db.spaceVariables.push({ space_id: s.id, name: "ton", value: "Samimi", updated_at: "2026-11-05T09:00:00Z" });
  return s;
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, setup = (db) => library(db) } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  setup?.(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await installDetailData(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => requests.push(r.url()));
  try {
    await fn({ page, db, requests });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/lib-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const row = (page, title) => page.locator("[data-prompt-row]").filter({ hasText: title });
const openApprovalMenu = async (page, option) => {
  await page.getByTestId("space-prompts").locator("[data-section-menu]").nth(1).click();
  await page.locator(`[data-section-option="${option}"]`).click();
};

await scenario("1. sahip: Space promptlara açılır; ortak değişkenler görünür; üç taslak, biri onaylı — rozetler ve 'Onaylı' süzgeci", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByTestId("space-prompts").waitFor();
  await page.locator('[data-library-variable="marka_adi"]').waitFor();
  assert.match(await page.locator('[data-library-variable="ton"]').textContent(), /Samimi/);
  assert.equal(await page.locator("[data-prompt-row]").count(), 3);
  assert.equal(await page.locator('[data-approval="approved"]').count(), 1);
  assert.equal(await page.locator('[data-approval="pending"]').count(), 2);
  await row(page, "Satış e-postası").locator('[data-approval="approved"]').waitFor();
  await openApprovalMenu(page, "approved");
  assert.equal(await page.locator("[data-prompt-row]").count(), 1, "yalnız onaylı");
  await openApprovalMenu(page, "pending");
  assert.equal(await page.locator("[data-prompt-row]").count(), 2, "yalnız onay bekleyen");
  await openApprovalMenu(page, "all");
  assert.equal(await page.locator("[data-prompt-row]").count(), 3);
  await shot(page, "library-owner");
});

await scenario("2. sahip onaylar ve onayı geri alır: RPC gider, rozet ve düğme değişir, etkinliğe yazılır", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=prompts`);
  const target = row(page, "Destek yanıtı");
  await target.waitFor();
  await target.getByRole("button", { name: "Onayla" }).click();
  await target.locator('[data-approval="approved"]').waitFor();
  const call = calls(db, "space_set_item_approval").at(-1);
  assert.deepEqual([call.body.p_item, call.body.p_approved], [D2, true]);
  await target.getByRole("button", { name: "Onayı kaldır" }).waitFor();
  assert.ok(db.spaceActivity.some((a) => a.action === "item_approved"), "etkinlik yazıldı");
  await target.getByRole("button", { name: "Onayı kaldır" }).click();
  await target.locator('[data-approval="pending"]').waitFor();
  assert.equal(calls(db, "space_set_item_approval").at(-1).body.p_approved, false);
  // Etkinlik sekmesi yeni eylemleri okunur cümleyle yazar.
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=activity`);
  await page.getByText(/"Destek yanıtı" promptunu onayladı/).waitFor();
  await page.getByText(/"Destek yanıtı" promptunun onayını kaldırdı/).waitFor();
});

await scenario("3. onaylı taslağın metni değişince onay DÜŞER (sunucu kuralı): düzenleyici kaydeder, rozet 'Onay bekliyor' olur", async ({ page, db }) => {
  // Burada ben düzenleyiciyim (Bob'un kütüphanesinde); onaylı taslağı düzenliyorum.
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=prompts`);
  const target = row(page, "Satış e-postası");
  await target.locator('[data-approval="approved"]').waitFor();
  assert.equal(await target.getByRole("button", { name: /Onayı kaldır|Onayla/ }).count(), 0, "düzenleyici onay düğmesi görmez");
  await target.getByRole("button", { name: "Taslağı düzenle" }).click();
  const dialog = page.getByTestId("draft-editor");
  await dialog.getByLabel("Prompt metni").fill("Yepyeni metin {musteri}");
  await dialog.getByRole("button", { name: /Kaydet/ }).click();
  await row(page, "Satış e-postası").locator('[data-approval="pending"]').waitFor();
  assert.equal(db.spaceItems.find((i) => i.id === D1).approved_at, null);
}, { setup: (db) => library(db, { me: "editor" }) });

await scenario("4. düzenleyici: değişken ekler, günceller, siler; geçersiz / yinelenen ad anında reddedilir; sınırlar sunucuda da var", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=prompts`);
  const panel = page.getByTestId("library-variables");
  await panel.waitFor();
  await panel.getByLabel("Değişken adı").fill("hedef kitle");
  await panel.getByLabel("Değer").fill("Genç yetişkinler");
  await panel.getByRole("button", { name: "Ekle" }).click();
  await panel.locator('[data-library-variable="hedef_kitle"]').waitFor();
  const add = calls(db, "space_set_variable").at(-1);
  assert.deepEqual([add.body.p_name, add.body.p_value], ["hedef_kitle", "Genç yetişkinler"], "boşluk _ olur (jetonla aynı kural)");
  // Yinelenen ad
  await panel.getByLabel("Değişken adı").fill("ton");
  await panel.getByRole("button", { name: "Ekle" }).click();
  await panel.getByText("Bu adda bir değişken zaten var.").waitFor();
  const before = calls(db, "space_set_variable").length;
  assert.equal(before, 1, "yinelenen ad sunucuya hiç gitmedi");
  // Güncelle
  await panel.getByRole("button", { name: "ton değişkenini düzenle" }).click();
  assert.equal(await panel.getByLabel("Değişken adı").isDisabled(), true, "düzenlerken ad değişmez");
  await panel.getByLabel("Değer").fill("Resmî");
  await panel.getByRole("button", { name: "Kaydet" }).click();
  await waitFor(() => db.spaceVariables.find((v) => v.name === "ton")?.value === "Resmî");
  await waitFor(async () => /Resmî/.test((await panel.locator('[data-library-variable="ton"]').textContent()) ?? ""));
  assert.match(await panel.locator('[data-library-variable="ton"]').textContent(), /Resmî/);
  assert.equal(await panel.getByLabel("Değişken adı").inputValue(), "", "kayıttan sonra form sıfırlanır");
  // Sil
  await panel.getByRole("button", { name: "hedef_kitle değişkenini sil" }).click();
  await panel.locator('[data-library-variable="hedef_kitle"]').waitFor({ state: "detached" });
  assert.equal(db.spaceVariables.some((v) => v.name === "hedef_kitle"), false);
  // Çok uzun değer
  await panel.getByLabel("Değişken adı").fill("uzun");
  await panel.getByLabel("Değer").evaluate((el) => { el.removeAttribute("maxlength"); });
  await panel.getByLabel("Değer").fill("x".repeat(501));
  await panel.getByRole("button", { name: "Ekle" }).click();
  await panel.getByText("Değer en çok 500 karakter olabilir.").waitFor();
}, { setup: (db) => library(db, { me: "editor" }) });

await scenario("5. izleyici: değişkenleri OKUR ama form/düğme yok; Onayla yok; 'Doldur ve kopyala' ekip değerleriyle hazır gelir, yazdığı değer ezer, boş kalan jeton kalır, panoya kopyalar", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=prompts`);
  const panel = page.getByTestId("library-variables");
  await panel.waitFor();
  await panel.locator('[data-library-variable="marka_adi"]').waitFor();
  assert.equal(await panel.getByRole("button", { name: "Ekle" }).count(), 0, "izleyici değişken yazamaz");
  assert.equal(await page.getByRole("button", { name: "Onayla" }).count(), 0, "izleyici onaylayamaz");
  assert.equal(await page.getByRole("button", { name: "Yeni taslak" }).count(), 0);
  // Değişkensiz prompt: 'Doldur ve kopyala' yok
  assert.equal(await row(page, "Ham fikir").getByRole("button", { name: "Doldur ve kopyala" }).count(), 0);
  await row(page, "Satış e-postası").getByRole("button", { name: "Doldur ve kopyala" }).click();
  const fill = page.getByTestId("library-fill");
  await fill.waitFor();
  // Ekip değerleri placeholder + 'Ekip değeri' etiketi; musteri ekipte yok.
  assert.equal(await fill.getByText("Ekip değeri").count(), 2);
  assert.equal(await fill.locator('[data-fill-input="marka_adi"]').getAttribute("placeholder"), "Acme");
  const preview = fill.getByTestId("library-fill-preview");
  assert.equal(await preview.textContent(), "Merhaba {musteri}, Acme adına yazıyorum. Ton: Samimi");
  await fill.getByTestId("library-fill-missing").waitFor();
  assert.match(await fill.getByTestId("library-fill-missing").textContent(), /\{musteri\}/);
  // Yazılan değer ekibinkini ezer; eksik doldurulunca uyarı kalkar.
  await fill.locator('[data-fill-input="ton"]').fill("Resmî");
  await fill.locator('[data-fill-input="musteri"]').fill("Ayşe");
  assert.equal(await preview.textContent(), "Merhaba Ayşe, Acme adına yazıyorum. Ton: Resmî");
  assert.equal(await fill.getByTestId("library-fill-missing").count(), 0);
  await page.getByRole("dialog").getByRole("button", { name: "Kopyala" }).click();
  await waitFor(async () => (await page.evaluate(() => navigator.clipboard.readText())) === "Merhaba Ayşe, Acme adına yazıyorum. Ton: Resmî");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Merhaba Ayşe, Acme adına yazıyorum. Ton: Resmî");
  await shot(page, "library-fill");
}, { setup: (db) => library(db, { me: "viewer" }) });

await scenario("6. herkese açık ekip kütüphanesini gören ÜYE OLMAYAN: promptlar ve rozetler görünür; ekip değişkenleri ne gösterilir ne istenir; onay düğmesi yok", async ({ page, requests }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=prompts`);
  await page.getByTestId("space-prompts").waitFor();
  assert.equal(await page.locator("[data-prompt-row]").count(), 3);
  assert.equal(await page.locator('[data-approval="approved"]').count(), 1);
  assert.equal(await page.getByTestId("library-variables").count(), 0, "üye değil: değişken paneli yok");
  assert.equal(requests.filter((u) => u.includes("space_variables")).length, 0, "değişken tablosuna hiç istek atılmadı");
  assert.equal(await page.getByRole("button", { name: "Onayla" }).count(), 0);
}, { setup: (db) => library(db, { me: "none", visibility: "public" }) });

await scenario("7. Yeni Space: 'Ekip kütüphanesi' türü; şablon grupları konuya göre; özel değilse uyarı; oluşturulunca RPC doğru tür + gruplarla gider ve Space promptlara açılır", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces`);
  await page.locator('[data-space-template="team_library"]').click();
  const form = page.getByTestId("create-space-form");
  await form.waitFor();
  assert.equal(await form.getByRole("radio", { name: /Ekip kütüphanesi/ }).isChecked(), true, "tür önceden seçili");
  await form.getByText("Genel · Pazarlama · Destek · Geliştirme").waitFor();
  assert.equal(await form.getByTestId("library-visibility-note").count(), 0, "özelken uyarı yok");
  await form.getByText("Herkese açık", { exact: false }).first().click();
  await form.getByTestId("library-visibility-note").waitFor();
  await form.getByText("Özel", { exact: true }).first().click();
  await form.getByTestId("library-visibility-note").waitFor({ state: "detached" });
  await form.getByLabel("Space adı").fill("Destek ekibi");
  await form.getByRole("button", { name: "Oluştur" }).click();
  await page.waitForURL(/\/spaces\/local\/?\?id=/);
  const call = calls(db, "create_space")[0];
  assert.equal(call.body.p_kind, "team_library");
  assert.equal(call.body.p_visibility, "private");
  assert.deepEqual(call.body.p_groups, ["Genel", "Pazarlama", "Destek", "Geliştirme"]);
  await page.getByTestId("space-prompts").waitFor();
}, { setup: (db) => db.addSpace(5, { title: "Başka bir Space" }) });

await scenario("8. İngilizce + telefon: ekip kütüphanesi metinleri çevrili, yatay taşma yok, pencere sığar", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=prompts`);
  await page.getByRole("heading", { name: "Team variables" }).waitFor();
  await page.getByText("Don't enter secrets", { exact: false }).waitFor();
  await page.locator('[data-approval="approved"]').first().waitFor();
  await page.getByText("Approved", { exact: true }).first().waitFor();
  await row(page, "Destek yanıtı").getByRole("button", { name: "Approve" }).waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await row(page, "Satış e-postası").getByRole("button", { name: "Fill & copy" }).click();
  await page.getByTestId("library-fill").waitFor();
  await page.getByText("Team value").first().waitFor();
  const box = await page.getByRole("dialog").boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390 + 1, "pencere ekrana sığar");
  assert.ok(await overflowFree(page));
  await shot(page, "library-mobile-en");
}, { viewport: { width: 390, height: 844 }, lang: "en" });

console.log(results.map(([status, name]) => `${status === "PASS" ? "✓" : "✗"} ${name}`).join("\n"));
const failed = results.filter(([status]) => status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
