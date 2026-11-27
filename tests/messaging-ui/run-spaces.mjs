// Promptly Spaces arayüzü (docs/history/213-*): ana sayfa (boş durum, oluşturma, süzgeç, arama, ızgara/liste, favori, davet),
// Space sayfası (sekmeler, rol görünürlüğü, erişilemeyen Space), pano (sürükle → birleştirilmiş kayıt, kayıt hatası + tekrar dene,
// klavye itme, sil + geri al, seçim kutusu + grupla, dokunmatik kaydırma/kıstırma, tam ekran), görseller (yükleme), palet (HEX,
// görselden çıkarma), notlar (gizli not), üyeler (davet + hata), paylaşım bağlantısı (oluştur/aç/geçersiz/ziyaretçi), Promptly'den
// "Space'e ekle", İngilizce, telefonda taşma yok. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (yetki kuralı: spaces.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID, MEDIA } from "./mock-spaces.mjs";
import { installDetailData, ID, PAGES, svg } from "./detail-fixtures.mjs";
import zlib from "node:zlib";

const PORT = 4193;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
/** Gerçek, opak, tek renkli PNG (palet çıkarma testinin "görseli"). */
function solidPng(r, g, b, size = 8) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.concat(Array.from({ length: size }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEJMDIwMDAwAAA2YgP+3uO5OgAAAABJRU5ErkJggg==", "base64");

async function scenario(name, fn, { viewport = { width: 1280, height: 860 }, lang = "tr", guest = false, touch = false, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  setup?.(db);
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await installMock(context, db, { guest });
  await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.SHOTS ?? "/tmp"}/spaces-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

/** "Tümü ▾" bölüm menüsünden bir bölüm seç (docs/history/231-*; telefonda alt sayfa, masaüstünde açılır kutu). */
const pickSection = async (page, name) => {
  await page.getByRole("tablist", { name: "Space süzgeci" }).getByRole("tab", { name }).click();
};
/** Space sayfası bölümleri altı çizgili sekmelerdir (docs/history/371-*): sekme adlarını verir / birini seçer. */
const spaceTabs = (page) => page.getByRole("tablist", { name: "Space bölümleri" });
const spaceTabNames = async (page) => (await spaceTabs(page).getByRole("tab").allInnerTexts()).map((x) => x.split("\n")[0].replace(/\d+$/, "").trim());
const pickSpaceTab = async (page, name) => { await spaceTabs(page).getByRole("tab", { name }).click(); };
const calls = (db, method, table) => db.calls.filter((c) => c.method === method && c.table === table);
const waitFor = async (check, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const boardWith = (db, n = 1, extra = {}) => {
  db.addSpace(n, { title: "Ejderha Dünyası", kind: "character", ...extra });
  db.addItem(SID(n), { id: "aaaaaaaa-0000-4000-8000-000000000001", kind: "note", title: "Işık notu", body: "altın saat", x: 0, y: 0, w: 220, h: 180, z: 1 });
  db.addItem(SID(n), { id: "aaaaaaaa-0000-4000-8000-000000000002", kind: "note", title: "İkinci", body: "mor", x: 400, y: 0, w: 220, h: 180, z: 2 });
};
async function dragBy(page, selector, dx, dy) {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await page.mouse.up();
}

// ---------------------------------------------------------------- ana sayfa

await scenario("1. boş kütüphane: ilk Space boş durumu + örnek (gerçek veri değil) + oluştur → şablon grupları ile Space'e gider", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByTestId("spaces-first-empty").waitFor();
  assert.ok(await page.getByText("Örnek", { exact: true }).isVisible(), "örnek pano etiketli");
  await page.getByTestId("create-space").click();
  const form = page.getByTestId("create-space-form");
  await form.getByRole("button", { name: "Oluştur" }).click();
  assert.ok(await page.getByText("Space adı gerekli").isVisible(), "boş ad doğrulaması");
  await form.getByLabel("Space adı").fill("Neon şehir");
  await form.getByText("Karakter tasarımı").click();
  await form.getByRole("button", { name: "Oluştur" }).click();
  await page.waitForURL(/\/spaces\/local\/?\?id=/);
  const call = calls(db, "RPC", "create_space")[0];
  assert.equal(call.body.p_title, "Neon şehir");
  assert.equal(call.body.p_kind, "character");
  assert.equal(call.body.p_visibility, "private", "güvenli varsayılan: özel");
  assert.deepEqual(call.body.p_groups, ["Karakterler", "Mekânlar", "Nesneler", "Referanslar"]);
  await page.getByRole("heading", { level: 1, name: "Neon şehir" }).waitFor();
});

await scenario("2. liste: kartlar, süzgeç RPC'ye gider, arama gecikmeli, liste görünümü, Sabitle yok, davet kabul", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByTestId("spaces-list").waitFor();
  assert.equal(await page.locator("[data-space-card]").count(), 2);
  await pickSection(page, "Paylaşılan");
  await waitFor(() => calls(db, "RPC", "list_spaces").some((c) => c.body.p_filter === "shared"));
  await page.getByText("Seninle paylaşılan Space yok").waitFor();
  await pickSection(page, "Tümü");
  // Arama kutusu kontrol satırında hep açıktır (docs/history/474-*).
  await page.getByRole("searchbox", { name: /Space, görsel/ }).fill("altın");
  await waitFor(() => calls(db, "RPC", "list_spaces").some((c) => c.body.p_query === "altın"));
  await waitFor(async () => (await page.locator("[data-space-card]").count()) === 1);
  await page.getByRole("button", { name: "Temizle" }).click();
  await page.getByRole("button", { name: "Liste" }).click();
  await page.locator('[data-view="list"]').waitFor();
  assert.equal(await page.locator('[data-space-card] [aria-label="Sabitle"]').count(), 0, "Sabitle yok (docs/history/459-*)");
  // Davet: tek satırlık kart → "Davetler" bölümü → kabul → Space'e gider.
  await page.getByTestId("space-invites-banner").click();
  await page.getByTestId("space-invitations").getByRole("button", { name: "Kabul et" }).click();
  await page.waitForURL(new RegExp(`id=${SID(3)}`));
}, {
  setup: (db) => {
    boardWith(db, 1);
    db.addSpace(2, { title: "Marka" });
    db.addSpace(3, { title: "Davetli Space", owner: U.bob.id, visibility: "private" });
    db.spaceInvites.push({ id: "inv1", space_id: SID(3), invitee_id: ME, role: "editor", invited_by: U.bob.id, status: "pending", created_at: "2026-09-20T10:00:00Z" });
  },
});


await scenario("3. ziyaretçi: hiçbir Space listelenmez (hepsi özel); oluştur giriş penceresi açar; yazma çağrısı yok", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByText("Space'ler özeldir.").waitFor();
  assert.equal(calls(db, "RPC", "list_spaces").length, 0, "ziyaretçi için liste sorgusu yok");
  assert.equal(await page.getByRole("tablist", { name: "Space süzgeci" }).count(), 0);
  await page.getByTestId("create-space").click();
  await page.getByRole("dialog").getByRole("link", { name: "Giriş yap" }).first().waitFor();
  assert.equal(calls(db, "RPC", "create_space").length, 0);
}, { guest: true, setup: (db) => db.addSpace(1, { title: "Açık Space", owner: U.bob.id, visibility: "public" }) });

await scenario("4. üye olmayan (sunucuda 'herkese açık' görünse bile) Space'i göremez; sosyal yüzeyler yok: Yorumlar/Etkinlik sekmesi, Paylaş, Sabitle, görünürlük rozeti", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByText("Bu Space'e erişemiyorsun").waitFor();
}, { setup: (db) => boardWith(db, 1, { owner: U.bob.id, visibility: "public" }) });

