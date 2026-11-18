import test from "node:test";
import assert from "node:assert";
import { loadExtension, fakeFetch } from "./harness.mjs";

const plain = (v) => JSON.parse(JSON.stringify(v));
const FILES = ["config.js", "shared/i18n.js", "shared/vars.js", "shared/store.js", "shared/auth.js", "shared/api.js", "shared/queue.js", "shared/library.js", "shared/engage.js"];
const live = { clientId: "cid", redirectUri: "r", accessToken: "TOK", refreshToken: "R1", expiresAt: Date.now() + 3_600_000, scopes: ["read", "interact"] };
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const state = (over = {}) => ({ reaction: null, saved: false, collectionIds: [], authorUsername: "ayse", followingAuthor: false, works: { yes: 4, no: 1, myVote: null, canVote: true }, ...over });
const load = (handler) => { const f = fakeFetch(handler); return { f, ...loadExtension({ files: FILES, fetch: f, storage: { auth: live } }) }; };
const ctxOf = (x) => ({ PApi: x.PApi, PEngage: x.ctx.PEngage, PLib: x.PLib });

test("api: etkileşim yazmaları doğru yöntem, adres ve gövdeyle gider (PUT = yap, DELETE = geri al); belirteç eklenir", async () => {
  const f = fakeFetch(async () => ({ status: 200, json: { ok: true } }));
  const { PApi } = loadExtension({ files: FILES, fetch: f, storage: { auth: live } });
  await PApi.setReaction(P1, "fire");
  await PApi.setReaction(P1, null);
  await PApi.setSaved(P1, true);
  await PApi.setSaved(P1, false);
  await PApi.setWorks(P1, false);
  await PApi.setWorks(P1, null);
  await PApi.setCollectionItem("col-1", P1, true);
  await PApi.setCollectionItem("col-1", P1, false);
  await PApi.setFollow("ay se", true);
  await PApi.setFollow("ayse", false);
  const seen = f.log.map((e) => `${e.method} ${new URL(e.url).pathname.replace(/^.*\/api\/v1/, "")}${e.body ? " " + e.body : ""}`);
  assert.deepEqual(seen, [
    `PUT /me/prompts/${P1}/reaction {"reaction":"fire"}`,
    `DELETE /me/prompts/${P1}/reaction`,
    `PUT /me/prompts/${P1}/saved`,
    `DELETE /me/prompts/${P1}/saved`,
    `PUT /me/prompts/${P1}/works {"works":false}`,
    `DELETE /me/prompts/${P1}/works`,
    `PUT /me/collections/col-1/prompts/${P1}`,
    `DELETE /me/collections/col-1/prompts/${P1}`,
    `PUT /me/following/ay%20se`,
    `DELETE /me/following/ayse`,
  ]);
  assert.ok(f.log.every((e) => e.headers.Authorization === "Bearer TOK"));
});

test("api: akış, koleksiyon, durum ve alt kaynak adresleri; alt kaynaklar belirteçsizdir", async () => {
  const f = fakeFetch(async () => ({ status: 200, json: { items: [] } }));
  const { PApi } = loadExtension({ files: FILES, fetch: f, storage: { auth: live } });
  await PApi.feed({ tab: "for_you", contentType: "image", limit: 25, cursor: "c" });
  await PApi.collections();
  await PApi.collectionPrompts("col-1", { limit: 25 });
  await PApi.engagement([P1, P2]);
  await PApi.results(P1, { limit: 10 });
  await PApi.versions(P1);
  await PApi.comments(P1, { cursor: "x" });
  const urls = f.log.map((e) => new URL(e.url).pathname.replace(/^.*\/api\/v1/, "") + new URL(e.url).search);
  assert.deepEqual(urls, [
    "/me/feed?tab=for_you&content_type=image&limit=25&cursor=c",
    "/me/collections",
    "/me/collections/col-1/prompts?limit=25",
    `/me/engagement?ids=${P1}%2C${P2}`,
    `/prompts/${P1}/results?limit=10`,
    `/prompts/${P1}/versions`,
    `/prompts/${P1}/comments?cursor=x`,
  ]);
  assert.ok(f.log.slice(0, 4).every((e) => e.headers.Authorization === "Bearer TOK"));
  assert.ok(f.log.slice(4).every((e) => e.headers.Authorization === undefined), "herkese açık alt kaynaklar belirteç göndermez");
});

