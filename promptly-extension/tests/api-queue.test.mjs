import test from "node:test";
import assert from "node:assert";
import { loadExtension, fakeFetch } from "./harness.mjs";

const plain = (v) => JSON.parse(JSON.stringify(v));
const SUPA = "https://xqxybhjcyrvaroknucdq.supabase.co";
const live = { clientId: "cid", redirectUri: "https://abc.chromiumapp.org/", accessToken: "TOK", refreshToken: "R1", expiresAt: Date.now() + 3_600_000, scopes: ["read", "write"], user: { username: "aliq" } };
const draft = (over = {}) => ({ title: "Başlık", text: "Merhaba {ad}", type: "text", tools: [], tags: [], origin: "external", sourceUrl: "https://x.example/p", sourceTitle: "Sayfa", imageUrl: "", ...over });

test("hata eşlemesi: durum → kısa kod", () => {
  const { PApi } = loadExtension();
  const m = (s, j, h) => PApi._test.toError(s, j, { get: (k) => (h || {})[k] ?? null });
  assert.equal(m(401, {}).code, "unauthorized");
  assert.equal(m(403, { error: { code: "insufficient_scope", message: "needs write scope" } }).code, "insufficient_scope");
  assert.equal(m(403, { error: { message: "suspended" } }).code, "forbidden");
  assert.equal(m(404, {}).code, "not_found");
  assert.equal(m(429, {}, { "retry-after": "12" }).retryAfter, 12);
  assert.equal(m(503, {}).code, "server");
  assert.equal(m(422, {}).code, "invalid");
  assert.equal(m(400, { error: { message: "x" } }).code, "bad_request");
});

test("sendDraft: tek istek, Bearer başlığı, gövde sitenin dosya biçimi; sonuç editUrl", async () => {
  const f = fakeFetch(async () => ({ status: 200, json: { ok: true, created: 1, items: [{ index: 0, status: "ok", id: "p-1" }] } }));
  const ext = loadExtension({ fetch: f, storage: { auth: live } });
  const r = await ext.PApi.sendDraft(draft());
  assert.equal(r.id, "p-1");
  assert.equal(r.editUrl, "https://aliq0330.github.io/promptly/create/?edit=p-1");
  assert.equal(f.log.length, 1);
  assert.equal(f.log[0].url, `${SUPA}/functions/v1/api/v1/me/prompts`);
  assert.equal(f.log[0].method, "POST");
  assert.equal(f.log[0].headers.Authorization, "Bearer TOK");
  const body = JSON.parse(f.log[0].body);
  assert.equal(body.format, "promptly.prompts");
  assert.equal(body.items[0].source.url, "https://x.example/p");
});

test("sendDraft: aynı prompt zaten varsa 'duplicate' (hata değil); geçersizse 'invalid' alan bilgisiyle", async () => {
  const dup = loadExtension({ fetch: fakeFetch(async () => ({ status: 200, json: { items: [{ status: "duplicate" }] } })), storage: { auth: live } });
  assert.equal((await dup.PApi.sendDraft(draft())).duplicate, true);
  const bad = loadExtension({ fetch: fakeFetch(async () => ({ status: 422, json: { items: [{ status: "invalid", field: "tools", code: "invalid_tool" }] } })), storage: { auth: live } });
  await assert.rejects(bad.PApi.sendDraft(draft()), (e) => e.code === "invalid" && e.field === "tools" && e.detail === "invalid_tool");
});

test("sendDraft: görsel ayrı uç ile eklenir; başarısızlık taslağı bozmaz (imageError)", async () => {
  const f = fakeFetch(async (req) => (req.url.includes("media-upload") ? { status: 400, json: { error: { message: "image too large" } } } : { status: 200, json: { items: [{ status: "ok", id: "p-2" }] } }));
  const ext = loadExtension({ fetch: f, storage: { auth: live } });
  const r = await ext.PApi.sendDraft(draft({ type: "image", imageUrl: "https://cdn.example/a.png" }));
  assert.equal(r.id, "p-2");
  assert.equal(r.imageError, "image too large");
  const media = f.log.find((x) => x.url.includes("media-upload"));
  assert.deepEqual(plain(JSON.parse(media.body)), { prompt_id: "p-2", image_url: "https://cdn.example/a.png", alt: "Başlık" });
  // https olmayan görsel hiç gönderilmez
  const f2 = fakeFetch(async () => ({ status: 200, json: { items: [{ status: "ok", id: "p-3" }] } }));
  const ext2 = loadExtension({ fetch: f2, storage: { auth: live } });
  const r2 = await ext2.PApi.sendDraft(draft({ type: "image", imageUrl: "http://cdn.example/a.png" }));
  assert.equal(r2.imageError, "https");
  assert.equal(f2.log.length, 1);
});

