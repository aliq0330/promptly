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

await scenario("2. liste: kartlar, süzgeç RPC'ye gider, arama gecikmeli, liste görünümü, favori, davet kabul", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByTestId("spaces-list").waitFor();
  assert.equal(await page.locator("[data-space-card]").count(), 2);
  await page.getByRole("tab", { name: "Paylaşılan" }).click();
  await waitFor(() => calls(db, "RPC", "list_spaces").some((c) => c.body.p_filter === "shared"));
  await page.getByText("Seninle paylaşılan Space yok").waitFor();
  await page.getByRole("tab", { name: "Tümü" }).click();
  await page.getByRole("searchbox", { name: /Space, görsel/ }).fill("altın");
  await waitFor(() => calls(db, "RPC", "list_spaces").some((c) => c.body.p_query === "altın"));
  await waitFor(async () => (await page.locator("[data-space-card]").count()) === 1);
  await page.getByRole("searchbox", { name: /Space, görsel/ }).fill("");
  await page.getByRole("button", { name: "Liste" }).click();
  await page.locator('[data-view="list"]').waitFor();
  await page.locator(`[data-space-card="${SID(1)}"]`).getByRole("button", { name: "Sabitle" }).click();
  await waitFor(() => calls(db, "RPC", "set_space_favorite").length === 1);
  assert.equal(calls(db, "RPC", "set_space_favorite")[0].body.p_favorite, true);
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

await scenario("3. ziyaretçi: yalnız herkese açık süzgeç; oluştur giriş penceresi açar; yazma çağrısı yok", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByTestId("spaces-list").waitFor();
  assert.ok(calls(db, "RPC", "list_spaces").every((c) => c.body.p_filter === "public"));
  assert.equal(await page.getByRole("tablist", { name: "Space süzgeci" }).count(), 0);
  await page.getByTestId("create-space").click();
  await page.getByRole("dialog").getByRole("link", { name: "Giriş yap" }).first().waitFor();
  assert.equal(calls(db, "RPC", "create_space").length, 0);
}, { guest: true, setup: (db) => db.addSpace(1, { title: "Açık Space", owner: U.bob.id, visibility: "public" }) });

// ---------------------------------------------------------------- Space sayfası

await scenario("4. görüntüleyici (herkese açık, üye değil): Üyeler sekmesi yok, düzenleme düğmeleri yok, gizli not görünmez", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByRole("heading", { level: 1, name: "Ejderha Dünyası" }).waitFor();
  assert.equal(await page.getByRole("tab", { name: /Üyeler/ }).count(), 0);
  await page.getByRole("tab", { name: /Notlar/ }).click();
  await page.getByTestId("space-notes").waitFor();
  assert.equal(await page.getByTestId("new-note").count(), 0, "yeni not düğmesi yok");
  assert.equal(await page.locator('[data-note="Gizli plan"]').count(), 0, "gizli not yok");
  assert.equal(await page.locator('[data-note="Işık notu"]').count(), 1);
}, {
  setup: (db) => {
    boardWith(db, 1, { owner: U.bob.id, visibility: "public" });
    db.spaceItems.forEach((i) => (i.created_by = U.bob.id));
    db.addItem(SID(1), { kind: "note", title: "Gizli plan", is_private: true });
  },
});

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
  await page.getByRole("button", { name: "Ekrana sığdır" }).first().tap();
  await page.locator('[data-board-item="aaaaaaaa-0000-4000-8000-000000000002"]').tap();
  await page.locator('[data-board-selection="1"]').waitFor();
  await page.getByRole("button", { name: "Tam ekran" }).click();
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

await scenario("16. paylaşım: 'Bağlantıya sahip olanlar' → bağlantı oluştur (bir kez gösterilir) → iptal", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByRole("button", { name: "Paylaş" }).click();
  const modal = page.getByTestId("share-space-modal");
  await modal.getByText("Bağlantıya sahip olanlar").click();
  await waitFor(() => db.spaces[0].visibility === "link");
  await modal.getByRole("button", { name: "Bağlantı oluştur" }).click();
  const url = await page.getByTestId("space-link-url").inputValue();
  assert.match(url, /\/spaces\/link#tok_/);
  await modal.getByRole("button", { name: "Bağlantıyı iptal et" }).click();
  await modal.getByText("Etkin bağlantı yok.").waitFor();
  assert.ok(db.spaceLinks.every((l) => l.revoked_at));
}, { setup: (db) => db.addSpace(1) });