test("kütüphane: Sana özel / Takip akışı ve koleksiyon kaynağı; gösterilme nedeni taşınır, kaynak 'feed' olur", async () => {
  const f = fakeFetch(async (req) => {
    const path = new URL(req.url).pathname;
    if (path.endsWith("/me/feed")) return { status: 200, json: { items: [{ id: P1, title: "Akış", contentType: "image", author: { username: "ayse" }, reason: { kind: "tag", ref: "neon" } }, { id: P2, title: "Nedensiz", contentType: "text", author: { username: "ali" }, reason: null }], nextCursor: "n" } };
    if (path.endsWith("/me/collections")) return { status: 200, json: { items: [{ id: "c1", name: "Logolar", promptCount: 3, shared: true, mine: false, ownerUsername: "ayse" }] } };
    return { status: 200, json: { items: [{ id: P1, title: "Koleksiyondaki", contentType: "text", author: { username: "ayse" } }], nextCursor: null } };
  });
  const { PLib } = loadExtension({ files: FILES, fetch: f, storage: { auth: live } });
  const r = await PLib.list("feed_for_you", { type: "image" });
  assert.match(f.log[0].url, /\/me\/feed\?tab=for_you&content_type=image&limit=25$/);
  assert.deepEqual(plain(r.items[0].reason), { kind: "tag", ref: "neon" });
  assert.equal(r.items[1].reason, null);
  assert.equal(r.items[0].source, "feed");
  assert.equal(r.nextCursor, "n");
  await PLib.list("feed_following", { cursor: "c9" });
  assert.match(f.log[1].url, /\/me\/feed\?tab=following&limit=25&cursor=c9$/);
  const c = await PLib.list("collection", { collectionId: "c1" });
  assert.match(f.log[2].url, /\/me\/collections\/c1\/prompts\?limit=25$/);
  assert.equal(c.items[0].source, "collection");
  assert.deepEqual(plain(await PLib.collections()), [{ id: "c1", name: "Logolar", promptCount: 3, shared: true, mine: false, owner: "ayse" }]);
});