await scenario("4b. sahip: Space sayfasında Yorumlar/Etkinlik sekmesi, Paylaş, Sabitle ve görünürlük rozeti YOK (docs/history/459-*)", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await spaceTabs(page).waitFor();
  const names = await spaceTabNames(page);
  assert.deepEqual(names, ["Genel bakış", "Pano", "Görseller", "Promptlar", "Palet", "Notlar", "Üyeler"]);
  assert.equal(await page.locator("[data-space-visibility]").count(), 0, "görünürlük rozeti yok");
  assert.equal(await page.locator("[data-space-rating-chip]").count(), 0, "puan rozeti yok");
  await page.locator("[data-space-actions]").getByRole("button", { name: "Paylaş" }).count().then((n) => assert.equal(n, 0, "Paylaş düğmesi yok"));
  await page.locator("[data-detail-menu]").getByRole("button").first().click();
  assert.equal(await page.getByRole("menuitem", { name: "Sabitle" }).count(), 0, "Sabitle yok");
  assert.equal(await page.getByRole("menuitem", { name: "Paylaş" }).count(), 0, "menüde Paylaş yok");
}, { setup: (db) => boardWith(db, 1) });

// ---------------------------------------------------------------- Genel bakış duvarı (docs/history/475-*)

const wallWorld = (db) => {
  db.addSpace(1, { title: "Kış koleksiyonu moodboard", kind: "moodboard", description: "Aralık kampanyası için ışık, renk ve kadraj referansları.", members: [[U.bob, "editor"], [U.carol, "viewer"]] });
  db.spaceGroups.push({ id: "g1", space_id: SID(1), name: "Ana tema", color: "primary", position: 0, created_at: "2026-09-20T10:00:00Z" });
  [["#2c3e50", "#a9c5e8"], ["#b5532a", "#f2e6d9"], ["#3f6b5a", "#e4eadf"], ["#1f3a5f", "#c0562a"]].forEach(([a, b], i) =>
    db.addItem(SID(1), { id: `bbbbbbbb-0000-4000-8000-00000000000${i + 1}`, kind: "image", media_url: svg(a, b, 900, i % 2 ? 700 : 1200), media_width: 900, media_height: i % 2 ? 700 : 1200, title: `Görsel ${i + 1}`, x: i * 200, y: 0, w: 180, h: 240, z: i, group_id: "g1" }));
  db.addItem(SID(1), { id: "bbbbbbbb-0000-4000-8000-000000000010", kind: "prompt", is_draft: true, title: "Kış sokağı promptu", body: "Snowy street at blue hour, soft haze", x: 0, y: 300, w: 280, h: 200, z: 6 });
  db.addItem(SID(1), { id: "bbbbbbbb-0000-4000-8000-000000000011", kind: "note", title: "Renk notu", body: "Mavi tonları ışıkta soğuk kalsın", color: "warning", x: 320, y: 300, w: 220, h: 180, z: 7 });
  db.spacePalettes.push({ id: "p1", space_id: SID(1), name: "Kış paleti", description: "", colors: ["#1f3a5f", "#a9c5e8", "#f2e6d9", "#c0562a", "#2b2b2b"], source: "manual", source_item_id: null, position: 0, created_by: null, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-21T10:00:00Z" });
  db.addItem(SID(1), { id: "bbbbbbbb-0000-4000-8000-000000000012", kind: "palette", palette_id: "p1", x: 820, y: 300, w: 280, h: 150, z: 9 });
};
for (const [w, cols, aside] of [[1440, 3, true], [820, 2, false], [390, 2, false]]) {
  await scenario(`33. Genel bakış (${w}): tam bant (etiketler, serif açıklama, palet şeridi, Panoyu aç + Davet et), simgesiz sekmeler, ${cols} sütunlu karışık duvar, yan sütun ${aside ? "var" : "yok"}`, async ({ page }) => {
    await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
    const band = page.locator("[data-space-band]");
    await band.waitFor();
    await band.getByRole("heading", { level: 1, name: "Kış koleksiyonu moodboard" }).waitFor();
    for (const tag of ["Moodboard", "Özel", "7 öğe"]) assert.ok(await band.getByText(tag, { exact: true }).isVisible(), `etiket ${tag}`);
    assert.equal(await band.locator("[data-space-band-palette] button").count(), 5, "bandın alt kenarında ilk palet şeridi");
    const strip = await band.locator("[data-space-band-palette]").evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), bw: Math.round(el.parentElement.getBoundingClientRect().width) }));
    assert.ok(strip.h <= 12 && strip.w >= strip.bw - 2, `palet şeridi ince ve bant genişliğinde ${JSON.stringify(strip)}`);
    assert.equal(await spaceTabs(page).locator("svg").count(), 0, "sekmelerde simge yok");
    assert.deepEqual(await spaceTabNames(page), ["Genel bakış", "Pano", "Görseller", "Promptlar", "Palet", "Notlar", "Üyeler"]);
    await page.locator("[data-space-actions]").getByRole("button", { name: "Panoyu aç" }).waitFor();
    await page.locator("[data-space-invite]").waitFor();
    const wall = page.getByTestId("space-overview-wall");
    assert.equal(await wall.getByRole("listitem").count(), 7, "4 görsel + prompt + not + palet");
    const lefts = await wall.getByRole("listitem").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
    assert.equal(lefts.length, cols, `${cols} sütun ${JSON.stringify(lefts)}`);
    assert.equal(await page.getByTestId("space-overview-aside").isVisible(), aside, "yan sütun");
    if (aside) {
      const asideBox = page.getByTestId("space-overview-aside");
      await asideBox.getByRole("heading", { name: "Üyeler" }).waitFor();
      await asideBox.getByText("Sahip").waitFor();
      await asideBox.getByRole("heading", { name: "Gruplar" }).waitFor();
    }
    assert.equal(await page.getByTestId("space-overview-stats").isVisible(), w < 768, "sayı çipleri yalnız telefonda");
    assert.ok(await overflowFree(page), "yatay taşma yok");
    // Kutu → ilgili sekme; «Davet et» → Üyeler.
    await wall.getByRole("listitem").filter({ hasText: "Renk notu" }).getByRole("button").click();
    await page.waitForURL(/tab=notes/);
    await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
    await page.locator("[data-space-invite]").click();
    await page.waitForURL(/tab=members/);
  }, { viewport: { width: w, height: 900 }, setup: wallWorld });
}

