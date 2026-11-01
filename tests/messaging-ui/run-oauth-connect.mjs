// Promptly'nin KENDİ OAuth sunucusunun onay sayfası ve Ayarlar → Bağlı uygulamalar (docs/history/317-*). Ağ taklitli; gerçek Supabase'e / claude.ai / ChatGPT'ye KARŞI DENENMEDİ.
// Kod/belirteç üretimi ve PKCE veritabanında + Edge Function'dadır (SQL testi, birim testleri, canlı uçtan uca deneme ayrıca). Burada yalnız istemci davranışı sınanır:
// bilgi gösterimi, yazma izni varsayılan KAPALI, onay/ret RPC gövdeleri, güvenli yönlendirme, hata durumları, misafirin girişe yönlenmesi, izin listesi/iptal, iki dil, taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = 4207;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const REQ = "R".repeat(43);
const BACK = "https://claude.ai/api/mcp/auth_callback";

const info = (over = {}) => ({ client_name: "Claude", client_uri: "https://claude.ai", redirect_host: "claude.ai", redirect_uri: BACK, resource: null, expires_at: new Date(Date.now() + 600000).toISOString(), ...over });

function oauthRpc(opts = {}) {
  const s = { calls: { info: [], decide: [], list: 0, revoke: [] }, grants: opts.grants ?? [], info: opts.info === undefined ? info() : opts.info, decided: opts.decided ?? { redirect_uri: BACK, params: { code: "CODE123", state: "ST" } } };
  s.rpc = {
    oauth_request_info: (body) => { s.calls.info.push(body); return { body: s.info }; },
    oauth_decide: (body) => { s.calls.decide.push(body); return opts.decideError ? { status: 400, body: { message: opts.decideError } } : { body: s.decided }; },
    list_my_oauth_grants: () => { s.calls.list += 1; return { body: s.grants }; },
    revoke_my_oauth_grant: (body) => { s.calls.revoke.push(body); const before = s.grants.length; s.grants = s.grants.filter((g) => g.id !== body.p_id); return { body: s.grants.length < before }; },
  };
  return s;
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, oauth = {}, path = `/oauth/connect/?request=${REQ}` } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const srv = oauthRpc(oauth);
  Object.assign(db.rpc, srv.rpc);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await context.route("https://claude.ai/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>claude</title>returned" }));
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(BASE + path);
    await fn({ page, srv });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/oauth-connect-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const connect = (page) => page.locator("[data-oauth-connect]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1 the screen shows the app, where it returns to, the trust warning, exactly what it can and cannot do; write is OFF; nothing is decided yet", async ({ page, srv }) => {
  await page.getByRole("heading", { name: "Claude Promptly hesabına bağlanmak istiyor" }).waitFor();
  await connect(page).getByText("claude.ai", { exact: true }).first().waitFor();
  await page.getByText("Yalnızca güvendiğin uygulamalara izin ver").waitFor();
  await page.getByText(/Promptly bunları doğrulamaz/).waitFor();
  await page.getByText(/Kendi promptlarını \(özel taslaklar dahil\) ve kaydettiklerini okuyabilir/).waitFor();
  await page.getByText(/Yayınlayamaz, düzenleyemez, silemez/).waitFor();
  const write = page.getByLabel("Hesabıma özel taslak eklemesine de izin ver");
  assert.equal(await write.isChecked(), false, "write permission is off by default");
  assert.deepEqual(srv.calls.info, [{ p_request: REQ }]);
  assert.equal(srv.calls.decide.length, 0, "nothing is decided before the user clicks");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/oauth-connect.png`, fullPage: true });
});

await scenario("2 Allow (default) sends approve with write=false and leaves for the app's registered address with code + state", async ({ page, srv }) => {
  await page.getByRole("button", { name: "İzin ver" }).click();
  await page.waitForURL(/claude\.ai\/api\/mcp\/auth_callback\?code=CODE123&state=ST/);
  assert.deepEqual(srv.calls.decide, [{ p_request: REQ, p_approve: true, p_write: false }]);
});

await scenario("3 ticking the draft permission sends write=true", async ({ page, srv }) => {
  await page.getByLabel("Hesabıma özel taslak eklemesine de izin ver").check();
  await page.getByRole("button", { name: "İzin ver" }).click();
  await page.waitForURL(/auth_callback\?code=/);
  assert.deepEqual(srv.calls.decide, [{ p_request: REQ, p_approve: true, p_write: true }]);
});

await scenario("4 Deny sends approve=false (even with the box ticked) and returns the error to the app", async ({ page, srv }) => {
  await page.getByLabel("Hesabıma özel taslak eklemesine de izin ver").check();
  srv.decided = { redirect_uri: BACK, params: { error: "access_denied", state: "ST" } };
  await page.getByRole("button", { name: "Reddet" }).click();
  await page.waitForURL(/error=access_denied&state=ST/);
  assert.deepEqual(srv.calls.decide, [{ p_request: REQ, p_approve: false, p_write: false }]);
});

await scenario("5 a malformed request id shows the error screen and calls nothing", async ({ page, srv }) => {
  await page.getByRole("heading", { name: "İzin isteği açılamadı" }).waitFor();
  assert.equal(srv.calls.info.length, 0);
}, { path: "/oauth/connect/?request=short" });

await scenario("6 an unknown/expired request (server returns null) shows the error screen", async ({ page }) => {
  await page.getByRole("heading", { name: "İzin isteği açılamadı" }).waitFor();
  await page.getByRole("alert").getByText(/geçersiz ya da süresi dolmuş/).waitFor();
}, { oauth: { info: null } });

await scenario("7 a decision error (e.g. request already used) shows the error screen and does not leave", async ({ page }) => {
  await page.getByRole("button", { name: "İzin ver" }).click();
  await page.getByRole("heading", { name: "İzin isteği açılamadı" }).waitFor();
  assert.ok(page.url().startsWith(BASE), "still on Promptly");
}, { oauth: { decideError: "request_not_found" } });

await scenario("8 a non-https return address from the server is never followed", async ({ page }) => {
  await page.getByRole("button", { name: "İzin ver" }).click();
  await page.getByRole("heading", { name: "İzin isteği açılamadı" }).waitFor();
  assert.ok(page.url().startsWith(BASE), "still on Promptly");
}, { oauth: { decided: { redirect_uri: "http://evil.test/cb", params: { code: "X" } } } });

await scenario("9 a signed-out visitor is sent to login and the request survives in ?next=", async ({ page }) => {
  await page.waitForURL(/\/login/);
  assert.match(decodeURIComponent(page.url()), new RegExp(`next=.*oauth/connect.*request=${REQ}`));
}, { guest: true });

await scenario("10 English labels", async ({ page }) => {
  await page.getByRole("heading", { name: "Claude wants to connect to your Promptly account" }).waitFor();
  await page.getByText("Only allow apps you trust").waitFor();
  await page.getByText("Also let it add private drafts to my account").waitFor();
  await page.getByRole("button", { name: "Allow" }).waitFor();
  await page.getByRole("button", { name: "Deny" }).waitFor();
}, { lang: "en" });

await scenario("11 phone: nothing overflows sideways (long name + host)", async ({ page }) => {
  await page.getByRole("button", { name: "İzin ver" }).waitFor();
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 844 }, oauth: { info: info({ client_name: "A".repeat(80), client_uri: "https://" + "very-long-subdomain.".repeat(5) + "example.com" }) } });

await scenario("12 the app name is shown as text, never as markup", async ({ page }) => {
  await page.getByRole("heading", { name: /<img src=x onerror=alert\(1\)>/ }).waitFor();
  assert.equal(await page.locator("img[src='x']").count(), 0);
}, { oauth: { info: info({ client_name: "<img src=x onerror=alert(1)>" }) } });

const GRANT = (id, name, over = {}) => ({ id, client_name: name, redirect_host: "claude.ai", scopes: ["read"], created_at: new Date(Date.now() - 86400000).toISOString(), last_used_at: null, ...over });

await scenario("13 Settings lists connected apps with scopes and last use; revoking is two steps and refreshes the list", async ({ page, srv }) => {
  const apps = page.locator("[data-connected-apps]");
  await apps.getByRole("heading", { name: "Bağlı uygulamalar" }).waitFor();
  const first = apps.locator("[data-connected-app='own:g1']");
  await first.getByText("Claude", { exact: true }).waitFor();
  await first.getByText("Okuma", { exact: true }).waitFor();
  await first.getByText("Henüz kullanılmadı").waitFor();
  const second = apps.locator("[data-connected-app='own:g2']");
  await second.getByText("Taslak ekleme", { exact: true }).waitFor();
  await second.getByText(/Son kullanım/).waitFor();
  await first.getByRole("button", { name: "İzni geri al" }).click();
  await first.getByRole("button", { name: "Vazgeç" }).click();
  assert.equal(srv.calls.revoke.length, 0, "nothing is sent before confirming");
  await first.getByRole("button", { name: "İzni geri al" }).click();
  await first.getByRole("button", { name: "Evet, geri al" }).click();
  await first.waitFor({ state: "detached" });
  assert.deepEqual(srv.calls.revoke, [{ p_id: "g1" }]);
  await second.waitFor();
}, { path: "/settings/", oauth: { grants: [GRANT("g1", "Claude"), GRANT("g2", "Cursor", { scopes: ["read", "write"], last_used_at: new Date().toISOString() })] } });

await scenario("14 with no connected apps the section says so", async ({ page }) => {
  const apps = page.locator("[data-connected-apps]");
  await apps.getByText("Bağlı uygulama yok.").waitFor();
}, { path: "/settings/" });

await scenario("15 the /developers page explains the key-less connection (English too)", async ({ page }) => {
  await page.locator("[data-developers-oauth]").waitFor();
  await page.getByText("Connect in claude.ai and ChatGPT (no key)").waitFor();
  await page.getByText(/Do NOT paste a key into claude\.ai or ChatGPT/).waitFor();
}, { path: "/developers/", lang: "en" });

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
