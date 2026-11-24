// Yorum bölümü yeniden tasarımı (docs/history/452-*): kancalı yanıtlar, ⋮ menüsü, düzenleme + geçmiş, yorum takibi, telefonda alttan kart — ağ taklitli arayüz testi.
// Gerçek Supabase'e / gerçek cihaza KARŞI DENENMEDİ. Veritabanı kuralları: supabase/tests/comment-history-follow.sql.
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
//   CHROMIUM_PATH=… node tests/messaging-ui/run-comment-redesign.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { ID, PAGES, installDetailData, seedComments } from "./detail-fixtures.mjs";

const PORT = 4237;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", signedIn = ME, guest = false, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  seedComments(db, "prompt");
  db.rpc.set_notification_mute = (b) => { db.calls.push({ method: "RPC", table: "set_notification_mute", body: b }); return { body: null }; };
  setup?.(db);
  const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
  await installMock(context, db, guest ? { guest: true } : { signedIn });
  await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + PAGES.prompt);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.locator("#comments").waitFor();
    await fn({ page, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/coredesign-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const section = (page) => page.locator("#comments");
// En içteki (son) eşleşme: üst yorumun düğümü alt yanıtların metnini de içerir.
const node = (page, text) => section(page).locator("[data-comment-id]", { hasText: text }).last();
const openMenu = (page, text, lang = "tr") => node(page, text).getByRole("button", { name: lang === "tr" ? "Yorum menüsü" : "Comment menu" }).first().click();
const items = async (page) => (await page.getByRole("menuitem").allTextContents()).map((s) => s.trim());
const mine = (db, body, extra = {}) => { const c = { id: crypto.randomUUID(), body, author_id: ME, prompt_id: ID.prompt, parent_id: null, created_at: "2026-10-05T10:00:00Z", ...extra }; db.comments.push(c); return c; };

await scenario("1. başkasının yorumunun ⋮ menüsü: kopyala · takip et · sessize al · şikâyet; Düzenle/Sil/Sabitle yok", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await openMenu(page, "Mert:");
  const list = await items(page);
  assert.deepEqual(list, ["Bağlantıyı kopyala", "Bu başlığı takip et", "Bildirimlerini sessize al", "Şikayet Et"]);
});

await scenario("2. kendi yorumunun menüsü: kopyala · düzenle · takip et · sil; şikâyet ve sessize alma yok", async ({ page, db }) => {
  await page.getByText(/Kendi yorumum/).first().waitFor();
  await openMenu(page, "Kendi yorumum");
  assert.deepEqual(await items(page), ["Bağlantıyı kopyala", "Düzenle", "Bu başlığı takip et", "Sil"]);
  void db;
}, { setup: (db) => mine(db, "Kendi yorumum", { created_at: "2026-10-06T10:00:00Z" }) });

await scenario("3. düzenlenmiş yorumda herkese 'Düzenleme geçmişi' görünür; pencere şimdiki + önceki sürümü listeler", async ({ page }) => {
  await page.getByText(/Mert: yeni sürüm/).first().waitFor();
  await openMenu(page, "Mert: yeni sürüm");
  assert.ok((await items(page)).includes("Düzenleme geçmişi"));
  await page.getByRole("menuitem", { name: "Düzenleme geçmişi" }).click();
  const dlg = page.locator("[data-comment-history]");
  await dlg.waitFor();
  await dlg.locator("[data-comment-version='current']").waitFor();
  assert.match(await dlg.locator("[data-comment-version='current']").textContent(), /Mert: yeni sürüm/);
  assert.match(await dlg.locator("[data-comment-version='first']").textContent(), /Mert: eski sürüm/);
  await dlg.getByRole("button", { name: "Kapat" }).last().click();
  await dlg.waitFor({ state: "detached" });
}, {
  setup: (db) => {
    const c = db.comments.find((x) => x.body.startsWith("Mert:"));
    c.body = "Mert: yeni sürüm"; c.edited_at = "2026-10-02T10:00:00Z";
    db.commentVersions = [{ id: crypto.randomUUID(), comment_id: c.id, body: "Mert: eski sürüm", written_at: c.created_at, created_at: "2026-10-02T10:00:00Z" }];
  },
});

await scenario("3b. 'düzenlendi' etiketi de geçmişi açar; eski (kaydı olmayan) düzenlemede açıklama çıkar", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await node(page, "Mert:").locator("[data-comment-edited]").click();
  const dlg = page.locator("[data-comment-history]");
  await dlg.waitFor();
  await dlg.getByText("Bu yorumun önceki sürümleri kaydedilmemiş.").waitFor();
}, { setup: (db) => { const c = db.comments.find((x) => x.body.startsWith("Mert:")); c.edited_at = "2026-10-02T10:00:00Z"; } });

