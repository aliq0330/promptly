import test from "node:test";
import assert from "node:assert/strict";
import {
  appendUnique,
  homeHref,
  isDiscoverFeedSource,
  isInvitesSection,
  orderByIds,
  parseShownMap,
  recordShownSuggestions,
  reduceRepeatedSuggestions,
  resolveHomeView,
  SUGGESTION_REPEAT_WINDOW_MS,
  takeSeenBatch,
} from "./community-home.ts";

const signedIn = { signedIn: true, managesAny: true };

test("resolveHomeView: varsayılan Gönderiler; ziyaretçi her zaman Keşfet", () => {
  assert.deepEqual(resolveHomeView(null, signedIn).view, "posts");
  assert.deepEqual(resolveHomeView("bilinmeyen", signedIn).view, "posts");
  assert.equal(resolveHomeView(null, { signedIn: false, managesAny: false }).view, "discover");
  assert.equal(resolveHomeView("invites", { signedIn: false, managesAny: false }).view, "discover");
});

test("resolveHomeView: eski adresler korunur (mine, invites, requests → Başvurularım, managed)", () => {
  assert.equal(resolveHomeView("discover", signedIn).view, "discover");
  assert.equal(resolveHomeView("mine", signedIn).view, "mine");
  assert.deepEqual(resolveHomeView("invites", signedIn), { view: "invites", section: "invites" });
  assert.deepEqual(resolveHomeView("requests", signedIn), { view: "invites", section: "mine" });
  assert.equal(resolveHomeView("managed", signedIn).view, "managed");
});

test("resolveHomeView: yönetilen topluluğu olmayan Yönettiklerim'e giremez", () => {
  assert.equal(resolveHomeView("managed", { signedIn: true, managesAny: false }).view, "posts");
});

test("homeHref: Gönderiler sade adres, bölüm yalnız Davet ve başvurular'da", () => {
  assert.equal(homeHref("posts"), "/communities");
  assert.equal(homeHref("discover"), "/communities?tab=discover");
  assert.equal(homeHref("invites"), "/communities?tab=invites");
  assert.equal(homeHref("invites", "incoming"), "/communities?tab=invites&section=incoming");
  assert.equal(homeHref("managed", "incoming"), "/communities?tab=managed");
  assert.equal(isInvitesSection("incoming"), true);
  assert.equal(isInvitesSection("x"), false);
});

const cands = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

test("reduceRepeatedSuggestions: gösterilenler sona alınır, sıra korunur, tekrar yok", () => {
  const now = 1_000_000_000;
  const shown = { a: now - 1000, c: now - 2000 };
  assert.deepEqual(reduceRepeatedSuggestions(cands, shown, now, 5).map((c) => c.id), ["b", "d", "e", "a", "c"]);
  assert.deepEqual(reduceRepeatedSuggestions(cands, shown, now, 3).map((c) => c.id), ["b", "d", "e"]);
});

test("reduceRepeatedSuggestions: yeterli yeni yoksa eskiler dolgu olur; pencere dışı sayılmaz; kopya elenir", () => {
  const now = 10 * SUGGESTION_REPEAT_WINDOW_MS;
  const shown = { a: now - 1, b: now - 1, c: now - 1, d: now - SUGGESTION_REPEAT_WINDOW_MS - 1 };
  assert.deepEqual(reduceRepeatedSuggestions(cands, shown, now, 4).map((c) => c.id), ["d", "e", "a", "b"]);
  assert.deepEqual(reduceRepeatedSuggestions([...cands, { id: "a" }], {}, now, 10).map((c) => c.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(reduceRepeatedSuggestions(cands, {}, now, 0), []);
});

test("recordShownSuggestions: yeni kimlikler kaydedilir, ilk görülme korunur, pencere dışı temizlenir", () => {
  const now = 5 * SUGGESTION_REPEAT_WINDOW_MS;
  const next = recordShownSuggestions({ old: 1, keep: now - 10 }, ["keep", "new"], now);
  assert.equal(next.old, undefined);
  assert.equal(next.keep, now - 10);
  assert.equal(next.new, now);
});

test("parseShownMap: bozuk değer boş harita verir", () => {
  assert.deepEqual(parseShownMap(null), {});
  assert.deepEqual(parseShownMap("{bozuk"), {});
  assert.deepEqual(parseShownMap("[1,2]"), {});
  assert.deepEqual(parseShownMap('{"a":5,"b":"x"}'), { a: 5 });
});

test("takeSeenBatch: aynı kimlik ikinci kez gönderilmez, parti boyu sınırlı", () => {
  const pending = new Set(["a", "b", "c"]);
  const sent = new Set<string>();
  assert.deepEqual(takeSeenBatch(pending, sent, 2), ["a", "b"]);
  assert.deepEqual([...pending], ["c"]);
  pending.add("a");
  assert.deepEqual(takeSeenBatch(pending, sent, 5), ["c"]);
  assert.equal(pending.size, 0);
  assert.deepEqual(takeSeenBatch(pending, sent), []);
});

test("appendUnique: sayfa birleştirirken kopya girmez, ilk sıra korunur", () => {
  const merged = appendUnique([{ id: "1" }, { id: "2" }], [{ id: "2" }, { id: "3" }, { id: "3" }]);
  assert.deepEqual(merged.map((m) => m.id), ["1", "2", "3"]);
});

test("orderByIds: sunucu sırası korunur, okunamayan (haritada olmayan) atlanır", () => {
  const byId = new Map([["b", { id: "b" }], ["a", { id: "a" }]]);
  assert.deepEqual(orderByIds(["a", "x", "b"], byId).map((m) => m.id), ["a", "b"]);
});

test("isDiscoverFeedSource", () => {
  assert.equal(isDiscoverFeedSource("member"), true);
  assert.equal(isDiscoverFeedSource("private"), false);
});
