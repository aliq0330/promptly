// Oturum dayanıklılığı (docs/history/320-*): Safari'de görülen "kendiliğinden çıkış / içerik gelmiyor / yenileyince girmiyor" hatasının tarayıcıdaki taklidi.
// Canlıdaki nedeni: `localStorage` yazması başarısız olunca yenilenen oturum kaydedilemiyor, kütüphane AYNI eski yenileme belirtecini saniyede birkaç kez gönderiyor,
// Supabase hız sınırına (429) takılıyor ve oturum siliniyor. Burada: (1) depolama yazması hata verirken yenileme fırtınası OLMAZ, kullanıcı girişli kalır, yenilenen
// oturum sayfa yenilemesinden sonra da korunur ve kullanıcıya bir kez bilgi verilir; (2) yenilemede 429 oturumu SİLMEZ ve ağa art arda istek gitmez. Ağ taklitli;
// gerçek Safari'ye / Supabase'e KARŞI DENENMEDİ (taklit Chromium'dur).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME } from "./mock.mjs";

const PORT = 4210;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const KEY = "sb-example-auth-token";

const user = { id: ME, aud: "authenticated", role: "authenticated", email: "alice@test.dev", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const sessionBody = (refresh, expiresInSeconds) => ({ access_token: "x.y.z", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds, refresh_token: refresh, user });

/** Yenileme ucu taklidi: `handler(refreshToken, state)` → { status, body }. Her istek `state.requests`'e yazılır (belirteç ham halde değil, yalnız sıra). */
async function scenario(name, fn, { expiresIn = 20, tokenHandler, quota = false, viewport = { width: 390, height: 844 } } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  const state = { requests: [], childUsed: false };
  await context.route("https://example.supabase.co/auth/v1/token**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.searchParams.get("grant_type") !== "refresh_token") return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "unsupported" }) });
    const token = JSON.parse(req.postData() || "{}").refresh_token;
    state.requests.push(token);
    const result = tokenHandler ? tokenHandler(token, state) : { status: 200, body: sessionBody(token === "r" ? "r2" : "r3", 3600) };
    await route.fulfill({ status: result.status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*" }, body: JSON.stringify(result.body) });
  });
  // Kısa ömürlü oturumu tohumla; ARDINDAN (istenirse) `sb-` anahtarlarına yazmayı kota hatasıyla reddet — Safari'de dolu depolama gibi.
  await context.addInitScript(([key, body, blockWrites]) => {
    try { localStorage.setItem(key, JSON.stringify(body)); localStorage.setItem("promptly-language", "tr"); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); } catch {}
    if (!blockWrites) return;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (this === window.localStorage && String(k).startsWith("sb-")) { const e = new Error("The quota has been exceeded."); e.name = "QuotaExceededError"; throw e; }
      return original.call(this, k, v);
    };
  }, [KEY, { ...sessionBody("r", expiresIn), user }, quota]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/auth-storage-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const signedIn = (page) => page.getByRole("button", { name: "Hesap menüsü" }).waitFor();
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);

await scenario("1 healthy browser: an expiring session is refreshed ONCE and the new session is saved normally (no storage warning)", async ({ page, state }) => {
  await page.goto(BASE + "/");
  await signedIn(page);
  await page.waitForTimeout(2500);
  assert.equal(state.requests.length, 1, `exactly one refresh (got ${state.requests.length})`);
  assert.equal(JSON.parse(await stored(page)).refresh_token, "r2", "the rotated session is in localStorage");
  assert.equal(await page.getByRole("status").filter({ hasText: "oturumunu kaydedemiyor" }).count(), 0);
});

await scenario("2 storage writes FAIL (Safari quota): no refresh storm, still signed in, one warning, and the rotated session survives a reload", async ({ page, state }) => {
  await page.goto(BASE + "/");
  await signedIn(page);
  await page.waitForTimeout(3000);
  assert.ok(state.requests.length <= 2, `refresh requests stay tiny (got ${state.requests.length}) — the old code re-sent the stale token on every API call`);
  await page.getByRole("status").filter({ hasText: "Tarayıcı oturumunu kaydedemiyor" }).waitFor();
  const before = state.requests.length;
  await page.reload();
  await signedIn(page);
  await page.waitForTimeout(2000);
  assert.equal(state.requests.length, before, "after the reload the saved (sessionStorage) session is fresh, so nothing is refreshed again");
  assert.equal(state.requests.every((t) => t === "r"), true, "only the original token was ever sent (the child was kept, not lost)");
}, { quota: true });

await scenario("3 the server rate-limits the refresh (429): the session is NOT deleted and the network is not hammered", async ({ page, state }) => {
  await page.goto(BASE + "/");
  await page.waitForTimeout(3500);
  assert.ok(state.requests.length <= 2, `429 is answered once, retries come from the cache (got ${state.requests.length})`);
  const raw = await stored(page);
  assert.ok(raw, "the stored session survives a rate limit");
  assert.equal(JSON.parse(raw).refresh_token, "r");
}, { expiresIn: -30, tokenHandler: () => ({ status: 429, body: { code: "over_request_rate_limit", message: "Request rate limit reached" } }) });

await scenario("4 a really invalid refresh token (400 not found) still signs out — the guard does not hide genuine logouts", async ({ page, state }) => {
  await page.goto(BASE + "/");
  await page.waitForTimeout(3000);
  assert.ok(state.requests.length >= 1);
  assert.equal(await stored(page), null, "a dead refresh token clears the session");
}, { expiresIn: -30, tokenHandler: () => ({ status: 400, body: { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" } }) });

await scenario("5 English warning", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("promptly-language", "en"); } catch {} });
  await page.goto(BASE + "/");
  await page.getByRole("status").filter({ hasText: "Your browser can't save your session" }).waitFor();
}, { quota: true });

await server.close();
await browser.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