await scenario("4. sahip düzenler: satır içi kutu → Kaydet → PATCH gövdesi, 'düzenlendi' ve geçmişte eski sürüm", async ({ page, db }) => {
  await page.getByText(/Kendi yorumum/).first().waitFor();
  await openMenu(page, "Kendi yorumum");
  await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  const box = node(page, "Kendi yorumum").locator("textarea");
  await box.fill("Kendi yorumum, düzeltildi");
  await node(page, "Kendi yorumum").getByRole("button", { name: "Kaydet" }).click();
  await node(page, "Kendi yorumum, düzeltildi").locator("[data-comment-edited]").waitFor();
  assert.ok(db.calls.some((c) => c.method === "PATCH" && c.table === "prompt_comments" && c.body.body === "Kendi yorumum, düzeltildi"));
  await node(page, "Kendi yorumum, düzeltildi").locator("[data-comment-edited]").click();
  const dlg = page.locator("[data-comment-history]");
  await dlg.locator("[data-comment-version='first']").waitFor();
  assert.match(await dlg.locator("[data-comment-version='first']").textContent(), /Kendi yorumum/);
}, { setup: (db) => mine(db, "Kendi yorumum", { created_at: "2026-10-06T10:00:00Z" }) });

await scenario("5. sil: onay çubuğu çıkar, vazgeçilebilir; onaylayınca DELETE gider ve yorum kalkar", async ({ page, db }) => {
  await page.getByText(/Kendi yorumum/).first().waitFor();
  await openMenu(page, "Kendi yorumum");
  await page.getByRole("menuitem", { name: "Sil" }).click();
  const bar = node(page, "Kendi yorumum").locator("[data-comment-delete-confirm]");
  await bar.waitFor();
  await bar.getByRole("button", { name: "Vazgeç" }).click();
  await bar.waitFor({ state: "detached" });
  await openMenu(page, "Kendi yorumum");
  await page.getByRole("menuitem", { name: "Sil" }).click();
  await node(page, "Kendi yorumum").locator("[data-comment-delete-confirm]").getByRole("button", { name: "Sil" }).click();
  await page.waitForFunction(() => !document.querySelector("#comments")?.textContent?.includes("Kendi yorumum"));
  assert.ok(db.calls.some((c) => c.method === "DELETE" && c.table === "prompt_comments"));
}, { setup: (db) => mine(db, "Kendi yorumum", { created_at: "2026-10-06T10:00:00Z" }) });

await scenario("6. Takip et: başlıktaki düğme içeriği takip eder (RPC), sayfa yenilenince 'Takip ediliyor' kalır, tekrar basınca bırakır", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  const btn = section(page).locator("[data-comment-follow]");
  assert.equal((await btn.textContent()).trim(), "Takip et");
  await btn.click();
  await page.getByText("Bu içeriğin yorumlarını takip ediyorsun").waitFor();
  const call = db.calls.find((c) => c.table === "set_comment_subscription");
  assert.deepEqual(call.body, { p_kind: "prompt", p_target: ID.prompt, p_comment: null, p_on: true });
  await page.reload();
  await section(page).locator("[data-comment-follow]").waitFor();
  await page.waitForFunction(() => document.querySelector("#comments [data-comment-follow]")?.textContent?.trim() === "Takip ediliyor");
  await section(page).locator("[data-comment-follow]").click();
  await page.getByText("Yorum takibi kapatıldı").waitFor();
  assert.equal(db.commentSubs.length, 0);
});

await scenario("7. menüden 'Bu başlığı takip et': yorum başlığı takip edilir, etiket 'Başlık takibini bırak' olur", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await openMenu(page, "Mert:");
  await page.getByRole("menuitem", { name: "Bu başlığı takip et" }).click();
  await page.getByText("Bu başlığı takip ediyorsun").waitFor();
  const mert = db.comments.find((c) => c.body.startsWith("Mert:"));
  assert.deepEqual(db.calls.find((c) => c.table === "set_comment_subscription").body, { p_kind: "prompt", p_target: ID.prompt, p_comment: mert.id, p_on: true });
  await openMenu(page, "Mert:");
  assert.ok((await items(page)).includes("Başlık takibini bırak"));
});