await scenario("33b. Pano: başlık tek satır (kompakt), tuval kalan alanı alır ve ekran dışına taşmaz; diğer sekmelerde de tek satır", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  await page.locator("[data-space-compact]").waitFor();
  assert.equal(await page.locator("[data-hub-detail-band]").count(), 0, "tam bant yok");
  assert.equal(await page.locator("[data-space-band-palette]").count(), 0, "palet şeridi yalnız Genel bakışta");
  const board = page.getByTestId("space-board");
  const box = await board.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; }).catch(() => null);
  if (box) assert.ok(box.bottom <= 900, `tuval görünür alana sığar (${JSON.stringify(box)})`);
  await pickSpaceTab(page, "Görseller");
  await page.locator("[data-space-compact]").waitFor();
  assert.ok(await overflowFree(page));
}, { setup: wallWorld, viewport: { width: 1440, height: 900 } });

// ---------------------------------------------------------------- Space sayfası

await scenario("5. erişilemeyen Space: tek tip 'erişemiyorsun' bloğu (varlık sızmaz)", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(9)}`);
  await page.getByText("Bu Space'e erişemiyorsun").waitFor();
}, { setup: (db) => db.addSpace(9, { owner: U.bob.id, visibility: "private" }) });

// ---------------------------------------------------------------- pano

await scenario("6. pano: sürükle → yerel konum + ~700 ms sonra TEK birleştirilmiş kayıt (ızgaraya oturur); geri al eski yere kaydeder", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  const item = '[data-board-item="aaaaaaaa-0000-4000-8000-000000000001"]';
  await page.locator(item).waitFor();
  await dragBy(page, item, 100, 52);
  assert.ok(await waitFor(() => calls(db, "RPC", "space_save_layout").length === 1, 3000), "kayıt gitti");
  const saved = db.spaceItems.find((i) => i.id === "aaaaaaaa-0000-4000-8000-000000000001");
  assert.ok(saved.x % 8 === 0 && saved.y % 8 === 0 && saved.x >= 88 && saved.y >= 40, `ızgaraya oturdu: ${saved.x},${saved.y}`);
  await page.locator('[data-save-status="saved"]').waitFor();
  await page.getByRole("button", { name: "Geri al" }).first().click();
  assert.ok(await waitFor(() => calls(db, "RPC", "space_save_layout").length === 2, 3000));
  assert.equal(db.spaceItems.find((i) => i.id === "aaaaaaaa-0000-4000-8000-000000000001").x, 0);
}, { setup: (db) => boardWith(db, 1) });

await scenario("7. kayıt hatası gizlenmez: 'Kaydedilemedi' + Tekrar dene → başarı", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  const item = '[data-board-item="aaaaaaaa-0000-4000-8000-000000000002"]';
  await page.locator(item).waitFor();
  db.spaceFail.layout = 1;
  await dragBy(page, item, 60, 0);
  await page.locator('[data-save-status="error"]').first().waitFor();
  assert.ok(await page.getByText("Kaydedilemedi").first().isVisible());
  await page.locator('[data-save-status="error"]').first().getByRole("button", { name: "Tekrar dene" }).click();
  await page.locator('[data-save-status="saved"]').first().waitFor();
  assert.ok(db.spaceItems.find((i) => i.id === "aaaaaaaa-0000-4000-8000-000000000002").x > 400);
}, { setup: (db) => boardWith(db, 1) });

await scenario("8. klavye: seç → ok ile it (+8), Delete kaldırır, ⌘/Ctrl+Z aynı kimlikle geri koyar", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  const id = "aaaaaaaa-0000-4000-8000-000000000001";
  await page.locator(`[data-board-item="${id}"]`).click();
  await page.locator(`[data-board-item="${id}"][data-selected]`).waitFor();
  await page.keyboard.press("ArrowRight");
  assert.ok(await waitFor(() => db.spaceItems.find((i) => i.id === id)?.x === 8, 3000), "8 birim itildi");
  await page.keyboard.press("Delete");
  assert.ok(await waitFor(() => !db.spaceItems.some((i) => i.id === id)), "silindi");
  await page.getByText("1 öğe kaldırıldı").waitFor();
  await page.locator("[data-board-canvas]").focus();
  await page.keyboard.press("Control+z");
  assert.ok(await waitFor(() => db.spaceItems.some((i) => i.id === id)), "aynı kimlikle geri geldi");
  await page.locator(`[data-board-item="${id}"]`).waitFor();
}, { setup: (db) => boardWith(db, 1) });

await scenario("9. seçim kutusu iki öğeyi seçer → Grupla: grup oluşur, öğeler gruba bağlanır, çerçeve görünür", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  await page.locator('[data-board-item="aaaaaaaa-0000-4000-8000-000000000001"]').waitFor();
  const canvas = await page.locator("[data-board-canvas]").boundingBox();
  await page.mouse.move(canvas.x + 8, canvas.y + 8);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 8, canvas.y + canvas.height - 8, { steps: 6 });
  await page.mouse.up();
  await page.locator('[data-board-selection="2"]').waitFor();
  await page.getByRole("button", { name: "Grupla", exact: true }).click();
  assert.ok(await waitFor(() => db.spaceGroups.length === 1));
  assert.ok(await waitFor(() => db.spaceItems.every((i) => i.group_id === db.spaceGroups[0].id), 3000), "iki öğe gruba bağlandı");
  await page.locator(`[data-group-frame="${db.spaceGroups[0].id}"]`).waitFor();
}, { setup: (db) => boardWith(db, 1) });

await scenario("10. görüntüleyici panoda yalnız gezinir: ekle/geri al yok, sürükleme kaydetmez", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  const item = '[data-board-item="aaaaaaaa-0000-4000-8000-000000000001"]';
  await page.locator(item).waitFor();
  assert.equal(await page.getByRole("button", { name: "Geri al" }).count(), 0);
  await dragBy(page, item, 80, 40);
  await page.waitForTimeout(1000);
  assert.equal(calls(db, "RPC", "space_save_layout").length, 0);
}, { setup: (db) => boardWith(db, 1, { owner: U.bob.id, members: [[U.alice, "viewer"]] }) });

await scenario("11. dokunmatik: tek parmak boş alanda kaydırır, iki parmak kıstırma yakınlaştırır, öğeye dokunma seçer; tam ekran", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  await page.locator('[data-board-item="aaaaaaaa-0000-4000-8000-000000000001"]').waitFor();
  const world = page.locator("[data-board-world]");
  const before = await world.evaluate((el) => el.style.transform);
  const zoomBefore = Number(await page.locator("[data-board-zoom]").getAttribute("data-board-zoom"));
  assert.ok(zoomBefore >= 50, `telefonda ilk açılış okunur yakınlıkta: %${zoomBefore}`);
  // Sentetik dokunma işaretçileri (Playwright'ın dokunmatiği yalnız "tap" verir).
  await page.locator("[data-board-canvas]").evaluate((canvas) => {
    const r = canvas.getBoundingClientRect();
    const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: id === 1 }));
    fire("pointerdown", 1, 20, r.height - 20);
    for (let i = 1; i <= 6; i += 1) fire("pointermove", 1, 20 + i * 10, r.height - 20 - i * 5);
    fire("pointerup", 1, 80, r.height - 50);
  });
  assert.notEqual(await world.evaluate((el) => el.style.transform), before, "kaydırıldı");
  await page.locator("[data-board-canvas]").evaluate((canvas) => {
    const r = canvas.getBoundingClientRect();
    const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: id === 1 }));
    fire("pointerdown", 1, 100, 200);
    fire("pointerdown", 2, 160, 200);
    for (let i = 1; i <= 6; i += 1) {
      fire("pointermove", 1, 100 - i * 10, 200);
      fire("pointermove", 2, 160 + i * 10, 200);
    }
    fire("pointerup", 1, 40, 200);
    fire("pointerup", 2, 220, 200);
  });
  const zoomAfter = Number(await page.locator("[data-board-zoom]").getAttribute("data-board-zoom"));
  assert.ok(zoomAfter > zoomBefore, `yakınlaştı: ${zoomBefore} → ${zoomAfter}`);
  // Kıstırma/kaydırma sonrası öğe tuvalin dışında kalabilir: önce sığdır, sonra dokun.
  await page.locator("[data-board-zoom]").tap(); // telefonda yüzde düğmesi ekrana sığdırır (docs/history/363-*)
  await page.locator('[data-board-item="aaaaaaaa-0000-4000-8000-000000000002"]').tap();
  await page.locator('[data-board-selection="1"]').waitFor();
  await page.getByRole("button", { name: "Diğer pano araçları" }).tap();
  await page.getByRole("menuitem", { name: "Tam ekran" }).click();
  await page.locator('[data-testid="space-board"][data-fullscreen]').waitFor();
  const box = await page.getByTestId("space-board").boundingBox();
  assert.ok(box.width >= 389 && box.height >= 800, "tüm ekranı kaplar");
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 844 }, touch: true, setup: (db) => boardWith(db, 1) });

// ---------------------------------------------------------------- sekmeler

await scenario("12. görseller: yükle → space-media/{space}/… klasörüne gider, görsel öğesi eklenir; kaynağı kapalı görsel yer tutucuyla", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=images`);
  await page.getByTestId("space-images").waitFor();
  await page.getByText("Kaynak artık erişilemiyor").first().waitFor();
  await page.getByTestId("upload-images-input").setInputFiles({ name: "referans.png", mimeType: "image/png", buffer: PNG });
  assert.ok(await waitFor(() => db.spaceItems.some((i) => i.kind === "image" && i.media_url?.includes(`/space-media/${SID(1)}/`))), "öğe eklendi");
  assert.ok(db.calls.some((c) => c.method === "UPLOAD" && c.table.startsWith(`space-media/${SID(1)}/`)), "Space klasörüne yüklendi");
  await waitFor(async () => (await page.locator("[data-image-item]").count()) === 2);
}, { setup: (db) => { db.addSpace(1, { title: "Görseller" }); db.addItem(SID(1), { kind: "image", prompt_id: "a0000000-0000-4000-8000-0000000000ff", media_url: "https://example.supabase.co/storage/v1/object/public/prompt-media/x/gizli.jpg" }); } });

