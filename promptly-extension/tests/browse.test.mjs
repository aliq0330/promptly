// Gezinme mantığı: süzgeç → API argümanları, Görünümlerim, slotlar, kart görseli, dışa aktarma, seçim değişkeni.
import test from "node:test";
import assert from "node:assert";
import { loadExtension } from "./harness.mjs";

const { PBrowse, PVars } = (() => { const l = loadExtension({ files: ["config.js", "shared/i18n.js", "shared/vars.js", "shared/browse.js"] }); return { PBrowse: l.ctx.PBrowse, PVars: l.PVars }; })();

test("cleanFilters: geçersiz değerler varsayılana düşer, araç kimliği ve etiket temizlenir", () => {
  assert.deepEqual({ ...PBrowse.cleanFilters(null) }, { type: "all", tool: "", tag: "", vars: false });
  const f = PBrowse.cleanFilters({ type: "video", tool: "Midjourney!", tag: "  Güzel Portre ", vars: 1 });
  assert.equal(f.type, "video"); assert.equal(f.tool, ""); assert.equal(f.tag, "güzel-portre"); assert.equal(f.vars, true);
  assert.equal(PBrowse.cleanFilters({ type: "x" }).type, "all");
  assert.equal(PBrowse.cleanFilters({ tool: "gpt-image" }).tool, "gpt-image");
  assert.equal(PBrowse.cleanFilters({ tag: "<script>" }).tag, "", "tehlikeli karakterli etiket atılır");
});

test("isDefault / sameFilters / activeCount", () => {
  assert.equal(PBrowse.isDefault({}), true);
  assert.equal(PBrowse.isDefault({ tag: "a" }), false);
  assert.equal(PBrowse.sameFilters({ type: "image" }, { type: "image", tool: "" }), true);
  assert.equal(PBrowse.sameFilters({ type: "image" }, { type: "text" }), false);
  assert.equal(PBrowse.activeCount({ type: "image", tool: "flux", tag: "x", vars: true }), 4);
  assert.equal(PBrowse.activeCount({}), 0);
});

test("searchArgs: yalnız dolu süzgeçler API'ye gider; geçersiz sıralama atılır; 'yalnız değişkenli' API'ye GİTMEZ", () => {
  const a = PBrowse.searchArgs({ type: "image", tool: "midjourney", tag: "portre", vars: true }, { query: " kedi ", sort: "popular", cursor: "c1" });
  assert.deepEqual({ ...a, tools: [...a.tools], tags: [...a.tags] }, { q: "kedi", contentType: "image", tools: ["midjourney"], tags: ["portre"], sort: "popular", cursor: "c1", limit: 25 });
  const b = PBrowse.searchArgs({}, { sort: "nonsense" });
  assert.equal(b.q, undefined); assert.equal(b.contentType, undefined); assert.equal(b.tools, undefined); assert.equal(b.sort, undefined);
  assert.equal("vars" in a, false);
});

test("clientFilter: 'yalnız değişkenli' değişkeni olmayanları eler", () => {
  const items = [{ id: "1", variableNames: ["a"] }, { id: "2", variableNames: [] }, { id: "3" }];
  assert.deepEqual(PBrowse.clientFilter(items, { vars: true }).map((i) => i.id), ["1"]);
  assert.equal(PBrowse.clientFilter(items, {}).length, 3);
});

test("cleanPrefs: bilinmeyen yoğunluk/süzgeç atılır, eksik alanlar varsayılan", () => {
  assert.deepEqual({ ...PBrowse.cleanPrefs(undefined), shown: [...PBrowse.cleanPrefs(undefined).shown] }, { density: "comfy", shown: ["type", "tool", "tag", "vars"] });
  const p = PBrowse.cleanPrefs({ density: "huge", shown: ["tool", "zzz", "type"] });
  assert.equal(p.density, "comfy"); assert.deepEqual([...p.shown], ["type", "tool"]);
  assert.equal(PBrowse.cleanPrefs({ density: "list" }).density, "list");
});

