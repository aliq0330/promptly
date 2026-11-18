import test from "node:test";
import assert from "node:assert";
import { loadExtension, fakeFetch } from "./harness.mjs";

const plain = (v) => JSON.parse(JSON.stringify(v));
const live = { clientId: "cid", redirectUri: "r", accessToken: "TOK", refreshToken: "R1", expiresAt: Date.now() + 3_600_000, scopes: ["read", "write"] };
const row = (id, title, extra = {}) => ({ id, title, description: "", contentType: "text", status: "published", visibility: "public", url: `https://s/p/${id}`, ...extra });

test("benim: sayfalama + imleç; ilk sayfa önbelleğe yazılır", async () => {
  const f = fakeFetch(async (req) => {
    const u = new URL(req.url);
    if (u.searchParams.get("cursor") === "c2") return { status: 200, json: { items: [row("3", "üç")], nextCursor: null } };
    return { status: 200, json: { items: [row("1", "bir"), row("2", "iki")], nextCursor: "c2" } };
  });
  const { PLib, local } = loadExtension({ fetch: f, storage: { auth: live } });
  const p1 = await PLib.list("mine");
  assert.deepEqual(plain(p1.items.map((i) => i.id)), ["1", "2"]);
  assert.equal(p1.nextCursor, "c2");
  assert.equal(local.data.libCache.mine.items.length, 2);
  const p2 = await PLib.list("mine", { cursor: "c2" });
  assert.deepEqual(plain(p2.items.map((i) => i.id)), ["3"]);
  assert.equal(p2.nextCursor, null);
});

test("ağ yokken ilk sayfa son kaydedilen listeden gelir; sonraki sayfa hata verir", async () => {
  const ext = loadExtension({ fetch: fakeFetch(async () => new TypeError("net")), storage: { auth: live, libCache: { mine: { items: [{ id: "1", title: "eski", type: "text", source: "mine" }], at: "x" } } } });
  const r = await ext.PLib.list("mine");
  assert.equal(r.cached, true);
  assert.equal(r.items[0].title, "eski");
  await assert.rejects(ext.PLib.list("mine", { cursor: "c" }), (e) => e.code === "offline");
  await assert.rejects(ext.PLib.list("saved"), (e) => e.code === "offline");
});

test("keşfet: sorgu ve tür sunucuya gider; sonuç herkese açık özet biçimindedir", async () => {
  const f = fakeFetch(async () => ({ status: 200, json: { items: [{ id: "9", title: "Orman", description: "d", contentType: "image", tools: ["midjourney"], author: { username: "ayse" }, promptPreview: "Sisli {mekan}", variableNames: ["mekan"], url: "https://s/p/9" }], nextCursor: "n" } }));
  const { PLib } = loadExtension({ fetch: f });
  const r = await PLib.list("explore", { query: "orman", type: "image" });
  assert.match(f.log[0].url, /\/prompts\?q=orman&content_type=image&limit=25$/);
  assert.equal(r.items[0].author, "ayse");
  assert.deepEqual(plain(r.items[0].tools), ["midjourney"]);
  assert.equal(r.nextCursor, "n");
});

test("popüler: belirteç yok, sayfa yok", async () => {
  const f = fakeFetch(async () => ({ status: 200, json: { items: [{ id: "7", title: "Pop", contentType: "video", author: { username: "x" } }] } }));
  const { PLib } = loadExtension({ fetch: f });
  const r = await PLib.list("popular");
  assert.equal(r.nextCursor, null);
  assert.equal(f.log[0].headers.Authorization, undefined);
});

test("taslaklar kaynağı yalnız status=draft ister", async () => {
  const f = fakeFetch(async () => ({ status: 200, json: { items: [row("d1", "taslak", { status: "draft", visibility: "private" })], nextCursor: null } }));
  const { PLib } = loadExtension({ fetch: f, storage: { auth: live } });
  const r = await PLib.list("drafts");
  assert.match(f.log[0].url, /status=draft/);
  assert.equal(r.items[0].source, "drafts");
});

test("metin: kendi promptu /me'den, başkasınınki açık uçtan; önbellek ve çevrimdışı yedek", async () => {
  let online = true;
  const f = fakeFetch(async (req) => {
    if (!online) return new TypeError("net");
    if (req.url.includes("/me/prompts/")) return { status: 200, json: { promptText: "Benim {a}", variables: ["a"] } };
    return { status: 200, json: { promptText: "Başkası {b}", variables: [{ name: "b", defaultValue: "varsayılan" }] } };
  });
  const { PLib } = loadExtension({ fetch: f, storage: { auth: live } });
  const mine = await PLib.text({ id: "m1", source: "mine" });
  assert.equal(mine.text, "Benim {a}");
  assert.equal(plain(mine.variables)[0].name, "a");
  const other = await PLib.text({ id: "o1", source: "explore" });
  assert.equal(plain(other.variables)[0].defaultValue, "varsayılan");
  assert.match(f.log[1].url, /\/prompts\/o1$/);
  await PLib.text({ id: "o1", source: "explore" });
  assert.equal(f.log.length, 2, "ikinci okuma bellekten");
  online = false;
  const { PLib: L2 } = loadExtension({ fetch: f, storage: { auth: live, textCache: { z9: { text: "yedek {k}", variables: [{ name: "k", defaultValue: "" }], at: 1 } } } });
  assert.equal((await L2.text({ id: "z9", source: "explore" })).text, "yedek {k}");
  await assert.rejects(L2.text({ id: "yok", source: "explore" }), (e) => e.code === "offline");
});

test("son kullanılanlar: kimlik başına tek satır, en yeni üstte, en çok 20; kendi promptu işareti korunur", async () => {
  const { PLib, local } = loadExtension({ storage: { auth: live } });
  for (let i = 0; i < 25; i++) await PLib.markUsed({ id: "p" + i, title: "t" + i, type: "text", source: "mine" });
  await PLib.markUsed({ id: "p3", title: "t3", type: "text", source: "mine" });
  const rec = local.data.recent;
  assert.equal(rec.length, 20);
  assert.equal(rec[0].id, "p3");
  assert.equal(rec.filter((r) => r.id === "p3").length, 1);
  assert.equal(rec[0].own, true);
  const r = await PLib.list("recent", { query: "t3" });
  assert.equal(r.items[0].id, "p3");
});