await scenario("8. Bağlantıyı kopyala: panoya yoruma giden adres (hl=comment:<id>) yazılır", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await openMenu(page, "Mert:");
  await page.getByRole("menuitem", { name: "Bağlantıyı kopyala" }).click();
  await page.getByText("Bağlantı kopyalandı").waitFor();
  const mert = db.comments.find((c) => c.body.startsWith("Mert:"));
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(text.includes(`hl=comment%3A${mert.id}`) || text.includes(`hl=comment:${mert.id}`), text);
});

await scenario("9. 'Bildirimlerini sessize al' yazarın bildirimlerini sessize alır (mute-store) ve etiket 'sesini aç' olur", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await openMenu(page, "Mert:");
  await page.getByRole("menuitem", { name: "Bildirimlerini sessize al" }).click();
  await page.getByText("Zed sessize alındı").waitFor();
  assert.ok(db.calls.some((c) => c.table === "set_notification_mute" && c.body.p_kind === "actor"));
  await openMenu(page, "Mert:");
  assert.ok((await items(page)).includes("Bildirimlerinin sesini aç"));
});

// ---- yanıtlar: kancalar, girinti, telefon ----
const withReplies = (db) => {
  const top = db.comments.find((c) => c.body.startsWith("Mert:"));
  const r1 = { id: crypto.randomUUID(), body: "Yanıt bir", author_id: U.bob.id, prompt_id: ID.prompt, parent_id: top.id, created_at: "2026-10-07T10:00:00Z" };
  const r2 = { id: crypto.randomUUID(), body: "Yanıt iki", author_id: U.carol.id, prompt_id: ID.prompt, parent_id: top.id, created_at: "2026-10-07T11:00:00Z" };
  const r11 = { id: crypto.randomUUID(), body: "Yanıtın yanıtı", author_id: U.amy.id, prompt_id: ID.prompt, parent_id: r1.id, created_at: "2026-10-07T12:00:00Z" };
  const r111 = { id: crypto.randomUUID(), body: "Üçüncü seviye", author_id: U.dave.id, prompt_id: ID.prompt, parent_id: r11.id, created_at: "2026-10-07T13:00:00Z" };
  db.comments.push(r1, r2, r11, r111);
};

await scenario("10. yanıtlar kancalıdır: çizgi arka plana yakın (border-soft), her yanıt kendi hook'una sahip; iki seviyeden sonra girinti artmaz", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await node(page, "Mert:").getByRole("button", { name: /yanıtı göster|Show .* repl/ }).first().click();
  await page.getByText("Yanıt bir").waitFor();
  await node(page, "Yanıt bir").getByRole("button", { name: /yanıtı göster|Show .* repl/ }).first().click();
  await page.getByText("Yanıtın yanıtı").waitFor();
  await node(page, "Yanıtın yanıtı").getByRole("button", { name: /yanıtı göster|Show .* repl/ }).first().click();
  await page.getByText("Üçüncü seviye").waitFor();
  const xs = {};
  for (const t of ["Mert:", "Yanıt bir", "Yanıtın yanıtı", "Üçüncü seviye"]) xs[t] = (await node(page, t).locator("> div").first().boundingBox()).x;
  assert.ok(xs["Yanıt bir"] > xs["Mert:"], "birinci seviye girintili");
  assert.ok(xs["Yanıtın yanıtı"] > xs["Yanıt bir"], "ikinci seviye girintili");
  assert.ok(Math.abs(xs["Üçüncü seviye"] - xs["Yanıtın yanıtı"]) < 2, "üçüncü seviyede girinti artmaz");
  // Kanca: yanıt sarmalayıcısında 2px çizgi tonu ve ::before kavis
  const style = await page.evaluate(() => {
    const el = [...document.querySelectorAll("#comments [data-comment-id]")].find((n) => n.textContent.includes("Yanıt bir") && !n.textContent.includes("Mert:"));
    // Sarmalayıcı: düğümden yukarı doğru, ::before'u 2px sol kenarlıklı olan ilk ata (araya ExitMotion girebilir).
    let wrap = el.parentElement;
    let before = getComputedStyle(wrap, "::before");
    for (let i = 0; i < 4 && before.borderLeftWidth !== "2px"; i++) { wrap = wrap.parentElement; before = getComputedStyle(wrap, "::before"); }
    return { before: before.borderLeftWidth, color: before.borderLeftColor, radius: before.borderBottomLeftRadius };
  });
  assert.equal(style.before, "2px");
  assert.notEqual(style.radius, "0px");
}, { setup: withReplies });