test("401 gelirse belirteç BİR kez yenilenip istek tekrarlanır", async () => {
  let n = 0;
  const f = fakeFetch(async (req) => {
    if (req.url.endsWith("/oauth/token")) return { status: 200, json: { access_token: "TOK2", refresh_token: "R2", expires_in: 3600, scope: "read write" } };
    n += 1;
    return n === 1 ? { status: 401, json: { error: { code: "unauthorized" } } } : { status: 200, json: { user: { username: "aliq" }, scopes: ["read", "write"] } };
  });
  const ext = loadExtension({ fetch: f, storage: { auth: live } });
  const me = await ext.PApi.me();
  assert.equal(me.user.username, "aliq");
  assert.equal(f.log.filter((x) => x.url.endsWith("/oauth/token")).length, 1);
  assert.equal(f.log[f.log.length - 1].headers.Authorization, "Bearer TOK2");
});

test("herkese açık uçlar belirteç istemez ve sorgu dizesi kurar", async () => {
  const f = fakeFetch(async () => ({ status: 200, json: { items: [] } }));
  const ext = loadExtension({ fetch: f });
  await ext.PApi.search({ q: "orman ışık", contentType: "image", limit: 25 });
  await ext.PApi.popular({ limit: 25 });
  assert.equal(f.log[0].url, `${SUPA}/functions/v1/api/v1/prompts?q=orman+%C4%B1%C5%9F%C4%B1k&content_type=image&limit=25`);
  assert.equal(f.log[0].headers.Authorization, undefined);
  assert.equal(f.log[1].url, `${SUPA}/functions/v1/api/v1/prompts/popular?limit=25`);
});

test("ağ yok → 'offline'", async () => {
  const ext = loadExtension({ fetch: fakeFetch(async () => new TypeError("x")) });
  await assert.rejects(ext.PApi.search({ q: "a" }), (e) => e.code === "offline");
});

// ---------------- kuyruk ----------------
const mk = (storage = { auth: live }) => {
  const ext = loadExtension({ storage });
  return { ...ext, deps: (send) => ({ signedIn: () => ext.PAuth.signedIn(), send }) };
};

test("kuyruk: yakalama bekletilir (Geri al) ve süre dolmadan gönderilmez", async () => {
  const { PQueue, local, deps } = mk();
  const sent = [];
  const item = await PQueue.enqueue(draft(), 1_000);
  assert.equal(item.holdUntil, 1_000 + PQueue.HOLD_MS);
  await PQueue.flush(deps(async (d) => { sent.push(d); return { id: "x" }; }), 1_000 + 100);
  assert.equal(sent.length, 0);
  await PQueue.flush(deps(async (d) => { sent.push(d); return { id: "x", editUrl: "u" }; }), 1_000 + PQueue.HOLD_MS);
  assert.equal(sent.length, 1);
  assert.equal(local.data.queue.length, 0);
  assert.equal(local.data.sent[0].url, "u");
});

test("kuyruk: Geri al yalnız gönderilmemiş öğeyi geri alır", async () => {
  const { PQueue, deps, local } = mk();
  const a = await PQueue.enqueue(draft({ title: "a" }), 0);
  assert.equal(await PQueue.undo(a.id), true);
  assert.equal(local.data.queue.length, 0);
  const b = await PQueue.enqueue(draft({ title: "b" }), 0);
  await PQueue.flush(deps(async () => ({ id: "x" })), 999_999);
  assert.equal(await PQueue.undo(b.id), false);
});

