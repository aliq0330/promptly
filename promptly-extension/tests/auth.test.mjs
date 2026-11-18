import test from "node:test";
import assert from "node:assert";
import { loadExtension, fakeFetch } from "./harness.mjs";

const plain = (v) => JSON.parse(JSON.stringify(v));
const SUPA = "https://xqxybhjcyrvaroknucdq.supabase.co";

test("PKCE: RFC 7636 ek B örneği ve base64url", async () => {
  const { PAuth } = loadExtension();
  assert.equal(await PAuth._test.challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(PAuth._test.b64url(new Uint8Array([251, 255, 254])), "-__-");
});

test("yetkilendirme adresi: S256, kod akışı, kapsam ve kayıtlı yönlendirme", () => {
  const { PAuth } = loadExtension();
  const u = new URL(PAuth._test.authorizeUrl({ clientId: "cid", redirectUri: "https://abc.chromiumapp.org/", challenge: "CH", state: "ST" }));
  assert.equal(u.origin + u.pathname, `${SUPA}/functions/v1/oauth/authorize`);
  assert.deepEqual(plain(Object.fromEntries(u.searchParams)), { client_id: "cid", redirect_uri: "https://abc.chromiumapp.org/", response_type: "code", code_challenge: "CH", code_challenge_method: "S256", state: "ST", scope: "read write" });
});

test("yönlendirme: durum uyuşmazlığı, ret ve kod eksikliği reddedilir", () => {
  const { PAuth } = loadExtension();
  const p = PAuth._test.parseRedirect;
  assert.equal(p("https://abc.chromiumapp.org/?code=K&state=S", "S"), "K");
  assert.throws(() => p("https://abc.chromiumapp.org/?code=K&state=X", "S"), (e) => e.code === "failed" && e.message === "state_mismatch");
  assert.throws(() => p("https://abc.chromiumapp.org/?error=access_denied&state=S", "S"), (e) => e.code === "cancelled");
  assert.throws(() => p("https://abc.chromiumapp.org/?state=S", "S"), (e) => e.message === "missing_code");
  assert.throws(() => p("bozuk", "S"), (e) => e.code === "failed");
});

test("bağlan: istemci kaydı + PKCE + kod değişimi; belirteçler ve kapsamlar saklanır, şifre yok", async () => {
  let verifierSeen = null;
  const f = fakeFetch(async (req) => {
    if (req.url.endsWith("/oauth/register")) return { status: 201, json: { client_id: "11111111-1111-4111-8111-111111111111" } };
    if (req.url.endsWith("/oauth/token")) {
      const body = new URLSearchParams(req.body);
      verifierSeen = body.get("code_verifier");
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("redirect_uri"), "https://abc.chromiumapp.org/");
      assert.equal(body.get("code"), "CODE");
      return { status: 200, json: { access_token: "pmt_A", refresh_token: "R1", expires_in: 3600, scope: "read write" } };
    }
    throw new Error("beklenmeyen " + req.url);
  });
  const ext = loadExtension({ fetch: f, flow: (opts) => { const u = new URL(opts.url); return `https://abc.chromiumapp.org/?code=CODE&state=${u.searchParams.get("state")}`; } });
  const auth = await ext.PAuth.connect();
  assert.equal(auth.accessToken, "pmt_A");
  assert.equal(auth.refreshToken, "R1");
  assert.deepEqual(plain(auth.scopes), ["read", "write"]);
  assert.ok(verifierSeen && verifierSeen.length >= 43);
  const reg = JSON.parse(f.log[0].body);
  assert.deepEqual(plain(reg.redirect_uris), ["https://abc.chromiumapp.org/"]);
  assert.equal(reg.client_name, "Promptly Chrome uzantısı");
  assert.equal(await ext.PAuth.signedIn(), true);
  assert.equal(ext.PAuth.canWrite(auth), true);
});

test("bağlan: kullanıcı vazgeçerse 'cancelled', kayıtlı istemci yeniden kullanılır", async () => {
  const f = fakeFetch(async () => ({ status: 201, json: { client_id: "cid" } }));
  const ext = loadExtension({ fetch: f });
  await assert.rejects(ext.PAuth.connect(), (e) => e.code === "cancelled");
  await assert.rejects(ext.PAuth.connect(), (e) => e.code === "cancelled");
  assert.equal(f.log.filter((x) => x.url.endsWith("/register")).length, 1);
});