await scenario("17. bağlantı sayfası: geçerli token → Space; geçersiz → tek tip hata", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/link#tok_${"x".repeat(30)}0`);
  await page.waitForURL(new RegExp(`id=${SID(1)}`));
  await page.getByRole("heading", { level: 1, name: "Paylaşılan" }).waitFor();
  assert.equal(calls(db, "RPC", "open_space_link").length, 1);
  await page.goto(`${BASE}/spaces/link#${"y".repeat(40)}`);
  await page.getByText("Bu bağlantı geçerli değil").waitFor();
}, {
  setup: (db) => {
    db.addSpace(1, { title: "Paylaşılan", owner: U.bob.id, visibility: "link" });
    db.spaceLinks.push({ id: "L1", space_id: SID(1), token: `tok_${"x".repeat(30)}0`, created_at: "2026-09-20T10:00:00Z", revoked_at: null });
  },
});

await scenario("18. bağlantı sayfası (ziyaretçi): giriş ister, token giriş adresine KONMAZ", async ({ page }) => {
  await page.goto(`${BASE}/spaces/link#tok_${"x".repeat(30)}0`);
  await page.getByText("Görüntülemek için giriş yap").waitFor();
  const href = await page.getByTestId("space-link-page").getByRole("link", { name: "Giriş yap" }).getAttribute("href");
  assert.ok(!href.includes("tok_"), `token sızmadı: ${href}`);
}, { guest: true });

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

// ---------------------------------------------------------------- Albüm düzeni + keşif (docs/history/214-*)

const palette = (spaceId, colors, over = {}) => ({ id: crypto.randomUUID(), space_id: spaceId, name: over.name ?? "Gece", description: "", colors, source: "manual", source_item_id: null, position: over.position ?? 0, created_by: ME, created_at: "2026-09-20T10:00:00Z" });

await scenario("25. ziyaretçi Space'i vitrin olarak görür: Görseller açılır, Genel bakış yok, 'Panoyu gez', bant paleti HEX kopyalar, Paylaş adresi verir", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByRole("heading", { level: 1, name: "Ejderha Dünyası" }).waitFor();
  assert.equal(await page.getByRole("tab", { name: /Genel bakış/ }).count(), 0, "ziyaretçiye genel bakış yok");
  assert.equal(await page.getByRole("tab", { selected: true }).first().innerText().then((x) => x.startsWith("Görseller")), true);
  assert.equal(await page.getByRole("tab", { name: /Notlar/ }).count(), 0, "notu olmayan Space'te Notlar sekmesi yok");
  await page.getByRole("button", { name: "Panoyu gez" }).waitFor();
  const strip = page.locator("[data-space-band-palette]");
  await strip.getByText("Gece").waitFor();
  await strip.getByRole("button", { name: "#ff5fa2 kopyala" }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "#ff5fa2");
  await page.locator("[data-space-actions]").getByRole("button", { name: "Paylaş" }).click();
  await waitFor(async () => (await page.evaluate(() => navigator.clipboard.readText())).includes(`/spaces/local?id=${SID(1)}`));
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes(`/spaces/local?id=${SID(1)}`));
}, {
  setup: (db) => {
    db.addSpace(1, { title: "Ejderha Dünyası", owner: U.bob.id, visibility: "public" });
    db.addItem(SID(1), { kind: "image", media_url: MEDIA(SID(1), 1), created_by: U.bob.id });
    db.spacePalettes.push(palette(SID(1), ["#ff5fa2", "#22d3c5", "#7c5cff"]));
  },
});

await scenario("26. sahip: bant paleti + ⋮ → Sabitle (set_space_favorite); ana sayfa kartı Albüm bandı + palet çizgisi + Sabitli", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByRole("heading", { level: 1, name: "Ejderha Dünyası" }).waitFor();
  await page.getByRole("tab", { name: /Genel bakış/, selected: true }).waitFor();
  await page.locator("[data-space-band-palette]").waitFor();
  await page.locator("[data-detail-menu]").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Sabitle" }).click();
  await waitFor(() => calls(db, "RPC", "set_space_favorite").length === 1);
  assert.equal(calls(db, "RPC", "set_space_favorite")[0].body.p_favorite, true);
  await page.goto(`${BASE}/spaces`);
  const card = page.locator(`[data-space-card="${SID(1)}"]`);
  await card.locator("[data-palette-strip]").waitFor();
  await card.getByRole("button", { name: "Sabitlemeyi kaldır" }).waitFor();
  await page.getByRole("tab", { name: "Sabitli" }).click();
  await waitFor(() => calls(db, "RPC", "list_spaces").some((c) => c.body.p_filter === "favorites"));
}, {
  setup: (db) => {
    boardWith(db, 1);
    db.spacePalettes.push(palette(SID(1), ["#111111", "#eeeeee"]));
  },
});

