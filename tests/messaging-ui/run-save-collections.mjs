// Kaydet ≠ koleksiyona ekle (docs/history/336-*) — ağ taklitli. Gerçek Supabase'e KARŞI DENENMEDİ; DB tarafı `supabase/tests/saved-collections.sql`.
// Taklit, veritabanı tetikleyicisinin davranışını (koleksiyona eklenen içerik kayda da girer; `unsave_content` hepsini siler) bellekte yeniden üretir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { ID, PAGES, installDetailData } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4181/promptly";
const server = await serve(4181);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const SYS = "c5000000-0000-4000-8000-000000000000";
const FILM = "c5000000-0000-4000-8000-000000000001";
const DIZI = "c5000000-0000-4000-8000-000000000002";
const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const COL_ROWS = () => [
  { id: SYS, name: "Kaydedilenler", visibility: "private", item_count: 0, follower_count: 0, is_default: true },
  { id: FILM, name: "Film", visibility: "private", item_count: 0, follower_count: 0, is_default: false },
  { id: DIZI, name: "Dizi", visibility: "public", item_count: 0, follower_count: 0, is_default: false },
];
const TARGETS = ["prompt_id", "workflow_id", "preset_id", "community_post_id"];

/**
 * Koleksiyon uçlarını taklit eder. `db.items` = collection_items { collection_id, <hedef sütun> }.
 * Tetikleyici davranışı: normal koleksiyona eklenen içerik sistem koleksiyonuna da girer; kopya = 23505.
 */
