// Kişisel API anahtarları (docs/history/314-*): Ayarlar → Geliştirici anahtarları. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — anahtarın özet olarak saklanması,
// sınırlar, askı ve başkasının anahtarına erişilememesi SUNUCU kuralıdır (supabase/tests/api-tokens.sql). Burada yalnız istemci davranışı sınanır:
// liste/boş durum, oluşturma (RPC gövdesi), tek seferlik gösterim + kopyalama + DOM'dan silinme, iptal (iki adım), sınır, sunucu hata kodunun çevrilmiş mesajı,
// yükleme hatası + tekrar dene, iki dil, taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = 4205;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const TOKEN = "pmt_" + "Ab3dEf".repeat(7) + "Z"; // 43 karakter

const row = (over = {}) => ({
  id: "t-" + Math.random().toString(36).slice(2, 8), name: "Eski anahtar", prefix: "pmt_Zz9y", scopes: ["read"], kind: "user",
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(), expires_at: null, last_used_at: null, revoked_at: null, ...over,
});

/** Sunucu taklidi: üç RPC; çağrılar `calls`'a yazılır. */
function keysServer(initial = []) {
  const s = { rows: initial, calls: { list: 0, create: [], revoke: [] }, failList: false, failCreate: null };
  return {
    s,
    install(db) {
      db.rpc.list_my_api_tokens = () => {
        s.calls.list += 1;
        if (s.failList) return { status: 500, body: { message: "boom" } };
        return { body: [...s.rows].reverse() };
      };
      db.rpc.create_api_token = (body) => {
        s.calls.create.push(body);
        if (s.failCreate) { const message = s.failCreate; s.failCreate = null; return { status: 400, body: { message } }; }
        const r = row({ id: "new-" + s.calls.create.length, name: body.p_name, prefix: TOKEN.slice(0, 8), scopes: body.p_scopes, created_at: new Date().toISOString(),
          expires_at: body.p_expires_in_days ? new Date(Date.now() + body.p_expires_in_days * 86400000).toISOString() : null });
        s.rows.push(r);
        return { body: { id: r.id, token: TOKEN, prefix: r.prefix, name: r.name, scopes: r.scopes, expires_at: r.expires_at, created_at: r.created_at } };
      };
      db.rpc.revoke_api_token = (body) => {
        s.calls.revoke.push(body);
        const r = s.rows.find((x) => x.id === body.p_id);
        if (!r || r.revoked_at) return { body: false };
        r.revoked_at = new Date().toISOString();
        return { body: true };
      };
    },
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", initial = [], setup = () => {} } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const ks = keysServer(initial);
  ks.install(db);
  setup(ks.s);
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${PORT}` }).catch(() => {});
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + "/settings/");
    await page.locator("[data-api-keys]").waitFor();
    await fn({ page, s: ks.s });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/apikeys-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const section = (page) => page.locator("[data-api-keys]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };

await scenario("1 empty state: preview note, empty message, 0 / 10 counter", async ({ page }) => {
  await page.getByRole("heading", { name: "Geliştirici anahtarları" }).waitFor();
  await section(page).getByText(/uçlar henüz yayında değil/).waitFor();
  await section(page).getByText("Henüz anahtarın yok.").waitFor();
  await section(page).getByText("0 / 10 etkin anahtar").waitFor();
  assert.equal(await section(page).getByRole("button", { name: "Anahtar oluştur" }).isDisabled(), true, "disabled until a name is typed");
});

await scenario("2 create (defaults): RPC body, one-time reveal, copy, dismiss removes the key from the page", async ({ page, s }) => {
  await section(page).getByLabel("Ad").fill("  Dizüstü  ");
  await section(page).getByRole("button", { name: "Anahtar oluştur" }).click();
  const reveal = page.locator("[data-api-key-reveal]");
  await reveal.waitFor();
  assert.deepEqual(s.calls.create, [{ p_name: "Dizüstü", p_scopes: ["read"], p_expires_in_days: 90 }]);
  await reveal.getByText(TOKEN).waitFor();
  await reveal.getByRole("button", { name: /Kopyala: Anahtar/ }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), TOKEN);
  const listed = page.locator("[data-api-key-row]").first();
  await listed.getByText("Dizüstü").waitFor();
  await listed.getByText("Etkin").waitFor();
  await listed.getByText("Okuma", { exact: true }).waitFor();
  assert.equal(await listed.getByText("Yazma", { exact: true }).count(), 0);
  await listed.getByText(/pmt_Ab3d…/).waitFor();
  await shot(page, "api-keys-reveal");
  await reveal.getByRole("button", { name: "Anahtarı kaydettim" }).click();
  await reveal.waitFor({ state: "detached" });
  assert.ok(!(await page.locator("body").innerText()).includes(TOKEN), "the raw key is gone from the page after dismissal");
  assert.equal(await section(page).getByLabel("Ad").inputValue(), "", "the name field was cleared");
});

await scenario("3 create with write access and no expiry sends write scopes and null expiry; the no-expiry hint shows", async ({ page, s }) => {
  await section(page).getByLabel("Ad").fill("Bot");
  await section(page).getByLabel("Okuma + özel taslak yazma").check();
  await section(page).getByLabel("Geçerlilik").selectOption("never");
  await section(page).getByText(/Süresiz anahtar sızarsa/).waitFor();
  await section(page).getByRole("button", { name: "Anahtar oluştur" }).click();
  await page.locator("[data-api-key-reveal]").waitFor();
  assert.deepEqual(s.calls.create, [{ p_name: "Bot", p_scopes: ["read", "write"], p_expires_in_days: null }]);
  const listed = page.locator("[data-api-key-row]").first();
  await listed.getByText("Yazma", { exact: true }).waitFor();
  await listed.getByText(/Süresiz/).waitFor();
});

await scenario("4 revoke is two steps: confirm shown, 'Vazgeç' keeps it, confirm revokes (status + no more button)", async ({ page, s }) => {
  const item = page.locator("[data-api-key-row]").first();
  await item.getByRole("button", { name: "İptal et" }).click();
  await item.getByText(/hemen çalışmayı bırakır/).waitFor();
  await item.getByRole("button", { name: "Vazgeç" }).click();
  assert.equal(s.calls.revoke.length, 0, "nothing sent before confirming");
  await item.getByRole("button", { name: "İptal et" }).click();
  await item.getByRole("button", { name: "Evet, iptal et" }).click();
  await page.locator("[data-api-key-row][data-status='revoked']").waitFor();
  assert.equal(s.calls.revoke.length, 1);
  assert.equal(await page.locator("[data-api-key-row]").first().getByRole("button", { name: /İptal et/ }).count(), 0);
  await section(page).getByText("0 / 10 etkin anahtar").waitFor();
}, { initial: [row({ id: "k1", name: "Dizüstü" })] });

await scenario("5 expired and revoked keys show their status; only active ones count", async ({ page }) => {
  await page.locator("[data-api-key-row][data-status='expired']").waitFor();
  await page.locator("[data-api-key-row][data-status='revoked']").waitFor();
  await page.locator("[data-api-key-row][data-status='active']").waitFor();
  await section(page).getByText("1 / 10 etkin anahtar").waitFor();
}, { initial: [row({ name: "A" }), row({ name: "S", expires_at: new Date(Date.now() - 86400000).toISOString() }), row({ name: "R", revoked_at: new Date().toISOString() })] });

await scenario("6 ten active keys: the form is blocked with the limit message", async ({ page, s }) => {
  await section(page).getByText("10 / 10 etkin anahtar").waitFor();
  await section(page).getByText(/sınırına ulaştın/).waitFor();
  await section(page).getByLabel("Ad").fill("Fazla");
  assert.equal(await section(page).getByRole("button", { name: "Anahtar oluştur" }).isDisabled(), true);
  assert.equal(s.calls.create.length, 0);
}, { initial: Array.from({ length: 10 }, (_, i) => row({ name: "K" + i })) });

await scenario("7 a server limit error (race) shows the translated sentence inline", async ({ page, s }) => {
  s.failCreate = "token_limit";
  await section(page).getByLabel("Ad").fill("Yarış");
  await section(page).getByRole("button", { name: "Anahtar oluştur" }).click();
  await section(page).getByRole("alert").getByText(/sınırına \(10\) ulaştın/).waitFor();
  assert.equal(await page.locator("[data-api-key-reveal]").count(), 0, "no key is revealed on failure");
});

await scenario("8 a failed list shows an error and 'Tekrar dene' loads it", async ({ page, s }) => {
  await section(page).getByText("Anahtarlar yüklenemedi.").waitFor();
  s.failList = false;
  s.rows.push(row({ name: "Geldi" }));
  await section(page).getByRole("button", { name: "Tekrar dene" }).click();
  await section(page).getByText("Geldi").waitFor();
}, { setup: (s) => { s.failList = true; } });

await scenario("9 English labels and revoke", async ({ page, s }) => {
  await page.getByRole("heading", { name: "Developer keys" }).waitFor();
  await section(page).getByText("Never used").waitFor();
  await section(page).getByLabel("Name").fill("Laptop");
  await section(page).getByRole("button", { name: "Create key" }).click();
  await page.locator("[data-api-key-reveal]").getByText("Copy your key now").waitFor();
  const item = page.locator("[data-api-key-row]", { hasText: "Old" }).first();
  await item.getByRole("button", { name: "Revoke" }).click();
  await item.getByRole("button", { name: "Yes, revoke" }).waitFor();
  assert.equal(s.calls.create[0].p_name, "Laptop");
}, { lang: "en", initial: [row({ name: "Old" })] });

await scenario("10 phone: nothing overflows sideways (form, reveal and a long name)", async ({ page }) => {
  await section(page).getByLabel("Ad").fill("x".repeat(60));
  await section(page).getByRole("button", { name: "Anahtar oluştur" }).click();
  await page.locator("[data-api-key-reveal]").waitFor();
  assert.ok(await overflowFree(page));
  await shot(page, "api-keys-phone");
}, { viewport: { width: 390, height: 844 }, initial: [row({ name: "y".repeat(60) })] });

await scenario("11 the Developer group is in the settings side menu", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Ayar bölümleri" }).first();
  await nav.getByText("Geliştirici", { exact: true }).waitFor();
});

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