test("addView: ad temizlenir/kısaltılır, aynı ad (büyük-küçük harfsiz) reddedilir, en çok 12", () => {
  let views = [];
  const r1 = PBrowse.addView(views, { name: "  Midjourney   portre  ", tab: "discover", filters: { type: "image", tool: "midjourney" } }, "v1");
  assert.equal(r1.view.name, "Midjourney portre"); assert.equal(r1.view.id, "v1"); views = r1.views;
  assert.equal(PBrowse.addView(views, { name: "midjourney PORTRE", tab: "home", filters: {} }).error, "duplicate");
  assert.equal(PBrowse.addView(views, { name: "   ", tab: "home", filters: {} }).error, "empty");
  assert.equal(PBrowse.addView(views, { name: "x".repeat(80), tab: "home", filters: {} }, "L").view.name.length, 30);
  for (let i = 0; i < 11; i++) views = PBrowse.addView(views, { name: "v" + i, tab: "home", filters: {} }, "id" + i).views;
  assert.equal(views.length, 12);
  assert.equal(PBrowse.addView(views, { name: "fazla", tab: "home", filters: {} }).error, "full");
  assert.equal(PBrowse.removeView(views, "v1").length, 11);
  assert.equal(PBrowse.addView([], { name: "a", tab: "başka", filters: {} }).view.tab, "discover");
});

test("slotlar: en çok 5, aynı prompt tekrar eklenmez (yeniden sabitlenir), kaldırılır; yalnız gerekli alanlar saklanır", () => {
  let slots = [];
  for (let i = 0; i < 5; i++) slots = PBrowse.pinSlot(slots, { id: "p" + i, title: "T" + i, type: "text", source: "mine", secret: "saklanmaz" }).slots;
  assert.equal(slots.length, 5); assert.equal("secret" in slots[0], false);
  assert.equal(PBrowse.pinSlot(slots, { id: "yeni", title: "Y" }).error, "full");
  const again = PBrowse.pinSlot(slots, { id: "p0", title: "T0 yeni" });
  assert.equal(again.slots.length, 5); assert.equal(again.slots[4].title, "T0 yeni");
  assert.equal(PBrowse.isPinned(slots, "p3"), true);
  assert.equal(PBrowse.unpinSlot(slots, "p3").length, 4);
  assert.equal(slots[0].own, true, "kendi promptu (mine) own sayılır");
});

test("artOf: aynı kimlik aynı görsel, farklı kimlik çoğunlukla farklı; tür korunur", () => {
  const a = PBrowse.artOf({ id: "abc", type: "image" }), b = PBrowse.artOf({ id: "abc", type: "image" });
  assert.deepEqual({ ...a }, { ...b });
  assert.equal(a.kind, "image");
  const set = new Set(Array.from({ length: 20 }, (_, i) => PBrowse.artOf({ id: "k" + i }).bg));
  assert.ok(set.size > 3);
  assert.match(a.bg, /gradient/);
});

test("exportFile: sitenin 'promptly.prompts' biçimi; kendi içerik (kaynak atfı yok), değişkenler çıkarılır", () => {
  const f = PBrowse.exportFile([{ title: "A", text: "Merhaba {ad}", type: "text", tools: ["chatgpt"] }, { title: "B", text: "ikinci", type: "image" }], "2026-11-18T00:00:00.000Z");
  assert.equal(f.format, "promptly.prompts"); assert.equal(f.schemaVersion, 1); assert.equal(f.items.length, 2);
  assert.equal(f.items[0].variables[0].name, "ad"); assert.deepEqual([...f.items[0].tools], ["chatgpt"]);
  assert.equal("source" in f.items[0], false);
  assert.equal(f.items[1].contentType, "image");
  assert.equal(f.exportedAt, "2026-11-18T00:00:00.000Z");
});

test("seçim değişkeni: seçim / secim / selection adları tanınır, değer yalnız onlara yazılır", () => {
  assert.equal(PBrowse.usesSelection(["konu", "Seçim"]), true);
  assert.equal(PBrowse.usesSelection(["konu"]), false);
  assert.deepEqual({ ...PBrowse.selectionValues(["seçim", "konu", "selection"], "metin") }, { "seçim": "metin", selection: "metin" });
  const text = PVars.resolve("Özetle: {seçim} ({konu})", [], PBrowse.selectionValues(["seçim", "konu"], "uzun metin"));
  assert.equal(text, "Özetle: uzun metin ({konu})");
});
