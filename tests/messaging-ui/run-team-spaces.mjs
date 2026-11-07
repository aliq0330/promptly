// Ekip alanı (docs/history/349-*), Aşama 1: "tamamen kapalı" topluluk = ekip. Topluluk sayfasında "Space'ler" sekmesi (yalnız tamamen kapalıda),
// yetkiye bağlı "Yeni Space", ekibe bağlı Space sayfasında ekip şeridi + salt-okunur üyeler, iki yeni yetenek, TR/EN, telefon.
// Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (kurallar: supabase/tests/team-spaces.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";
import { installDetailData } from "./detail-fixtures.mjs";

const PORT = 4216;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const TEAM = "c1000000-0000-4000-8000-000000000a01";
const OPEN = "c1000000-0000-4000-8000-000000000a02";
const RESTRICTED = "c1000000-0000-4000-8000-000000000a03";
const calls = (db, name) => db.calls.filter((c) => c.method === "RPC" && c.table === name);
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

/** Ekip (tamamen kapalı) + `spaces` adet bağlı Space. `role`: ekipteki rolüm. Sahip ben değilsem sahip Bob'dur. */
function seed(db, { role = "owner", spaces = 2, visibility = "private", perms } = {}) {
  const ownerIsMe = role === "owner";
  const members = ownerIsMe ? [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]] : [[U.bob, "owner"], [U.carol, "moderator"], [U.dave, "member"]];
  const g = db.addCommunity(TEAM, { name: "Ekip Atölyesi", visibility, myRole: role, members });
  if (perms) g.role_permissions = perms;
  const ownerId = ownerIsMe ? ME : U.bob.id;
  const others = ownerIsMe ? [[U.bob, "editor"], [U.carol, "editor"], [U.dave, "editor"]] : [[U.alice, "editor"], [U.carol, "editor"], [U.dave, "editor"]];
  for (let i = 1; i <= spaces; i += 1) {
    db.addSpace(i, { owner: ownerId, communityId: TEAM, kind: i === 1 ? "team_library" : "moodboard", title: i === 1 ? "Pazarlama kütüphanesi" : `Moodboard ${i}`, members: others, created_at: `2026-10-01T10:${String(i % 60).padStart(2, "0")}:00Z`, updated_at: `2026-10-02T10:${String(i % 60).padStart(2, "0")}:00Z` });
  }
  return g;
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup = (db) => seed(db) } = {}) {
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/team-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const openTeam = async (page, tab = "spaces") => {
  await page.goto(`${BASE}/teams/local?id=${TEAM}&tab=${tab}`);
  await page.locator("h1").first().waitFor();
};
const sectionNames = async (page) => {
  await page.locator("[data-section-menu]").first().click();
  const names = (await page.locator("[data-section-option]").allInnerTexts()).map((x) => x.split("\n")[0].trim());
  await page.keyboard.press("Escape");
  return names;
};

await scenario("1. 'Space'ler' sekmesi YALNIZ tamamen kapalı (ekip alanı) toplulukta görünür; herkese açık ve kapalıda yok", async ({ page, db }) => {
  await openTeam(page, "feed");
  const names = await sectionNames(page);
  assert.ok(names.includes("Space'ler"), `ekipte sekme var: ${names}`);
  assert.ok(names.indexOf("Space'ler") === 0 && names.indexOf("Paylaşımlar") === 1, "ekipte Space'ler ilk, Akış 'Paylaşımlar' adıyla ikinci (docs/history/350-*)");
  for (const id of [OPEN, RESTRICTED]) {
    await page.goto(`${BASE}/communities/local?id=${id}`);
    await page.locator("h1").first().waitFor();
    const other = await sectionNames(page);
    assert.ok(!other.includes("Space'ler"), `ekip olmayan toplulukta sekme yok: ${other}`);
  }
}, { setup: (db) => { seed(db); db.addCommunity(OPEN, { name: "Açık Topluluk", visibility: "public", myRole: "member", members: [[U.bob, "owner"]] }); db.addCommunity(RESTRICTED, { name: "Kapalı Topluluk", visibility: "restricted", myRole: "member", members: [[U.bob, "owner"]] }); } });

await scenario("2. sahip: ekibin Space'leri listelenir; 'Yeni Space' ekibe açar (doğru parametreler, tür + şablon grupları) ve Space sayfasına gider", async ({ page, db }) => {
  await openTeam(page);
  const list = page.getByTestId("team-spaces-list");
  await list.waitFor();
  assert.equal(await list.locator("li").count(), 2);
  await page.getByText("2/50 Space").waitFor();
  await page.locator("[data-team-space-new]").click();
  const form = page.getByTestId("create-team-space-form");
  await form.waitFor();
  assert.equal(await form.getByRole("radio", { name: /Ekip kütüphanesi/ }).isChecked(), true, "varsayılan tür: ekip kütüphanesi");
  await form.getByText("Genel · Pazarlama · Destek · Geliştirme").waitFor();
  await form.getByLabel("Space adı").fill("Destek ekibi kütüphanesi");
  await form.getByRole("button", { name: "Oluştur" }).click();
  await page.waitForURL(/\/spaces\/local\/?\?id=/);
  const call = calls(db, "create_team_space")[0];
  assert.equal(call.body.p_community, TEAM);
  assert.equal(call.body.p_title, "Destek ekibi kütüphanesi");
  assert.equal(call.body.p_kind, "team_library");
  assert.deepEqual(call.body.p_groups, ["Genel", "Pazarlama", "Destek", "Geliştirme"]);
  await page.getByTestId("team-space-strip").waitFor();
  await shot(page, "team-space-created");
});

await scenario("3. sıradan üye: Space'leri görür ama 'Yeni Space' yok; ekip boşsa 'yetkililer açar' yazar", async ({ page }) => {
  await openTeam(page);
  await page.getByTestId("team-spaces-list").waitFor();
  assert.equal(await page.locator("[data-team-space-new]").count(), 0, "yetkisiz üye Space açamaz");
}, { setup: (db) => seed(db, { role: "member" }) });

await scenario("3b. ekip boş + sıradan üye: yönlendirme metni", async ({ page }) => {
  await openTeam(page);
  await page.getByText("Henüz ekip Space'i yok").waitFor();
  await page.getByText("Space'leri ekibin yetkilileri açar.").waitFor();
  assert.equal(await page.locator("[data-team-space-new]").count(), 0);
}, { setup: (db) => seed(db, { role: "member", spaces: 0 }) });

await scenario("4. yetki: yönetici varsayılan 'Yeni Space' görür; moderatör görmez; sahip moderatöre create_spaces verirse görür", async ({ page }) => {
  await openTeam(page);
  await page.locator("[data-team-space-new]").waitFor();
}, { setup: (db) => seed(db, { role: "admin" }) });

await scenario("4b. moderatör (yetkisiz) 'Yeni Space' görmez", async ({ page }) => {
  await openTeam(page);
  await page.getByTestId("team-spaces-list").waitFor();
  assert.equal(await page.locator("[data-team-space-new]").count(), 0);
}, { setup: (db) => seed(db, { role: "moderator" }) });

await scenario("4c. sahibin ayarıyla moderatöre create_spaces verilmiş: 'Yeni Space' görünür", async ({ page }) => {
  await openTeam(page);
  await page.locator("[data-team-space-new]").waitFor();
}, { setup: (db) => seed(db, { role: "moderator", perms: { admin: {}, moderator: { create_spaces: true } } }) });

await scenario("5. ekip başına 50 Space sınırı: dolunca 'Yeni Space' kapanır ve sınır mesajı çıkar", async ({ page }) => {
  await openTeam(page);
  await page.getByText("50/50 Space").waitFor();
  assert.equal(await page.locator("[data-team-space-new]").isDisabled(), true);
  await page.getByText("Ekip Space sınırına (50) ulaşıldı.").waitFor();
}, { setup: (db) => seed(db, { spaces: 50 }) });

await scenario("6. Space sayfası: ekip şeridi (ekip adı + Ekip sayfası + Ekip sohbeti bağlantıları); sahip/yönetici SAHİP görünür", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  const strip = page.getByTestId("team-space-strip");
  await strip.waitFor();
  await strip.getByText("Ekip: Ekip Atölyesi").waitFor();
  assert.match(await strip.locator("[data-team-open-page]").getAttribute("href"), new RegExp(`teams/local/?\\?id=${TEAM}&tab=spaces`));
  assert.match(await strip.locator("[data-team-open-chat]").getAttribute("href"), new RegExp(`messages/local/?\\?id=${TEAM}`));
  assert.equal(await page.locator(`[data-space-page="${SID(1)}"]`).getAttribute("data-space-role"), "owner", "ekip yöneticisi Space'in sahibi gibi çalışır");
}, { setup: (db) => seed(db, { role: "admin" }) });

