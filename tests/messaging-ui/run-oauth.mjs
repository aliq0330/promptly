// OAuth (docs/history/316-*): onay ekranı `/oauth/consent` ve Ayarlar → Bağlı uygulamalar. Ağ taklitli; gerçek Supabase OAuth sunucusuna / claude.ai / ChatGPT'ye KARŞI DENENMEDİ —
// kimlik doğrulama, kod/belirteç üretimi ve izin kaydı Supabase'in işidir. Burada yalnız istemci davranışı sınanır: doğrulama, gösterilen bilgi, onayla/reddet isteği,
// güvenli yönlendirme, hata durumları, misafirin girişe yönlenmesi, izinleri listeleme/geri alma, iki dil, taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";

const PORT = 4206;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const AUTH_ID = "authz_Abc123_xyz-789";
const BACK = "https://claude.ai/api/mcp/auth_callback";

const details = (over = {}) => ({
  authorization_id: AUTH_ID, redirect_uri: BACK, scope: "openid profile",
  client: { id: "c-1", name: "Claude", uri: "https://claude.ai", logo_uri: "https://claude.ai/logo.png" },
  user: { id: "u", email: "alice@test.dev" }, ...over,
});

/** OAuth sunucusu taklidi; çağrılar `calls`'a yazılır. */
function oauthServer(opts = {}) {
  const s = { calls: [], grants: opts.grants ?? [], details: opts.details ?? details(), consentRedirect: opts.consentRedirect ?? `${BACK}?code=CODE123&state=ST`, getStatus: opts.getStatus ?? 200, grantsStatus: opts.grantsStatus ?? 200 };
  s.handler = (method, path, body, query) => {
    s.calls.push({ method, path, body, query });
    if (path.endsWith("/consent")) return { body: { redirect_url: s.consentRedirect } };
    if (path.startsWith("/auth/v1/oauth/authorizations/")) return s.getStatus === 200 ? { body: s.details } : { status: s.getStatus, body: { message: "not found" } };
    if (path === "/auth/v1/user/oauth/grants" && method === "GET") return s.grantsStatus === 200 ? { body: s.grants } : { status: s.grantsStatus, body: { message: "oauth server disabled" } };
    if (path === "/auth/v1/user/oauth/grants" && method === "DELETE") { s.grants = s.grants.filter((g) => g.client.id !== query.client_id); return { status: 204, body: null }; }
    return { status: 404, body: null };
  };
  return s;
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, oauth = {}, path = `/oauth/consent/?authorization_id=${AUTH_ID}` } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const srv = oauthServer(oauth);
  db.oauth = srv.handler;
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  // Uygulamaya dönüş adresi: gerçek site yerine basit bir sayfa (dış ağ yok).
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/oauth-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const consent = (page) => page.locator("[data-oauth-consent]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1 the consent screen shows the app, both hosts, the trust warning, the honest scope note and the requested scopes", async ({ page, srv }) => {
  await page.getByRole("heading", { name: "Claude Promptly hesabına bağlanmak istiyor" }).waitFor();
  await consent(page).getByText("claude.ai", { exact: true }).first().waitFor();
  await page.getByText("Yalnızca güvendiğin uygulamalara izin ver").waitFor();
  await page.getByText(/Promptly bunları doğrulamaz/).waitFor();
  await page.getByText(/belirteç hesabın adına çalıştığı için/).waitFor();
  await page.getByText("openid", { exact: true }).waitFor();
  await page.getByText("profile", { exact: true }).waitFor();
  assert.equal(srv.calls.filter((c) => c.method === "POST").length, 0, "nothing is decided before the user clicks");
  assert.equal(await page.locator("img").evaluateAll((imgs) => imgs.filter((i) => /claude\.ai\/logo/.test(i.src)).length), 0, "the client-supplied logo is never loaded");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/oauth-consent.png`, fullPage: true });
});

await scenario("2 Allow sends action=approve and leaves for the app's redirect address", async ({ page, srv }) => {
  await page.getByRole("button", { name: "İzin ver" }).click();
  await page.waitForURL(/claude\.ai\/api\/mcp\/auth_callback\?code=CODE123&state=ST/);
  const post = srv.calls.find((c) => c.method === "POST");
  assert.deepEqual(post.body, { action: "approve" });
  assert.ok(post.path.includes(AUTH_ID));
});

await scenario("3 Deny sends action=deny and still returns to the app", async ({ page, srv }) => {
  srv.consentRedirect = `${BACK}?error=access_denied&state=ST`;
  await page.getByRole("button", { name: "Reddet" }).click();
  await page.waitForURL(/error=access_denied/);
  assert.deepEqual(srv.calls.find((c) => c.method === "POST").body, { action: "deny" });
});

await scenario("4 an already-consented request goes straight back without showing the screen", async ({ page }) => {
  await page.waitForURL(/claude\.ai\/api\/mcp\/auth_callback\?code=ALREADY/);
}, { oauth: { details: { redirect_url: `${BACK}?code=ALREADY&state=ST` } } });

await scenario("5 a missing or malformed authorization_id shows the error screen and calls nothing", async ({ page, srv }) => {
  await page.getByRole("heading", { name: "İzin isteği açılamadı" }).waitFor();
  assert.equal(srv.calls.length, 0);
}, { path: "/oauth/consent/?authorization_id=bad%20id" });

await scenario("6 an unknown/expired request (server 404) shows the error screen", async ({ page }) => {
  await page.getByRole("heading", { name: "İzin isteği açılamadı" }).waitFor();
  await page.getByRole("alert").getByText(/geçersiz ya da süresi dolmuş/).waitFor();
}, { oauth: { getStatus: 404 } });

await scenario("7 a server-supplied non-https redirect is never followed", async ({ page }) => {
  await page.getByRole("button", { name: "İzin ver" }).click();
  await page.getByRole("heading", { name: "İzin isteği açılamadı" }).waitFor();
  assert.ok(page.url().startsWith(BASE), "still on Promptly");
}, { oauth: { consentRedirect: "javascript:alert(1)" } });

await scenario("8 a signed-out visitor is sent to login and the request id survives in ?next=", async ({ page }) => {
  await page.waitForURL(/\/login/);
  assert.match(decodeURIComponent(page.url()), /next=.*oauth\/consent.*authorization_id=authz_Abc123_xyz-789/);
}, { guest: true });

await scenario("9 English labels", async ({ page }) => {
  await page.getByRole("heading", { name: "Claude wants to connect to your Promptly account" }).waitFor();
  await page.getByText("Only allow apps you trust").waitFor();
  await page.getByRole("button", { name: "Allow" }).waitFor();
  await page.getByRole("button", { name: "Deny" }).waitFor();
}, { lang: "en" });

await scenario("10 phone: nothing overflows sideways (long client name + host)", async ({ page }) => {
  await page.getByRole("button", { name: "İzin ver" }).waitFor();
  assert.ok(await overflowFree(page));
}, { viewport: { width: 390, height: 844 }, oauth: { details: details({ client: { id: "c-1", name: "A".repeat(80), uri: "https://" + "very-long-subdomain.".repeat(5) + "example.com", logo_uri: "" } }) } });

const GRANT = (id, name) => ({ client: { id, name, uri: "https://claude.ai", logo_uri: "" }, scopes: ["openid", "profile"], granted_at: new Date(Date.now() - 86400000).toISOString() });

await scenario("11 Settings lists connected apps and revoking is two steps (DELETE with the client id, then the list refreshes)", async ({ page, srv }) => {
  const apps = page.locator("[data-connected-apps]");
  await apps.getByRole("heading", { name: "Bağlı uygulamalar" }).waitFor();
  const row = apps.locator("[data-connected-app='legacy:c-1']");
  await row.getByText("Claude", { exact: true }).waitFor();
  await row.getByRole("button", { name: "İzni geri al" }).click();
  await row.getByText(/oturumları hemen kapanır/).waitFor();
  await row.getByRole("button", { name: "Vazgeç" }).click();
  assert.equal(srv.calls.filter((c) => c.method === "DELETE").length, 0, "nothing is sent before confirming");
  await row.getByRole("button", { name: "İzni geri al" }).click();
  await row.getByRole("button", { name: "Evet, geri al" }).click();
  await apps.getByText("Bağlı uygulama yok.").waitFor();
  assert.deepEqual(srv.calls.find((c) => c.method === "DELETE").query, { client_id: "c-1" });
}, { path: "/settings/", oauth: { grants: [GRANT("c-1", "Claude")] } });

await scenario("12 when Supabase's OAuth server is off, the section still exists (our own grants) and just lists nothing", async ({ page }) => {
  await page.getByRole("heading", { name: "Geliştirici anahtarları" }).waitFor();
  const apps = page.locator("[data-connected-apps]");
  await apps.getByText("Bağlı uygulama yok.").waitFor();
  assert.equal(await apps.locator("[data-connected-app]").count(), 0);
}, { path: "/settings/", oauth: { grantsStatus: 404 } });

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