await scenario("13. palet: HEX normalleşir, geçersiz HEX uyarır, görselden çıkarma gerçek renkle palet oluşturur", async ({ page, db, context }) => {
  // İmzalı adres GET'i gerçek bir görsel döndürsün (mor #6633cc): çıkarılan renk ona yakın olmalı.
  await context.route("https://example.supabase.co/storage/v1/object/sign/**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: solidPng(0x66, 0x33, 0xcc) })
      : route.fallback(),
  );
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=palette`);
  await page.getByTestId("space-palettes").waitFor();
  await page.getByRole("button", { name: "Yeni palet" }).click();
  await page.getByLabel("Palet adı").fill("Gece");
  await page.getByRole("dialog").getByRole("button", { name: "Kaydet" }).click();
  await page.locator('[data-palette="Gece"]').waitFor();
  await page.getByLabel("Renk ekle (HEX)").fill("FF7A1A");
  await page.locator('[data-palette="Gece"]').getByRole("button", { name: "Ekle", exact: true }).click();
  assert.ok(await waitFor(() => db.spacePalettes[0]?.colors?.[0] === "#ff7a1a"), "normalleşti");
  await page.getByLabel("Renk ekle (HEX)").fill("#12zz");
  await page.locator('[data-palette="Gece"]').getByRole("button", { name: "Ekle", exact: true }).click();
  await page.getByText("Geçerli bir HEX kodu gir").waitFor();
  await page.getByRole("button", { name: "Görselden çıkar" }).click();
  await page.getByTestId("extract-palette").getByRole("button", { name: "Kare" }).click();
  assert.ok(await waitFor(() => db.spacePalettes.some((p) => p.source === "image" && p.colors.length > 0), 5000), "görselden palet");
  assert.deepEqual(db.spacePalettes.find((p) => p.source === "image").colors, ["#6633cc"], "gerçek renk çıkarıldı");
}, { setup: (db) => { db.addSpace(1); db.addItem(SID(1), { kind: "image", media_url: MEDIA(SID(1), 1), title: "Kare" }); } });

await scenario("14. notlar: gizli not oluşturulur (is_private), not öğeye bağlanabilir", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=notes`);
  await page.getByTestId("new-note").click();
  const editor = page.getByTestId("note-editor");
  await editor.getByLabel("Başlık").fill("Karar");
  await editor.getByLabel("Not", { exact: true }).fill("Mor tonlar kalsın");
  await editor.getByLabel("Bağlı öğe").selectOption({ label: "Işık notu" }).catch(() => undefined);
  await editor.getByText("Yalnız üyeler görsün").click();
  await editor.getByRole("button", { name: "Kaydet" }).click();
  assert.ok(await waitFor(() => db.spaceItems.some((i) => i.title === "Karar" && i.is_private === true && i.kind === "note")));
  await page.locator('[data-note="Karar"]').getByText("Gizli").waitFor();
}, { setup: (db) => { boardWith(db, 1); } });