await scenario("6b. sıradan üye: Space'te DÜZENLEYİCİ (sahip değil)", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByTestId("team-space-strip").waitFor();
  assert.equal(await page.locator(`[data-space-page="${SID(1)}"]`).getAttribute("data-space-role"), "editor");
}, { setup: (db) => seed(db, { role: "member" }) });

await scenario("7. ekibe bağlı Space'in Üyeler sekmesi: 'ekipten gelir' notu; davet, ayrıl, paylaşım ayarları YOK", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=members`);
  await page.getByTestId("team-members-note").waitFor();
  assert.equal(await page.getByRole("button", { name: "Space'ten ayrıl" }).count(), 0, "ayrılma ekipten");
  assert.equal(await page.getByRole("button", { name: "Paylaşım ayarları" }).count(), 0, "paylaşım yok");
  assert.equal(await page.getByRole("button", { name: /Davet et/ }).count(), 0, "davet yok");
}, { setup: (db) => seed(db, { role: "admin" }) });

await scenario("8. Yönetim → Ayarlar: iki yeni yetenek (Ekibe Space açma ve yönetme · Ekip kütüphanesinde onay verme) rol tablosunda", async ({ page }) => {
  await page.goto(`${BASE}/teams/local?id=${TEAM}&tab=manage&section=settings`);
  await page.getByText("Ekibe Space açma ve yönetme").first().waitFor();
  await page.getByText("Ekip kütüphanesinde onay verme").first().waitFor();
  await shot(page, "team-capabilities");
});

await scenario("9. Topluluk oluştur: 'Tamamen kapalı' artık ekip — seçenek yok (iki düzey kalır); ekip yalnız Ekipler'den kurulur (run-teams)", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
  const d = page.getByRole("dialog").last();
  await d.getByRole("radio", { name: /^Kapalı/ }).waitFor();
  assert.equal(await d.getByRole("radio", { name: /^Tamamen kapalı/ }).count(), 0);
  assert.equal(await d.getByRole("radio", { name: /^(Herkese açık|Kapalı|Tamamen kapalı)/ }).count(), 2);
}, { setup: null });

await scenario("10. İngilizce + telefon: sekme, yeni Space penceresi ve şerit çevrili; yatay taşma yok", async ({ page }) => {
  await openTeam(page);
  await page.getByText("The team's shared workspaces.", { exact: false }).waitFor();
  await page.getByText("2/50 Spaces").waitFor();
  await page.locator("[data-team-space-new]").click();
  await page.getByTestId("create-team-space-form").waitFor();
  await page.getByRole("heading", { name: "New team Space" }).waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByTestId("team-space-strip").getByText("Team: Ekip Atölyesi").waitFor();
  await page.getByRole("link", { name: "Team chat" }).waitFor();
  assert.ok(await overflowFree(page));
  await shot(page, "team-mobile-en");
}, { viewport: { width: 390, height: 844 }, lang: "en" });

await scenario("11. ekip şeridi 'Sohbete gönder': ekip sohbetine Space başlığı + bağlantı mesajı yazılır, düğme 'gönderildi' olur", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  const strip = page.getByTestId("team-space-strip");
  await strip.waitFor();
  await strip.locator("[data-team-share-chat]").click();
  await strip.getByText("Ekip sohbetine gönderildi").waitFor();
  const sent = db.messages.filter((m) => m.conversation_id === TEAM);
  assert.equal(sent.length, 1, "tek mesaj");
  assert.ok(sent[0].body.includes("Pazarlama kütüphanesi"), `başlık mesajda: ${sent[0].body}`);
  assert.ok(sent[0].body.includes(SID(1)), "Space bağlantısı mesajda");
}, { setup: (db) => seed(db, { role: "admin" }) });

await scenario("12. ekip sohbetinin bilgi panelinde 'Ortak Space'ler' kartı: Space bağlantıları + 'Tüm Space'ler'; ekip olmayan toplulukta kart yok", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${TEAM}`);
  await page.locator("button[aria-label^='Topluluk seçenekleri'], button[aria-label^='Community options']").first().waitFor();
  await page.locator("button[aria-haspopup='dialog'][aria-label*='topluluk bilgisini aç'], button[aria-haspopup='dialog'][aria-label*='Open info']").first().click();
  const card = page.getByTestId("team-spaces-info");
  await card.waitFor();
  await card.getByText("Pazarlama kütüphanesi").waitFor();
  assert.match(await card.locator("[data-info-row='team-spaces-all']").getAttribute("href"), new RegExp(`teams/local/?\\?id=${TEAM}&tab=spaces`));
}, { setup: (db) => seed(db, { role: "admin" }) });