function withCollections(db, { saved = [] } = {}) {
  db.items = saved.map((x) => ({ collection_id: SYS, ...x }));
  db.collections = COL_ROWS();
  const targetOf = (row) => TARGETS.find((c) => row[c]);
  const same = (a, b) => a.collection_id === b.collection_id && targetOf(a) === targetOf(b) && a[targetOf(a)] === b[targetOf(b)];
  db.extraRoutes = async ({ table, method, q, body, rows, json }) => {
    if (table === "collections" && method === "GET") {
      let list = db.collections;
      if (q.get("is_default") === "eq.false") list = list.filter((c) => !c.is_default);
      if (q.get("is_default") === "eq.true") list = list.filter((c) => c.is_default);
      if (q.get("id")) list = list.filter((c) => `eq.${c.id}` === q.get("id"));
      return rows(list.map((c) => ({ ...c, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", profiles: pubOf(U.alice) })));
    }
    if (table === "collections" && method === "POST") {
      const created = { id: `c5000000-0000-4000-8000-0000000000${db.collections.length + 10}`, name: body.name, visibility: body.visibility, item_count: 0, follower_count: 0, is_default: false };
      db.collections.push(created);
      return json(201, { id: created.id, created_at: "2026-02-03T00:00:00Z", updated_at: "2026-02-03T00:00:00Z" });
    }
    if (table === "collection_items" && method === "GET") {
      if ((q.get("collection_id") ?? "").startsWith("in.(")) return rows([]); // kapak sorgusu
      const col = TARGETS.find((c) => q.has(c));
      const wantDefault = q.get("collections.is_default");
      const ids = col ? (q.get(col).startsWith("in.(") ? q.get(col).slice(4, -1).split(",") : [q.get(col).replace(/^eq\./, "")]) : null;
      let list = db.items.filter((i) => !col || ids.includes(i[col]));
      if (wantDefault) list = list.filter((i) => String(i.collection_id === SYS) === wantDefault.replace(/^eq\./, ""));
      if (!col && wantDefault === "eq.true") return rows([]); // /saved listesi: bu pakette içerik gövdesi yok
      return rows(list.map((i) => ({ ...i, collections: { owner_id: U.alice.id, is_default: i.collection_id === SYS } })));
    }
    if (table === "collection_items" && method === "POST") {
      const row = { ...body };
      const toAdd = [row];
      if (row.collection_id !== SYS && !db.items.some((i) => same(i, { ...row, collection_id: SYS }))) toAdd.unshift({ ...row, collection_id: SYS });
      if (db.items.some((i) => same(i, row))) return json(409, { code: "23505", message: "duplicate key value violates unique constraint", details: "", hint: "" });
      db.items.push(...toAdd);
      return json(201, null);
    }
    if (table === "collection_items" && method === "DELETE") {
      const col = TARGETS.find((c) => q.has(c));
      const collection = q.get("collection_id")?.replace(/^eq\./, "");
      db.items = db.items.filter((i) => !(i.collection_id === collection && i[col] === q.get(col).replace(/^eq\./, "")));
      return json(200, null);
    }
    if (table === "rpc/unsave_content") {
      const col = { prompt: "prompt_id", workflow: "workflow_id", preset: "preset_id", community_post: "community_post_id" }[body.p_type];
      db.items = db.items.filter((i) => i[col] !== body.p_id);
      return json(200, null);
    }
    if (table === "rpc/get_or_create_own_default_collection") return json(200, SYS);
    return null;
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/savefail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

/** Kaydet düğmesi: detay eylem satırında aria-pressed taşıyan, adı "Kaydet"/"Koleksiyona ekle" olan düğme. */
const saveBtn = (page, lang = "tr") => page.getByRole("button", { name: lang === "tr" ? /^(Kaydet|Koleksiyona ekle)/ : /^(Save|Add to collection)/ }).first();
const writes = (db, table) => db.calls.filter((c) => c.table === table && c.method !== "GET");
const sheet = (page) => page.getByRole("dialog");

await scenario("1. Boş yer imine bir dokunuş yalnız KAYDEDER (koleksiyona yazılmaz); 'Koleksiyona ekle' bildirimi çıkar", async ({ page, db }) => {
  withCollections(db);
  await page.goto(`${BASE}${PAGES.prompt}`);
  const btn = saveBtn(page);
  await btn.waitFor();
  assert.equal(await btn.getAttribute("aria-pressed"), "false");
  await btn.click();
  await page.locator("[data-save-toast]").getByText("Kaydedildi.").waitFor();
  assert.equal(await btn.getAttribute("aria-pressed"), "true", "yer imi doldu");
  const inserted = writes(db, "collection_items");
  assert.equal(inserted.length, 1, "tek yazma");
  assert.equal(inserted[0].body.collection_id, SYS, "yalnız Kaydedilenlerin tümü (sistem koleksiyonu)");
  assert.equal(inserted[0].body.prompt_id, ID.prompt);
  assert.deepEqual(db.items.map((i) => i.collection_id), [SYS], "hiçbir koleksiyona eklenmedi");
  assert.equal(await sheet(page).count(), 0, "pencere kendiliğinden açılmaz");
  await page.locator("[data-save-toast-action]").waitFor();
});

await scenario("2. Bildirimdeki 'Koleksiyona ekle': koleksiyonlar listelenir (sistem koleksiyonu / Genel yok), seçince yalnız o koleksiyona yazılır, kayıt sürer", async ({ page, db }) => {
  withCollections(db);
  await page.goto(`${BASE}${PAGES.prompt}`);
  await saveBtn(page).click();
  await page.locator("[data-save-toast-action]").click();
  const dlg = sheet(page);
  await dlg.getByRole("heading", { name: "Koleksiyona ekle" }).waitFor();
  const rowsText = await dlg.getByRole("checkbox").allInnerTexts();
  assert.deepEqual(rowsText.map((x) => x.replace(/\s+/g, " ").trim().split(" ")[0]), ["Film", "Dizi"], "yalnız kullanıcının koleksiyonları");
  for (const t of rowsText) assert.ok(!/Kaydedilenler|Varsayılan/.test(t), "sistem koleksiyonu satır değil");
  assert.equal(await dlg.getByRole("checkbox", { checked: true }).count(), 0, "hiçbiri seçili değil");
  await dlg.getByRole("checkbox", { name: /Film/ }).click();
  await dlg.getByRole("button", { name: "Kaydet", exact: true }).click();
  await dlg.waitFor({ state: "detached" });
  const adds = writes(db, "collection_items");
  assert.equal(adds.length, 2, "kayıt + Film");
  assert.equal(adds[1].body.collection_id, FILM);
  assert.deepEqual(db.items.map((i) => i.collection_id).sort(), [FILM, SYS].sort());
  assert.equal(await saveBtn(page).getAttribute("aria-pressed"), "true");
});

await scenario("3. Dolu yer imi pencereyi açar; koleksiyondan çıkarmak YALNIZ o koleksiyonu etkiler, içerik kayıtlı kalır", async ({ page, db }) => {
  withCollections(db, { saved: [{ prompt_id: ID.prompt }] });
  db.items.push({ collection_id: FILM, prompt_id: ID.prompt }, { collection_id: DIZI, prompt_id: ID.prompt });
  await page.goto(`${BASE}${PAGES.prompt}`);
  const btn = saveBtn(page);
  await page.waitForFunction(() => document.querySelector('[aria-pressed="true"]'));
  await btn.click();
  const dlg = sheet(page);
  await dlg.getByRole("heading", { name: "Koleksiyona ekle" }).waitFor();
  await dlg.getByRole("checkbox", { name: /Film/, checked: true }).waitFor();
  if (process.env.SHOT_DIR) { await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOT_DIR}/save-sheet-desktop.png` }); }
  await dlg.getByRole("checkbox", { name: /Film/ }).click();
  await dlg.getByRole("button", { name: "Kaydet", exact: true }).click();
  await dlg.waitFor({ state: "detached" });
  const dels = writes(db, "collection_items").filter((c) => c.method === "DELETE");
  assert.equal(dels.length, 1);
  assert.match(dels[0].query.collection_id, new RegExp(FILM));
  assert.deepEqual(db.items.map((i) => i.collection_id).sort(), [DIZI, SYS].sort(), "Dizi ve sistem koleksiyonu duruyor");
  assert.equal(await btn.getAttribute("aria-pressed"), "true", "hâlâ kayıtlı");
  assert.equal(await page.locator("[data-save-toast]").count(), 0, "kaldırıldı bildirimi yok");
});

await scenario("4. Tüm koleksiyonların işaretini kaldırmak kaydı SİLMEZ; yalnız 'Kaydedilenlerden kaldır' (iki dokunuş) her yerden çıkarır", async ({ page, db }) => {
  withCollections(db, { saved: [{ prompt_id: ID.prompt }] });
  db.items.push({ collection_id: FILM, prompt_id: ID.prompt });
  await page.goto(`${BASE}${PAGES.prompt}`);
  await page.waitForFunction(() => document.querySelector('[aria-pressed="true"]'));
  await saveBtn(page).click();
  const dlg = sheet(page);
  await dlg.getByRole("checkbox", { name: /Film/ }).click();
  await dlg.getByRole("button", { name: "Kaydet", exact: true }).click();
  await dlg.waitFor({ state: "detached" });
  assert.equal(await saveBtn(page).getAttribute("aria-pressed"), "true", "koleksiyonsuz ama kayıtlı");
  assert.deepEqual(db.items.map((i) => i.collection_id), [SYS]);

  await saveBtn(page).click();
  const unsave = dlg.locator("[data-unsave-button]");
  await unsave.waitFor();
  await unsave.click();
  assert.equal(writes(db, "rpc/unsave_content").length, 0, "ilk dokunuş yalnız onay ister");
  await unsave.click();
  await dlg.waitFor({ state: "detached" });
  const rpc = writes(db, "rpc/unsave_content");
  assert.equal(rpc.length, 1);
  assert.deepEqual(rpc[0].body, { p_type: "prompt", p_id: ID.prompt });
  assert.equal(db.items.length, 0, "kayıttan da koleksiyonlardan da çıktı");
  assert.equal(await saveBtn(page).getAttribute("aria-pressed"), "false");
  await page.locator("[data-save-toast]").getByText("Kaydedilenlerden kaldırıldı.").waitFor();
});

await scenario("5. Pencereden yeni koleksiyon oluşturulur, hemen seçili gelir, 'Kaydet' içeriği ona ekler", async ({ page, db }) => {
  withCollections(db, { saved: [{ prompt_id: ID.prompt }] });
  await page.goto(`${BASE}${PAGES.prompt}`);
  await page.waitForFunction(() => document.querySelector('[aria-pressed="true"]'));
  await saveBtn(page).click();
  const dlg = sheet(page);
  await dlg.getByRole("button", { name: "Yeni koleksiyon oluştur" }).click();
  await dlg.getByPlaceholder("Koleksiyon adını yaz...").fill("Pro");
  await dlg.getByRole("button", { name: "Oluştur" }).click();
  await dlg.getByRole("checkbox", { name: /Pro/, checked: true }).waitFor();
  await dlg.getByRole("button", { name: "Kaydet", exact: true }).click();
  await dlg.waitFor({ state: "detached" });
  const created = writes(db, "collections");
  assert.equal(created.length, 1);
  assert.equal(created[0].body.name, "Pro");
  const added = writes(db, "collection_items").at(-1);
  assert.equal(added.body.prompt_id, ID.prompt);
  assert.equal(added.body.collection_id, db.collections.find((c) => c.name === "Pro").id);
});

await scenario("6. Hazır ayar detayı: 'Kaydet' bir dokunuşla kaydeder, 'Kaydedildi' olur; tekrar dokununca koleksiyon penceresi açılır", async ({ page, db }) => {
  withCollections(db);
  await page.goto(`${BASE}${PAGES.preset}`);
  const cta = page.getByRole("button", { name: /^Kaydet$/ }).first();
  await cta.waitFor();
  await cta.click();
  await page.getByRole("button", { name: /^Kaydedildi$/ }).first().waitFor();
  const adds = writes(db, "collection_items");
  assert.equal(adds.length, 1);
  assert.deepEqual(adds[0].body, { collection_id: SYS, preset_id: ID.preset });
  await page.getByRole("button", { name: /^Kaydedildi$/ }).first().click();
  await sheet(page).getByRole("heading", { name: "Koleksiyona ekle" }).waitFor();
});

await scenario("7. İngilizce + 390px: bildirim eylemi, pencere başlığı ve 'Remove from saved' çevrilmiş; yatay taşma yok", async ({ page, db }) => {
  withCollections(db);
  await page.goto(`${BASE}${PAGES.prompt}`);
  await saveBtn(page, "en").click();
  await page.locator("[data-save-toast]").getByText("Saved.").waitFor();
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/save-toast-phone.png` });
  await page.locator("[data-save-toast-action]", { hasText: "Add to collection" }).click();
  const dlg = sheet(page);
  await dlg.getByRole("heading", { name: "Add to collection" }).waitFor();
  await dlg.locator("[data-unsave-button]", { hasText: "Remove from saved" }).waitFor();
  if (process.env.SHOT_DIR) { await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOT_DIR}/save-sheet-phone.png` }); }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no horizontal overflow");
}, { viewport: { width: 390, height: 844 }, lang: "en" });

console.log(results.map(([s, n]) => `${s === "PASS" ? "✓" : "✗"} ${n}`).join("\n"));
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`${passed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