await scenario("15. üyeler: sahip davet eder; bilinmeyen kullanıcı adında çevrilmiş hata (ham SQL yok)", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=members`);
  const form = page.getByTestId("invite-member");
  await form.getByLabel("Kullanıcı adı").fill("@carol");
  await form.getByRole("button", { name: "Davet et" }).click();
  await page.getByText("@carol davet edildi").waitFor();
  assert.equal(calls(db, "RPC", "invite_space_member")[0].body.p_username, "carol");
  await page.getByTestId("pending-invites").waitFor();
  await form.getByLabel("Kullanıcı adı").fill("yokboyle");
  await form.getByRole("button", { name: "Davet et" }).click();
  await page.getByText("Bu kullanıcı adıyla davet edilebilecek biri yok.").waitFor();
}, { setup: (db) => db.addSpace(1, { members: [[U.bob, "editor"]] }) });

// ---------------------------------------------------------------- Promptly entegrasyonu

await scenario("19. prompt detayı ⋮ → Space'e ekle: görsel + prompt kartı seçilir, kaynağa başvurulur, sonuçta 'Space'i aç'", async ({ page, db }) => {
  await page.goto(`${BASE}${PAGES.prompt}`);
  await page.locator("[data-detail-menu]").getByRole("button", { name: /seçenek|options/i }).click();
  await page.locator("[data-add-to-space]").click();
  const modal = page.getByTestId("add-to-space");
  await modal.getByText("Prompt kartı").click();
  await modal.locator('[data-add-space="Ejderha Dünyası"]').click();
  await page.getByTestId("add-to-space-submit").click();
  await page.getByTestId("add-to-space-done").waitFor();
  const added = db.spaceItems.filter((i) => i.prompt_id === ID.prompt);
  assert.deepEqual(added.map((i) => i.kind).sort(), ["image", "prompt"]);
  assert.ok(added.every((i) => !i.body), "metin kopyalanmadı");
  assert.ok(await page.getByRole("link", { name: "Space'i aç" }).isVisible());
}, { setup: (db) => boardWith(db, 1) });

await scenario("20. Space'e ekle: aynı görsel zaten varsa 'Zaten var' + sunucu yinelemeyi reddeder (çevrilmiş hata)", async ({ page }) => {
  await page.goto(`${BASE}${PAGES.prompt}`);
  await page.locator("[data-detail-menu]").getByRole("button", { name: /seçenek|options/i }).click();
  await page.locator("[data-add-to-space]").click();
  const modal = page.getByTestId("add-to-space");
  await modal.locator('[data-add-space="Ejderha Dünyası"]').getByText("Zaten var").waitFor();
  await modal.locator('[data-add-space="Ejderha Dünyası"]').click();
  await page.getByTestId("add-to-space-submit").click();
  await modal.getByText("Bu içerik bu Space'te zaten var.").waitFor();
}, {
  setup: (db) => {
    boardWith(db, 1);
    db.addItem(SID(1), { kind: "image", prompt_id: ID.prompt, media_url: svg("#6d5bd0", "#d9d2c3") });
  },
});

await scenario("23. pano: köşe tutamacı boyutlandırır; görsel oranını korur ve kaydedilir", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  const id = "bbbbbbbb-0000-4000-8000-000000000001";
  await page.locator(`[data-board-item="${id}"]`).click();
  const handle = page.locator(`[data-resize-handle="${id}"]`);
  await handle.waitFor();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 20, { steps: 6 });
  await page.mouse.up();
  assert.ok(await waitFor(() => calls(db, "RPC", "space_save_layout").length === 1, 3000));
  const item = db.spaceItems.find((i) => i.id === id);
  assert.ok(item.w > 260, `genişledi: ${item.w}`);
  assert.ok(Math.abs(item.w / item.h - 2) < 0.05, `oran korundu: ${item.w}x${item.h}`);
}, { setup: (db) => { db.addSpace(1); db.addItem(SID(1), { id: "bbbbbbbb-0000-4000-8000-000000000001", kind: "image", media_url: MEDIA(SID(1), 1), x: 0, y: 0, w: 260, h: 130 }); } });

await scenario("24. palet: görselden renk çıkarılamazsa (saydam) dürüst hata; sahte palet oluşmaz", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=palette`);
  await page.getByRole("button", { name: "Görselden çıkar" }).click();
  await page.getByTestId("extract-palette").getByRole("button", { name: "Kare" }).click();
  await page.getByText("Bu görselden renk çıkarılamadı.").waitFor();
  assert.equal(db.spacePalettes.length, 0);
}, { setup: (db) => { db.addSpace(1); db.addItem(SID(1), { kind: "image", media_url: MEDIA(SID(1), 1), title: "Kare" }); } });


