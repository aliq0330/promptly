// Telegram botu (docs/history/323-*): Ayarlar → Geliştirici → Telegram. Ağ taklitli; gerçek Telegram'a/Supabase'e KARŞI DENENMEDİ — kodun özet olarak saklanması, tek kullanımlık olması,
// süre, bağlantı sınırı, başkasının bağlantısına erişilememesi SUNUCU kuralıdır (supabase/tests/telegram-bot.sql). Burada yalnız istemci davranışı sınanır:
// boş durum + kod üretme (RPC gövdesi, yazma anahtarı), kodun biçimi + derin bağlantı + komut, bağlantı kurulunca kodun kaybolması, bildirim anahtarları,
// iki adımlı kaldırma, 3 bağlantı sınırı, sunucu hata kodunun çevrilmiş mesajı, iki dil, taşma.
// DERLEME `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=PromptlyTestBot` ile yapılmış olmalıdır (CI ui işi bunu verir).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = 4209;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const CODE = "ABCD2345";

const link = (over = {}) => ({
  id: "l-" + Math.random().toString(36).slice(2, 8), telegram_username: "ali_tg", telegram_name: "Ali Tg", scopes: ["read"], notify_weekly: false, notify_activity: false,
  created_at: new Date(Date.now() - 2 * 86400000).toISOString(), last_used_at: null, ...over,
});

/** Sunucu taklidi: dört RPC; çağrılar `calls`'a yazılır. */
function telegramServer(initial = []) {
  const s = { rows: initial, calls: { list: 0, code: [], revoke: [], notify: [] }, failCode: null };
  return {
    s,
    install(db) {
      db.rpc.list_my_telegram_links = () => { s.calls.list += 1; return { body: [...s.rows] }; };
      db.rpc.telegram_link_code_create = (body) => {
        s.calls.code.push(body);
        if (s.failCode) { const message = s.failCode; s.failCode = null; return { status: 400, body: { message } }; }
        return { body: { code: CODE, expires_at: new Date(Date.now() + 10 * 60000).toISOString(), write: body.p_write === true } };
      };
      db.rpc.revoke_my_telegram_link = (body) => {
        s.calls.revoke.push(body);
        const before = s.rows.length;
        s.rows = s.rows.filter((row) => row.id !== body.p_id);
        return { body: s.rows.length < before };
      };
      db.rpc.set_my_telegram_notify = (body) => {
        s.calls.notify.push(body);
        const row = s.rows.find((x) => x.id === body.p_id);
        if (!row) return { body: false };
        if (body.p_weekly !== null) row.notify_weekly = body.p_weekly;
        if (body.p_activity !== null) row.notify_activity = body.p_activity;
        return { body: true };
      };
    },
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", initial = [] } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const ts = telegramServer(initial);
  ts.install(db);
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${PORT}` }).catch(() => {});
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-02"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + "/settings/developer/");
    await page.locator("[data-telegram]").waitFor();
    await fn({ page, s: ts.s });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/telegram-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const section = (page) => page.locator("[data-telegram]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1 empty state: empty message, link box with the write switch OFF by default", async ({ page }) => {
  await section(page).getByText("Henüz bağlı bir Telegram hesabı yok.").waitFor();
  await section(page).getByRole("heading", { name: "Telegram botu" }).waitFor();
  assert.equal(await section(page).getByRole("switch", { name: /Özel taslak eklemesine/ }).getAttribute("aria-checked"), "false");
  await section(page).getByRole("button", { name: "Bağlama kodu oluştur" }).waitFor();
});

await scenario("2 create a code (read only): RPC body, formatted code, deep link, command to type, privacy note", async ({ page, s }) => {
  await section(page).getByRole("button", { name: "Bağlama kodu oluştur" }).click();
  await section(page).locator("[data-telegram-code]").waitFor();
  assert.deepEqual(s.calls.code, [{ p_write: false }]);
  assert.equal((await section(page).locator("[data-telegram-code]").innerText()).trim(), "ABCD-2345");
  const open = section(page).getByRole("link", { name: "Telegram'da aç" });
  assert.equal(await open.getAttribute("href"), `https://t.me/PromptlyTestBot?start=link_${CODE}`);
  assert.equal(await open.getAttribute("rel"), "noopener noreferrer");
  await section(page).getByText(`/baglan ${CODE}`).waitFor();
  await section(page).getByText("@PromptlyTestBot botunu aç").waitFor();
  await section(page).getByText("10 dakika geçerli").waitFor();
  await section(page).getByRole("link", { name: "Gizlilik Politikası" }).waitFor();
});

await scenario("3 the write switch is sent as p_write=true; the code can be copied", async ({ page, s }) => {
  await section(page).getByRole("switch", { name: /Özel taslak eklemesine/ }).click();
  await section(page).getByRole("button", { name: "Bağlama kodu oluştur" }).click();
  await section(page).locator("[data-telegram-code]").waitFor();
  assert.deepEqual(s.calls.code, [{ p_write: true }]);
  await section(page).getByRole("button", { name: "Kodu kopyala" }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), CODE, "the plain code (no dash) is copied");
});