const expired = { clientId: "cid", redirectUri: "https://abc.chromiumapp.org/", accessToken: "OLD", refreshToken: "R1", expiresAt: Date.now() - 1000, scopes: ["read", "write"] };

test("YARIŞ: aynı anda iki bağlam yenilerse sunucuya TEK istek gider (yenileme belirteci döner)", async () => {
  const f = fakeFetch(async (req) => {
    const body = new URLSearchParams(req.body);
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "R1", "ikinci istek eski belirteci tekrar göndermemeli");
    await new Promise((r) => setTimeout(r, 20));
    return { status: 200, json: { access_token: "NEW", refresh_token: "R2", expires_in: 3600, scope: "read write" } };
  });
  const ext = loadExtension({ fetch: f, storage: { auth: expired } });
  const [a, b, c] = await Promise.all([ext.PAuth.getToken(), ext.PAuth.getToken(), ext.PAuth.getToken()]);
  assert.deepEqual([a, b, c], ["NEW", "NEW", "NEW"]);
  assert.equal(f.log.length, 1);
  assert.equal(ext.local.data.auth.refreshToken, "R2");
});

test("geçerli belirteç yenilenmez; 'invalid' verilen belirteci başka bağlam yenilediyse onu döner", async () => {
  const f = fakeFetch(async () => ({ status: 200, json: { access_token: "N2", refresh_token: "R3", expires_in: 3600 } }));
  const ext = loadExtension({ fetch: f, storage: { auth: { ...expired, accessToken: "LIVE", expiresAt: Date.now() + 3_600_000 } } });
  assert.equal(await ext.PAuth.getToken(), "LIVE");
  assert.equal(f.log.length, 0);
  assert.equal(await ext.PAuth.getToken({ invalid: "BAŞKA" }), "LIVE", "başka belirteç 401 aldıysa mevcut geçerli olan döner");
  assert.equal(f.log.length, 0);
  assert.equal(await ext.PAuth.getToken({ invalid: "LIVE" }), "N2", "mevcut belirteç reddedildiyse yenilenir");
});

test("yenileme: invalid_grant oturumu kapatır (istemci kaydı kalır); geçici hatalar oturumu SİLMEZ", async () => {
  const gone = loadExtension({ fetch: fakeFetch(async () => ({ status: 400, json: { error: "invalid_grant" } })), storage: { auth: expired } });
  await assert.rejects(gone.PAuth.getToken(), (e) => e.code === "unauthorized");
  assert.equal(gone.local.data.auth.refreshToken, undefined);
  assert.equal(gone.local.data.auth.clientId, "cid");

  for (const [status, code] of [[429, "rate_limited"], [503, "server"]]) {
    const ext = loadExtension({ fetch: fakeFetch(async () => ({ status, json: {} })), storage: { auth: expired } });
    await assert.rejects(ext.PAuth.getToken(), (e) => e.code === code);
    assert.equal(ext.local.data.auth.refreshToken, "R1", `${status} oturumu silmemeli`);
  }
  const off = loadExtension({ fetch: fakeFetch(async () => new TypeError("net")), storage: { auth: expired } });
  await assert.rejects(off.PAuth.getToken(), (e) => e.code === "offline");
  assert.equal(off.local.data.auth.refreshToken, "R1");
});

test("çıkış: yenileme belirteci iptal edilir, istemci kaydı kalır; sunucu yanıt vermese de yerel çıkış olur", async () => {
  const f = fakeFetch(async () => new TypeError("net"));
  const ext = loadExtension({ fetch: f, storage: { auth: { ...expired, accessToken: "X", expiresAt: Date.now() + 1e6 } } });
  await ext.PAuth.signOut();
  assert.equal(f.log[0].url.endsWith("/oauth/revoke"), true);
  assert.equal(new URLSearchParams(f.log[0].body).get("token"), "R1");
  assert.equal(await ext.PAuth.signedIn(), false);
  assert.equal(ext.local.data.auth.clientId, "cid");
});

test("oturum yokken getToken 'unauthorized'", async () => {
  const ext = loadExtension({});
  await assert.rejects(ext.PAuth.getToken(), (e) => e.code === "unauthorized");
});