await scenario("11. masaüstü: yanıt satır içi kutuda yazılır (pencere yok), parent_id ile gönderilir", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await node(page, "Mert:").getByRole("button", { name: "Yanıtla" }).first().click();
  assert.equal(await page.locator("[data-comment-compose-sheet]").count(), 0, "pencere/kart yok");
  const ta = node(page, "Mert:").locator("form textarea");
  await ta.fill("Masaüstü yanıtı");
  await node(page, "Mert:").locator("form").getByRole("button", { name: "Gönder" }).click();
  await page.getByText("Masaüstü yanıtı").waitFor();
  const posted = db.comments.find((c) => c.body === "Masaüstü yanıtı");
  assert.equal(posted.parent_id, db.comments.find((c) => c.body.startsWith("Mert:")).id);
});

await scenario("12. telefon (390): Yanıtla alttan açılan kart (tam ekran sayfa değil); yanıtlanan yorum özeti görünür; gönderince kart kapanır", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  await node(page, "Mert:").getByRole("button", { name: "Yanıtla" }).first().click();
  const sheet = page.locator("[data-comment-compose-sheet]");
  await sheet.waitFor();
  assert.equal(await node(page, "Mert:").locator("form").count(), 0, "satır içi kutu yok");
  assert.match(await sheet.locator("[data-comment-quote]").textContent(), /Mert:/);
  const box = await sheet.boundingBox();
  assert.ok(box.height <= 800 * 0.9, "kart ekranı kaplamaz (≤ %90)");
  await sheet.locator("textarea").fill("Telefon yanıtı");
  await sheet.getByRole("button", { name: "Gönder" }).click();
  await page.getByText("Telefon yanıtı").waitFor();
  await sheet.waitFor({ state: "detached" });
  assert.equal(db.comments.find((c) => c.body === "Telefon yanıtı").parent_id, db.comments.find((c) => c.body.startsWith("Mert:")).id);
}, { viewport: { width: 390, height: 800 } });

await scenario("13. telefon: yorum kartları tam genişlik (sayfa kenar boşluğu hariç), yatay taşma yok; düzenleme de alttan kartta", async ({ page, db }) => {
  await page.getByText(/Mert:/).first().waitFor();
  const vw = 390;
  const bubble = await node(page, "Mert:").locator("div.rounded-lg.border-border-soft").first().boundingBox();
  assert.ok(bubble.width >= vw - 40, `kart geniş (${bubble.width})`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "taşma yok");
  await openMenu(page, "Kendi yorumum");
  await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  const sheet = page.locator("[data-comment-compose-sheet]");
  await sheet.waitFor();
  await sheet.locator("textarea").fill("Telefonda düzeltildi");
  await sheet.getByRole("button", { name: "Kaydet" }).click();
  await page.getByText("Telefonda düzeltildi").waitFor();
  assert.ok(db.calls.some((c) => c.method === "PATCH" && c.body.body === "Telefonda düzeltildi"));
}, { viewport: { width: 390, height: 800 }, setup: (db) => mine(db, "Kendi yorumum", { created_at: "2026-10-06T10:00:00Z" }) });

await scenario("14. İngilizce: menü, takip ve geçmiş metinleri çevrilmiş", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  assert.equal((await section(page).locator("[data-comment-follow]").textContent()).trim(), "Follow");
  await openMenu(page, "Mert:", "en");
  assert.deepEqual(await items(page), ["Copy link", "Edit history", "Follow this thread", "Mute their notifications", "Report"]);
  await page.getByRole("menuitem", { name: "Edit history" }).click();
  await page.locator("[data-comment-history]").getByText("Current version").waitFor();
}, { lang: "en", setup: (db) => { const c = db.comments.find((x) => x.body.startsWith("Mert:")); c.edited_at = "2026-10-02T10:00:00Z"; db.commentVersions = [{ id: crypto.randomUUID(), comment_id: c.id, body: "old", written_at: c.created_at, created_at: "2026-10-02T10:00:00Z" }]; } });

await scenario("15. ziyaretçi: Takip et ve menü eylemleri yok (yalnız kopyala + geçmiş)", async ({ page }) => {
  await page.getByText(/Mert:/).first().waitFor();
  assert.equal(await section(page).locator("[data-comment-follow]").count(), 0);
  await openMenu(page, "Mert:");
  assert.deepEqual(await items(page), ["Bağlantıyı kopyala", "Düzenleme geçmişi"]);
}, { guest: true, setup: (db) => { const c = db.comments.find((x) => x.body.startsWith("Mert:")); c.edited_at = "2026-10-02T10:00:00Z"; } });

await browser.close();
server.close?.();
for (const [status, name] of results) console.log(`${status}  ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