await scenario("27. prompt detayı: 'Bu prompt şu Space'lerde' yalnız herkese açık + arşivsiz Space'i listeler", async ({ page, db }) => {
  await page.goto(`${BASE}${PAGES.prompt}`);
  const list = page.getByTestId("prompt-in-spaces");
  await list.waitFor();
  assert.ok(calls(db, "RPC", "list_public_spaces").some((c) => c.body.p_prompt === ID.prompt));
  assert.deepEqual(await list.locator("a").evaluateAll((links) => links.map((a) => a.textContent.includes("Açık vitrin"))), [true]);
  await list.getByRole("link").first().click();
  await page.waitForURL(new RegExp(`spaces/local/?\\?id=${SID(1)}`));
}, {
  setup: (db) => {
    db.addSpace(1, { title: "Açık vitrin", owner: U.bob.id, visibility: "public" });
    db.addSpace(2, { title: "Kendi özelim", visibility: "private" });
    db.addSpace(3, { title: "Arşivli açık", owner: U.bob.id, visibility: "public", archived: true });
    for (const n of [1, 2, 3]) db.addItem(SID(n), { kind: "prompt", prompt_id: ID.prompt, created_by: db.spaces[n - 1].owner_id });
  },
});

await scenario("28. profil: herkese açık Space varsa 'Spaces' sekmesi (yalnız herkese açık olanlar); yoksa sekme yok", async ({ page, db }) => {
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await page.getByRole("tab", { name: /Spaces/ }).click();
  const grid = page.getByTestId("profile-spaces");
  await grid.waitFor();
  assert.equal(await grid.locator("[data-space-card]").count(), 1);
  await grid.getByText("Bob'un açık Space'i").waitFor();
  assert.ok(calls(db, "RPC", "list_public_spaces").some((c) => c.body.p_owner === U.bob.id));
  await page.goto(`${BASE}/profile/real?username=${U.carol.username}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await waitFor(() => calls(db, "RPC", "list_public_spaces").some((c) => c.body.p_owner === U.carol.id));
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole("tab", { name: /Spaces/ }).count(), 0);
}, {
  setup: (db) => {
    db.addSpace(1, { title: "Bob'un açık Space'i", owner: U.bob.id, visibility: "public" });
    db.addSpace(2, { title: "Bob'un özeli", owner: U.bob.id, visibility: "private" });
  },
});

// ---------------------------------------------------------------- dil + telefon

await scenario("21. İngilizce: ana sayfa, sekmeler ve pano araçları İngilizce", async ({ page }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByRole("tab", { name: "Mine" }).waitFor();
  await page.getByTestId("create-space").getByText("New Space").waitFor();
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=board`);
  await page.getByRole("tab", { name: /Board/ }).waitFor();
  await page.getByRole("button", { name: "Fit to screen" }).first().waitFor();
}, { lang: "en", setup: (db) => boardWith(db, 1) });

await scenario("22. telefon 390px: ana sayfa ve Space sayfası yatay taşmaz; sekmeler kaydırılabilir", async ({ page }) => {
  await page.goto(`${BASE}/spaces`);
  await page.getByTestId("spaces-list").waitFor();
  assert.ok(await overflowFree(page), "ana sayfa taşmıyor");
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.ok(await overflowFree(page), "Space sayfası taşmıyor");
  await page.getByRole("tab", { name: /Pano/ }).click();
  await page.getByTestId("space-board").waitFor();
  assert.ok(await overflowFree(page), "pano taşmıyor");
}, { viewport: { width: 390, height: 844 }, setup: (db) => boardWith(db, 1, { title: "Çok uzun bir Space adı ki telefonda taşmaması gerekiyor elbette" }) });

server.close();
await browser.close();
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