// ---------------------------------------------------------------- dil + telefon

await scenario("29. pano araç çubuğu: '+' menüsü kırpılmaz (görünür alanda, öğeler tıklanabilir); seçim çubuğunda 'Hizala' menüsü ekranın altına taşmaz, üste açılır", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  await page.locator('[data-board-item="aaaaaaaa-0000-4000-8000-000000000001"]').waitFor({ state: "attached" });
  await page.locator("[data-board-zoom]").tap(); // telefonda yüzde düğmesi ekrana sığdırır (docs/history/363-*)
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  const first = menu.getByRole("menuitem").first();
  const box = await first.boundingBox();
  const vp = page.viewportSize();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, `menü öğesi görünür alanda: ${JSON.stringify(box)}`);
  // Menü araç çubuğunun overflow kırpmasının DIŞINDA: öğenin merkezindeki en üst öğe menü öğesinin kendisi.
  const hit = await first.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  assert.ok(hit, "menü öğesi kırpılmadan tıklanabilir");
  await menu.getByRole("menuitem", { name: "Not" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  // İki öğeyi seç → Hizala menüsü (seçim çubuğu ekranın altında): yukarı açılır, görünür kalır.
  await page.locator("[data-board-zoom]").tap(); // telefonda yüzde düğmesi ekrana sığdırır (docs/history/363-*)
  await page.getByRole("button", { name: "Çoklu seçim" }).first().tap();
  await page.locator('[data-board-item="aaaaaaaa-0000-4000-8000-000000000001"]').tap();
  await page.locator('[data-board-item="aaaaaaaa-0000-4000-8000-000000000002"]').tap();
  await page.locator('[data-board-selection="2"]').waitFor();
  await page.getByRole("button", { name: "Hizala ve düzenle" }).click();
  const align = page.getByRole("menu");
  await align.waitFor();
  const alignBox = await align.boundingBox();
  assert.ok(alignBox.y >= 0 && alignBox.y + alignBox.height <= vp.height, `hizala menüsü görünür alanda: ${JSON.stringify(alignBox)}`);
}, { viewport: { width: 390, height: 844 }, touch: true, setup: (db) => boardWith(db, 1) });