test("engage.load: 30'arlı gruplar, bir kez; okunamayan kimlik null; hata durumu önbelleğe yazmaz ve fırlatmaz", async () => {
  const ids = Array.from({ length: 65 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
  let fail = false;
  const x = load(async (req) => {
    if (fail) return new TypeError("net");
    const wanted = new URL(req.url).searchParams.get("ids").split(",");
    return { status: 200, json: { items: Object.fromEntries(wanted.filter((id) => id !== ids[1]).map((id) => [id, state()])) } };
  });
  const { PEngage } = ctxOf(x);
  await PEngage.load(ids);
  assert.equal(x.f.log.length, 3, "65 kimlik = 3 istek (30+30+5)");
  assert.equal(PEngage.get(ids[0]).authorUsername, "ayse");
  assert.equal(PEngage.get(ids[1]), null, "okunamayan prompt için durum yok");
  await PEngage.load(ids);
  assert.equal(x.f.log.length, 3, "önbellekteki kimlik yeniden istenmez");
  fail = true;
  await PEngage.load(["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]);
  fail = false;
  await PEngage.load(["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]);
  assert.equal(x.f.log.length, 5, "başarısız grup önbelleğe yazılmadı: yeniden denendi");
});

test("engage.react: iyimser uygulanır, dinleyiciler haberdar olur; sunucu reddederse eski duruma dönülür ve hata fırlar", async () => {
  let reject = false;
  const x = load(async (req) => {
    const path = new URL(req.url).pathname;
    if (path.endsWith("/me/engagement")) return { status: 200, json: { items: { [P1]: state() } } };
    if (reject) return { status: 422, json: { error: { message: "no" } } };
    return { status: 200, json: { reaction: "fire" } };
  });
  const { PEngage } = ctxOf(x);
  await PEngage.load([P1]);
  const events = [];
  PEngage.on((id) => events.push([id, PEngage.get(id).reaction]));
  await PEngage.react(P1, "fire");
  assert.equal(PEngage.get(P1).reaction, "fire");
  reject = true;
  await assert.rejects(PEngage.react(P1, null), (e) => e.code === "invalid");
  assert.equal(PEngage.get(P1).reaction, "fire", "reddedilen geri alma eski durumu korur");
  assert.deepEqual(events.map((e) => e[1]), ["fire", null, "fire"], "iyimser değişiklik ve geri alma görüldü");
  await assert.rejects(PEngage.react("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "love"), (e) => e.code === "not_found");
});

test("engage.save / inCollection: kaydı kaldırmak koleksiyonları da boşaltır; koleksiyona eklemek kaydeder", async () => {
  const x = load(async (req) => (new URL(req.url).pathname.endsWith("/me/engagement") ? { status: 200, json: { items: { [P1]: state(), [P2]: state({ saved: true, collectionIds: ["c1", "c2"] }) } } } : { status: 200, json: {} }));
  const { PEngage } = ctxOf(x);
  await PEngage.load([P1, P2]);
  await PEngage.inCollection(P1, "c1", true);
  assert.deepEqual(plain({ s: PEngage.get(P1).saved, c: PEngage.get(P1).collectionIds }), { s: true, c: ["c1"] });
  await PEngage.inCollection(P1, "c1", false);
  assert.deepEqual(plain({ s: PEngage.get(P1).saved, c: PEngage.get(P1).collectionIds }), { s: true, c: [] }, "koleksiyondan çıkarmak kaydı etkilemez");
  await PEngage.save(P2, false);
  assert.deepEqual(plain({ s: PEngage.get(P2).saved, c: PEngage.get(P2).collectionIds }), { s: false, c: [] });
});

test("engage.follow: aynı yazarın bütün kartları birlikte güncellenir; hata olursa hepsi geri döner", async () => {
  let reject = false;
  const x = load(async (req) => {
    if (new URL(req.url).pathname.endsWith("/me/engagement")) return { status: 200, json: { items: { [P1]: state(), [P2]: state({ authorUsername: "ali" }) } } };
    return reject ? { status: 500, json: {} } : { status: 200, json: { following: true } };
  });
  const { PEngage } = ctxOf(x);
  await PEngage.load([P1, P2]);
  await PEngage.follow("ayse", true);
  assert.equal(PEngage.get(P1).followingAuthor, true);
  assert.equal(PEngage.get(P2).followingAuthor, false, "başka yazar etkilenmez");
  reject = true;
  await assert.rejects(PEngage.follow("ayse", false));
  assert.equal(PEngage.get(P1).followingAuthor, true, "hata: eski duruma dönüldü");
});

test("engage.works: oy sunucunun döndürdüğü sayılarla güncellenir; geri alma null gönderir", async () => {
  const bodies = [];
  const x = load(async (req) => {
    if (new URL(req.url).pathname.endsWith("/me/engagement")) return { status: 200, json: { items: { [P1]: state() } } };
    bodies.push(req.body);
    return { status: 200, json: { works: { yes: 5, no: 1, myVote: req.method === "PUT" ? true : null } } };
  });
  const { PEngage } = ctxOf(x);
  await PEngage.load([P1]);
  await PEngage.works(P1, true);
  assert.deepEqual(plain(PEngage.get(P1).works), { yes: 5, no: 1, myVote: true, canVote: true });
  await PEngage.works(P1, null);
  assert.equal(PEngage.get(P1).works.myVote, null);
  assert.deepEqual(bodies, ['{"works":true}', undefined]);
});

test("engage.collections: kısa süre önbellekte durur, force ile yenilenir; reset her şeyi unutur", async () => {
  const x = load(async (req) => (new URL(req.url).pathname.endsWith("/me/collections") ? { status: 200, json: { items: [{ id: "c1", name: "A", promptCount: 1, shared: false, mine: true, ownerUsername: "me" }] } } : { status: 200, json: { items: { [P1]: state() } } }));
  const { PEngage } = ctxOf(x);
  await PEngage.collections(); await PEngage.collections();
  assert.equal(x.f.log.filter((e) => e.url.endsWith("/me/collections")).length, 1);
  await PEngage.collections(true);
  assert.equal(x.f.log.filter((e) => e.url.endsWith("/me/collections")).length, 2);
  await PEngage.load([P1]);
  PEngage.reset();
  assert.equal(PEngage.get(P1), null);
  await PEngage.collections();
  assert.equal(x.f.log.filter((e) => e.url.endsWith("/me/collections")).length, 3);
});

test("auth: etkileşim kapsamı yalnız 'interact' varsa vardır; istenen kapsam üçlüdür", async () => {
  const { PAuth } = loadExtension({ files: FILES });
  assert.equal(PAuth.canInteract({ scopes: ["read", "interact"] }), true);
  assert.equal(PAuth.canInteract({ scopes: ["read", "write"] }), false);
  assert.equal(PAuth.canInteract(null), false);
  assert.equal(PAuth.SCOPE, "read write interact");
});