await scenario("4 once the link is made the code disappears and the linked chat is listed", async ({ page, s }) => {
  await section(page).getByRole("button", { name: "Bağlama kodu oluştur" }).click();
  await section(page).locator("[data-telegram-code]").waitFor();
  s.rows.push(link({ id: "new", telegram_username: "yeni_tg" }));
  await section(page).getByText("Telegram bağlandı.").waitFor({ timeout: 9000 });
  assert.equal(await section(page).locator("[data-telegram-code]").count(), 0, "the code is gone after use");
  await section(page).getByText("@yeni_tg").waitFor();
});

await scenario("5 a linked chat shows scope chips, usage and both notification switches (OFF by default); each switch sends only its own flag", async ({ page, s }) => {
  const row = section(page).locator("[data-telegram-link]").first();
  await row.getByText("@ali_tg").waitFor();
  await row.getByText("Bağlı", { exact: true }).waitFor();
  await row.getByText("Okuma", { exact: true }).waitFor();
  assert.equal(await row.getByText("Taslak ekleme ve düzenleme").count(), 0);
  const weekly = row.getByRole("switch", { name: "Haftalık özet" });
  const activity = row.getByRole("switch", { name: "Etkinlik bildirimleri" });
  assert.equal(await weekly.getAttribute("aria-checked"), "false");
  assert.equal(await activity.getAttribute("aria-checked"), "false");
  await weekly.click();
  await row.getByRole("switch", { name: "Haftalık özet" }).and(page.locator("[aria-checked=true]")).waitFor();
  assert.deepEqual(s.calls.notify, [{ p_id: s.rows[0].id, p_weekly: true, p_activity: null }]);
  await row.getByRole("switch", { name: "Etkinlik bildirimleri" }).click();
  await row.getByRole("switch", { name: "Etkinlik bildirimleri" }).and(page.locator("[aria-checked=true]")).waitFor();
  assert.deepEqual(s.calls.notify[1], { p_id: s.rows[0].id, p_weekly: null, p_activity: true });
}, { initial: [link({ id: "l1" })] });

await scenario("6 a write link is labelled; removing needs a second confirmation and then the row is gone", async ({ page, s }) => {
  const row = section(page).locator("[data-telegram-link]").first();
  await row.getByText("Taslak ekleme ve düzenleme").waitFor();
  await row.getByRole("button", { name: "Bağlantıyı kaldır" }).click();
  await row.getByText(/hemen kapanır/).waitFor();
  assert.deepEqual(s.calls.revoke, [], "nothing is revoked before the second step");
  await row.getByRole("button", { name: "Vazgeç" }).click();
  assert.deepEqual(s.calls.revoke, []);
  await row.getByRole("button", { name: "Bağlantıyı kaldır" }).click();
  await row.getByRole("button", { name: "Evet, kaldır" }).click();
  await section(page).getByText("Henüz bağlı bir Telegram hesabı yok.").waitFor();
  assert.deepEqual(s.calls.revoke, [{ p_id: "l2" }]);
}, { initial: [link({ id: "l2", scopes: ["read", "write"] })] });

await scenario("7 three links is the limit: the connect box says so and offers no code button", async ({ page }) => {
  await section(page).getByText(/En çok 3 Telegram hesabı/).waitFor();
  assert.equal(await section(page).getByRole("button", { name: "Bağlama kodu oluştur" }).count(), 0);
}, { initial: [link({ id: "a" }), link({ id: "b", telegram_username: "b_tg" }), link({ id: "c", telegram_username: "c_tg" })] });

await scenario("8 a server error code is shown as a translated sentence, and a retry works", async ({ page, s }) => {
  s.failCode = "link_limit";
  await section(page).getByRole("button", { name: "Bağlama kodu oluştur" }).click();
  await section(page).getByRole("alert").getByText(/en çok 3 Telegram bağlantısı/).waitFor();
  assert.equal(await section(page).locator("[data-telegram-code]").count(), 0);
  await section(page).getByRole("button", { name: "Bağlama kodu oluştur" }).click();
  await section(page).locator("[data-telegram-code]").waitFor();
});

await scenario("9 English labels", async ({ page }) => {
  await section(page).getByRole("heading", { name: "Telegram bot" }).waitFor();
  await section(page).getByText("No Telegram account is linked yet.").waitFor();
  await section(page).getByRole("button", { name: "Create a link code" }).click();
  await section(page).getByText("Valid for 10 minutes").waitFor();
  await section(page).getByText("Open the @PromptlyTestBot bot in Telegram").waitFor();
}, { lang: "en" });

await scenario("10 phone width: no horizontal overflow with a code shown and a long Telegram name", async ({ page }) => {
  await section(page).getByRole("button", { name: "Bağlama kodu oluştur" }).click();
  await section(page).locator("[data-telegram-code]").waitFor();
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 375, height: 800 }, initial: [link({ id: "x", telegram_username: null, telegram_name: "Çok uzun bir Telegram görünen adı ".repeat(4) })] });

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