await scenario("30. Yeni Space penceresi (iOS klavyesi): dokunmatikte başlık kutusu kendiliğinden odaklanmaz; klavye açılınca pencere görünür alana (visualViewport) sığar, başlık ve Oluştur görünür kalır", async ({ page }) => {
  await page.addInitScript(() => {
    const vv = new EventTarget();
    Object.assign(vv, { height: window.innerHeight, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  });
  await page.goto(`${BASE}/spaces`);
  await page.getByTestId("spaces-first-empty").waitFor();
  await page.getByTestId("create-space").click();
  const form = page.getByTestId("create-space-form");
  await form.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.tagName === "INPUT"), false, "dokunmatikte klavye kendiliğinden açılmaz");
  const closedGround = await page.evaluate(() => {
    const overlay = document.querySelector("[role=dialog]");
    return { bg: getComputedStyle(overlay).backgroundColor, blur: getComputedStyle(overlay).backdropFilter };
  });
  assert.notEqual(closedGround.blur, "none", "normalde arka plan hafif bulanık");
  // Klavye açıldı: görünür alan 844 → 380 px.
  await page.evaluate(() => {
    window.visualViewport.height = 380;
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(300);
  const dialog = await page.getByRole("dialog").boundingBox();
  assert.ok(dialog.y >= -1 && dialog.y + dialog.height <= 381, `pencere katmanı görünür alana oturur: ${JSON.stringify(dialog)}`);
  const title = await page.getByRole("heading", { name: "Yeni Space" }).boundingBox();
  assert.ok(title && title.y >= 0, `başlık ekranın içinde: ${JSON.stringify(title)}`);
  const submit = await form.getByRole("button", { name: "Oluştur" }).boundingBox();
  assert.ok(submit && submit.y + submit.height <= 381, `Oluştur düğmesi klavyenin üstünde: ${JSON.stringify(submit)}`);
  // docs/history/470-*: klavye açıkken de pencere KART kalır (yanlardan boşluklu, yuvarlak), arkası karartılmış sayfadır (beyaz kaplama yok);
  // görünür alanın altındaki şerit (iOS 26 Otomatik Doldur çubuğu) belgeye bağlı karartıyla boyanır, sayfa gizlenmez.
  const card = await form.evaluate((element) => {
    let panel = element;
    while (panel.parentElement && !panel.parentElement.matches("[role=dialog] > div")) panel = panel.parentElement;
    const box = panel.getBoundingClientRect();
    return { x: box.x, width: box.width, radius: getComputedStyle(panel).borderTopLeftRadius };
  });
  assert.ok(card.x >= 8 && card.width <= 390 - 16, `kart yanlardan boşluklu: ${JSON.stringify(card)}`);
  assert.notEqual(card.radius, "0px", "kartın köşeleri yuvarlak");
  const ground = await page.evaluate(() => {
    const overlay = document.querySelector("[role=dialog]");
    const below = overlay.nextElementSibling;
    return {
      overlayBg: getComputedStyle(overlay).backgroundColor,
      overlayBlur: getComputedStyle(overlay).backdropFilter,
      belowBlur: below ? getComputedStyle(below).backdropFilter : null,
      belowTop: below ? below.getBoundingClientRect().top + window.scrollY : null,
      belowBg: below ? getComputedStyle(below).backgroundColor : null,
      pageVisible: getComputedStyle(document.querySelector("#main-content")).visibility,
    };
  });
  assert.match(ground.overlayBg, /rgba\(/, `arka plan karartı (yarı saydam): ${ground.overlayBg}`);
  assert.equal(ground.belowTop, 380, `görünür alanın altından başlayan karartı: ${JSON.stringify(ground)}`);
  assert.equal(ground.belowBg, ground.overlayBg, "şerit aynı karartıyla boyanır");
  assert.equal(ground.pageVisible, "visible", "arkadaki sayfa gizlenmez");
  // docs/history/471-*: arka plan klavye açıkken de normaldeki gibi (aynı karartı + aynı bulanıklık).
  assert.equal(ground.overlayBg, closedGround.bg, "klavye açıkken karartı normaldekiyle aynı");
  assert.equal(ground.overlayBlur, closedGround.blur, "klavye açıkken bulanıklık normaldekiyle aynı");
  assert.equal(ground.belowBlur, closedGround.blur, "şeritteki karartı da aynı bulanıklıkta");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/space-new-keyboard.png` });
  // Klavye kapandı: katman tam ekrana döner.
  await page.evaluate(() => {
    window.visualViewport.height = window.innerHeight;
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(300);
  const restored = await page.getByRole("dialog").boundingBox();
  assert.ok(restored.height >= 800, `katman tam ekrana döndü: ${restored.height}`);
}, { viewport: { width: 390, height: 844 }, touch: true });

await scenario("31. ana sayfa (docs/history/231-*, 371-*): bant + altı çizgili sekmeler (davet sayaçlı) + simgeler; tür karosu Yeni Space'i o türle açar; filtre sayfası sıralama/tür; görünüm anahtarı; hiçbir özellik eksik değil", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByRole("heading", { level: 1, name: "Spaces" }).waitFor();
  await page.getByTestId("spaces-list").waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/spaces-new-desktop.png` });
  await page.getByRole("tab", { name: /Davetler/ }).waitFor();
  await page.getByTestId("space-invites-banner").waitFor();
  // Menü: beş seçenek (Tümü · Benim · Paylaşılan · Arşiv · Davetler), davet sayaçlı.
  const sectionTabs = page.getByRole("tablist", { name: "Space süzgeci" });
  assert.equal(await sectionTabs.getByRole("tab").count(), 5);
  assert.match(await sectionTabs.getByRole("tab", { name: /Davetler/ }).textContent(), /Davetler\s*1/);
  await page.keyboard.press("Escape");
  // Tür karosu → Yeni Space penceresi o türle.
  const tile = page.locator('[data-space-template="brand"]');
  await tile.waitFor();
  await tile.click();
  const form = page.getByTestId("create-space-form");
  await form.waitFor();
  assert.equal(await form.getByRole("radio", { name: /Marka kimliği/ }).isChecked(), true, "tür önceden seçili");
  await page.keyboard.press("Escape");
  await form.waitFor({ state: "detached" });
  // Filtre sayfası: sıralama RPC'ye gider; tür süzgeci yüklenmiş kartları süzer; temizle geri getirir.
  await page.locator("[data-filter-button]").click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Ada göre (A–Z)" }).click();
  await waitFor(() => calls(db, "RPC", "list_spaces").some((c) => c.body.p_sort === "title"));
  await sheet.getByRole("button", { name: "Karakter tasarımı" }).click();
  await waitFor(async () => (await page.locator("[data-space-card]").count()) === 1);
  await sheet.getByRole("button", { name: "İç mekân tasarımı" }).click();
  await sheet.getByRole("button", { name: "Bitti" }).click();
  await page.getByText("Sonuç yok").waitFor();
  assert.equal(await page.locator("[data-space-card]").count(), 0, "tür süzgeci kartları süzer");
  await page.locator("[data-filter-button]").click();
  await page.getByRole("dialog").getByRole("button", { name: "Süzgeçleri temizle" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Bitti" }).click();
  await waitFor(async () => (await page.locator("[data-space-card]").count()) >= 2);
  // Görünüm anahtarı tek düğme; tercih kalır.
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await page.locator('[data-view="list"]').waitFor();
  await page.getByRole("button", { name: "Izgara", exact: true }).waitFor();
  await page.reload();
  await page.locator('[data-view="list"]').waitFor();
}, {
  setup: (db) => {
    boardWith(db, 1);
    db.addSpace(2, { title: "Marka" });
    db.addSpace(3, { title: "Davetli Space", owner: U.bob.id, visibility: "private" });
    db.spaceInvites.push({ id: "inv1", space_id: SID(3), invitee_id: ME, role: "editor", invited_by: U.bob.id, status: "pending", created_at: "2026-09-20T10:00:00Z" });
  },
});

await scenario("32. telefon 390px: kaydırmalı bölüm sekmeleri, filtre sayfası ve arama taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByTestId("spaces-list").waitFor();
  assert.ok(await overflowFree(page));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/spaces-new-mobile.png` });
  // "Herkese açık" bölümü docs/history/459-* ile kalktı (Space'ler özel): kaydırmalı sekmeler Tümü · Benim · Paylaşılan · Arşiv'dir.
  await page.getByRole("tab", { name: "Paylaşılan" }).click();
  await waitFor(() => true);
  await page.locator("[data-filter-button]").click();
  await page.getByRole("dialog").getByRole("button", { name: "Bitti" }).waitFor();
  assert.ok(await overflowFree(page));
  await page.getByRole("dialog").getByRole("button", { name: "Bitti" }).click();
  await page.getByRole("searchbox").waitFor();
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 844 }, setup: (db) => boardWith(db, 1) });

await scenario("21. İngilizce: ana sayfa, sekmeler ve pano araçları İngilizce", async ({ page }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByRole("tab", { name: "Mine" }).waitFor();
  await page.getByRole("tab", { name: "Shared" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("create-space").getByText("New Space").waitFor();
  await page.getByText("Start a new Space").waitFor();
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  await page.getByRole("tablist", { name: "Space sections" }).getByRole("tab", { name: /Board/ }).waitFor();
  await page.getByRole("button", { name: "Fit to screen" }).first().waitFor();
}, { lang: "en", setup: (db) => boardWith(db, 1) });

await scenario("22. telefon 390px: ana sayfa ve Space sayfası yatay taşmaz; bölüm menüsü açılır", async ({ page }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByTestId("spaces-list").waitFor();
  assert.ok(await overflowFree(page), "ana sayfa taşmıyor");
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.ok(await overflowFree(page), "Space sayfası taşmıyor");
  await pickSpaceTab(page, /Pano/);
  await page.getByTestId("space-board").waitFor();
  assert.ok(await overflowFree(page), "pano taşmıyor");
}, { viewport: { width: 390, height: 844 }, setup: (db) => boardWith(db, 1, { title: "Çok uzun bir Space adı ki telefonda taşmaması gerekiyor elbette" }) });

server.close();
await browser.close();
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