await scenario("12b. herkese açık toplulukta 'Ortak Space'ler' kartı çizilmez", async ({ page }) => {
  await page.goto(`${BASE}/messages/local?id=${OPEN}`);
  await page.locator("button[aria-label^='Topluluk seçenekleri'], button[aria-label^='Community options']").first().waitFor();
  await page.locator("button[aria-haspopup='dialog'][aria-label*='topluluk bilgisini aç'], button[aria-haspopup='dialog'][aria-label*='Open info']").first().click();
  await page.locator("#group-info-title").waitFor();
  assert.equal(await page.getByTestId("team-spaces-info").count(), 0);
}, { setup: (db) => { seed(db, { role: "admin" }); db.addCommunity(OPEN, { name: "Açık Topluluk", visibility: "public", myRole: "member", members: [[U.bob, "owner"]] }); } });

await scenario("13. ekip kütüphanesi: taslak prompt satırında 'Sohbete gönder' (başlık notta); ekibe bağlı olmayan Space'te düğme yok", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=prompts`);
  const btn = page.locator("[data-team-share-prompt]").first();
  await btn.waitFor();
  await btn.click();
  await page.getByText("Ekip sohbetine gönderildi").first().waitFor();
  const sent = db.messages.filter((m) => m.conversation_id === TEAM);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].body.includes("Satış e-postası"), `prompt başlığı: ${sent[0].body}`);
}, { setup: (db) => { seed(db, { role: "admin" }); db.addItem(SID(1), { id: "d1000000-0000-4000-8000-0000000000e1", kind: "prompt", is_draft: true, title: "Satış e-postası", body: "Merhaba {musteri}" }); } });

const D1 = "d1000000-0000-4000-8000-0000000000f1";
const D2 = "d1000000-0000-4000-8000-0000000000f2";
const withDrafts = (opts) => (db) => {
  seed(db, opts);
  db.addItem(SID(1), { id: D1, kind: "prompt", is_draft: true, title: "Satış e-postası", body: "Merhaba {musteri}", created_by: U.dave.id });
  db.addItem(SID(1), { id: D2, kind: "prompt", is_draft: true, title: "Destek yanıtı", body: "Sayın {musteri}", review_requested_at: "2026-11-07T09:00:00Z", review_requested_by: U.dave.id });
  db.spaceItemVersions.push(
    { id: "a1000000-0000-4000-8000-000000000001", item_id: D1, space_id: SID(1), title: "Satış e-postası", body: "İlk taslak {musteri}\nikinci satır", author_id: U.dave.id, author_name: "Dave", author_username: "dave", was_approved: false, created_at: "2026-11-05T10:00:00Z" },
    { id: "a1000000-0000-4000-8000-000000000002", item_id: D1, space_id: SID(1), title: "Satış e-postası", body: "İkinci taslak {musteri}", author_id: U.dave.id, author_name: "Dave", author_username: "dave", was_approved: true, created_at: "2026-11-06T10:00:00Z" },
  );
};
const row = (page, title) => page.locator("[data-prompt-row='draft']", { hasText: title });
const openPrompts = async (page) => { await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=prompts`); await page.getByTestId("space-prompts").waitFor(); };