test("kuyruk: KALICI hatalı öğe 'failed' olur ve arkadakileri engellemez (eski sürümdeki hata)", async () => {
  const { PQueue, deps, local, PErr } = mk();
  await PQueue.enqueue(draft({ title: "bozuk" }), 0);
  await PQueue.enqueue(draft({ title: "iyi-1" }), 0);
  await PQueue.enqueue(draft({ title: "iyi-2" }), 0);
  const order = [];
  const res = await PQueue.flush(deps(async (d) => {
    order.push(d.title);
    if (d.title === "bozuk") throw new PErr("invalid", "title:required", { field: "title", detail: "required" });
    return { id: d.title };
  }), 99_999);
  assert.deepEqual(order, ["bozuk", "iyi-1", "iyi-2"]);
  assert.equal(res.sent, 2);
  assert.equal(local.data.queue.length, 1);
  assert.equal(local.data.queue[0].state, "failed");
  assert.equal(local.data.queue[0].error.field, "title");
  // tekrar dene → yeniden kuyruğa girer
  await PQueue.retry(local.data.queue[0].id);
  assert.equal(local.data.queue[0].state, "queued");
});

test("kuyruk: GEÇİCİ hata (ağ, hız sınırı, sunucu, yetki) kuyruğu durdurur, öğe kaybolmaz", async () => {
  for (const code of ["offline", "rate_limited", "server", "unauthorized", "insufficient_scope"]) {
    const { PQueue, deps, local, PErr } = mk();
    await PQueue.enqueue(draft({ title: "1" }), 0);
    await PQueue.enqueue(draft({ title: "2" }), 0);
    let calls = 0;
    const res = await PQueue.flush(deps(async () => { calls += 1; throw new PErr(code, "x"); }), 99_999);
    assert.equal(calls, 1, `${code}: ilk hatada durmalı`);
    assert.equal(res.stopped, code);
    assert.equal(local.data.queue.length, 2);
    assert.equal(local.data.queue[0].state, "queued");
    assert.equal(local.data.lastError.code, code);
  }
});

test("kuyruk: oturum yoksa hiçbir şey gönderilmez; başarılı tur eski hata kaydını temizler", async () => {
  const out = mk({});
  await out.PQueue.enqueue(draft(), 0);
  assert.equal((await out.PQueue.flush(out.deps(async () => { throw new Error("çağrılmamalı"); }), 99_999)).stopped, "signed_out");
  const ok = mk({ auth: live, lastError: { code: "offline" } });
  await ok.PQueue.flush(ok.deps(async () => ({ id: "x" })), 99_999);
  assert.equal(ok.local.data.lastError, null);
});

test("kuyruk: sınır ve 'sent' geçmişi sınırı", async () => {
  const { PQueue, deps, local, PErr } = mk();
  for (let i = 0; i < PQueue.MAX_QUEUE; i++) await PQueue.enqueue(draft({ title: "t" + i }), 0);
  await assert.rejects(PQueue.enqueue(draft(), 0), (e) => e.code === "queue_full");
  await PQueue.flush(deps(async (d) => ({ id: d.title })), 99_999);
  assert.equal(local.data.sent.length, PQueue.MAX_SENT);
  assert.equal(local.data.queue.length, 0);
  void PErr;
});

test("durum: oturum, yazma izni, ağ, sorun ve bekleyen tek etikette", () => {
  const { PQueue } = loadExtension();
  const s = (o) => plain(PQueue.statusOf({ auth: null, queue: [], lastError: null, ...o }));
  assert.equal(s({}).kind, "signedOut");
  assert.equal(s({ auth: { refreshToken: "r", scopes: ["read"] } }).kind, "needsWrite");
  const a = { refreshToken: "r", scopes: ["read", "write"] };
  assert.equal(s({ auth: a }).kind, "ok");
  assert.deepEqual(s({ auth: a, queue: [{ state: "queued" }, { state: "queued" }] }), { kind: "pending", n: 2 });
  assert.equal(s({ auth: a, lastError: { code: "offline" } }).kind, "offline");
  assert.equal(s({ auth: a, lastError: { code: "server" } }).kind, "error");
  assert.equal(s({ auth: a, queue: [{ state: "failed" }] }).kind, "error");
  assert.equal(s({ auth: a, lastError: { code: "insufficient_scope" } }).kind, "needsWrite");
});