await scenario("14. sıradan üye: 'Onaya gönder' görür, Onayla görmez; isteyince rozet + 'İsteği geri çek'; geri çekince temizlenir", async ({ page, db }) => {
  await openPrompts(page);
  const r1 = row(page, "Satış e-postası");
  assert.equal(await r1.getByRole("button", { name: "Onayla" }).count(), 0, "yetkisiz üye onaylayamaz");
  await r1.locator("[data-review-action='request']").click();
  await r1.locator("[data-review-requested]").waitFor();
  assert.equal(calls(db, "space_request_review")[0].body.p_withdraw, false);
  assert.equal(db.spaceItems.find((i) => i.id === D1).review_requested_by, ME);
  await r1.locator("[data-review-action='withdraw']").click();
  await r1.locator("[data-review-requested]").waitFor({ state: "detached" });
  assert.equal(calls(db, "space_request_review")[1].body.p_withdraw, true);
  assert.equal(db.spaceItems.find((i) => i.id === D1).review_requested_at, null);
}, { setup: withDrafts({ role: "member" }) });

await scenario("15. yönetici (onay yetkili): 'Onaya gönder' YOK, 'Onayla' var; 'Onay istenen' süzgeci yalnız istekleri listeler; onaylayınca istek rozeti kalkar", async ({ page }) => {
  await openPrompts(page);
  await row(page, "Satış e-postası").getByRole("button", { name: "Onayla" }).waitFor(); // yetki sunucudan gelir (space_can_approve)
  assert.equal(await row(page, "Satış e-postası").locator("[data-review-action='request']").count(), 0);
  await row(page, "Destek yanıtı").locator("[data-review-requested]").waitFor();
  await page.getByTestId("space-prompts").locator("[data-section-menu]").nth(1).click();
  await page.locator('[data-section-option="requested"]').click();
  assert.equal(await page.locator("[data-prompt-row]").count(), 1);
  await row(page, "Destek yanıtı").getByRole("button", { name: "Onayla" }).click();
  await page.getByText("Onay istenen yok", { exact: false }).or(page.getByText("Onay isteyen prompt yok")).first().waitFor();
}, { setup: withDrafts({ role: "admin" }) });

await scenario("16. yetki sunucudan: create_spaces olsa da approve_library yoksa 'Onayla' görünmez; approve_library verilmiş moderatör 'Onayla' görür", async ({ page }) => {
  await openPrompts(page);
  await row(page, "Satış e-postası").waitFor();
  assert.equal(await page.getByRole("button", { name: "Onayla" }).count(), 0, "approve_library yok");
  assert.ok(await row(page, "Satış e-postası").locator("[data-review-action='request']").count() > 0, "yerine 'Onaya gönder'");
}, { setup: withDrafts({ role: "admin", perms: { admin: { create_spaces: true, approve_library: false } } }) });

await scenario("16b. approve_library verilmiş moderatör 'Onayla' görür", async ({ page }) => {
  await openPrompts(page);
  await row(page, "Satış e-postası").getByRole("button", { name: "Onayla" }).waitFor();
}, { setup: withDrafts({ role: "moderator", perms: { admin: {}, moderator: { approve_library: true } } }) });

await scenario("17. 'Sürümler': eski sürümler listelenir (yazar, 'Onaylıydı'), tamamı açılır, 'Geri yükle' metni geri getirir ve onayı düşürür", async ({ page, db }) => {
  await openPrompts(page);
  await row(page, "Satış e-postası").locator("[data-item-versions]").click();
  const box = page.getByTestId("item-versions");
  await box.waitFor();
  assert.equal(await box.locator("[data-version-row]").count(), 2);
  await box.getByText("Onaylıydı").waitFor();
  await box.getByText("Dave yazdı").first().waitFor();
  await box.locator("[data-version-row]").nth(1).getByRole("button", { name: "Tamamını göster" }).click();
  await box.getByText("ikinci satır", { exact: false }).waitFor();
  await box.locator("[data-version-row]").nth(1).locator("[data-version-restore]").click();
  await page.getByTestId("item-versions").waitFor({ state: "detached" });
  assert.equal(calls(db, "space_restore_item_version")[0].body.p_version, "a1000000-0000-4000-8000-000000000001");
  await row(page, "Satış e-postası").getByText("İlk taslak {musteri}", { exact: false }).waitFor();
}, { setup: withDrafts({ role: "member" }) });

await scenario("17b. kilitli taslakta 'Geri yükle' görünmez (kilit içeriği korur); salt okuma ekip üyesi sürümleri görür", async ({ page, db }) => {
  db.spaceItems.find((i) => i.id === D1).locked = true;
  await openPrompts(page);
  await row(page, "Satış e-postası").locator("[data-item-versions]").click();
  await page.getByTestId("item-versions").locator("[data-version-row]").first().waitFor();
  assert.equal(await page.locator("[data-version-restore]").count(), 0);
}, { setup: withDrafts({ role: "member" }) });

await scenario("18. İngilizce + telefon: Onaya gönder / Sürümler / Approval requested çevrili, yatay taşma yok", async ({ page }) => {
  await openPrompts(page);
  const r = row(page, "Satış e-postası");
  await r.getByRole("button", { name: "Request approval" }).click();
  await r.getByText("Approval requested").waitFor();
  await r.getByRole("button", { name: "Withdraw request" }).waitFor();
  await r.locator("[data-item-versions]").click();
  await page.getByRole("heading", { name: /Version history/ }).waitFor();
  await page.getByText("Restoring is a new edit", { exact: false }).waitFor();
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "team-review-mobile-en");
}, { viewport: { width: 390, height: 844 }, lang: "en", setup: withDrafts({ role: "member" }) });

console.log(results.map(([status, name]) => `${status === "PASS" ? "✓" : "✗"} ${name}`).join("\n"));
const failed = results.filter(([status]) => status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
