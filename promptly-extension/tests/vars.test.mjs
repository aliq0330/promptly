import test from "node:test";
import assert from "node:assert";
import { loadExtension } from "./harness.mjs";
import { parseJson } from "../../src/lib/exchange/json.ts";
import { withSourceNote } from "../../src/lib/exchange/prompt-format.ts";

const { PVars } = loadExtension({ files: ["config.js", "shared/vars.js"] });
const plain = (v) => JSON.parse(JSON.stringify(v));

test("değişkenler: sıra korunur, tekrarlar bir kez, boşluklu ve boş jetonlar sayılmaz", () => {
  assert.deepEqual(plain(PVars.variablesOf("a {x} b {y} {x} {iki kelime} {}")), ["x", "y"]);
  assert.deepEqual(plain(PVars.variablesOf("")), []);
});

test("doldurma ve varsayılan: kullanıcı değeri > varsayılan > jeton olduğu gibi kalır", () => {
  assert.equal(PVars.fill("hi {x} {y}", { x: "1" }), "hi 1 {y}");
  assert.equal(PVars.resolve("{a}-{b}-{c}", [{ name: "a", defaultValue: "A" }, { name: "b", defaultValue: "B" }], { b: "kendi", c: "" }), "A-kendi-{c}");
});

test("otomatik değişken: [konu] ve {{konu}} dönüşür; [2], boş ve sayı kalıpları dokunulmaz", () => {
  const r = PVars.autoVariables("foo [Mekan Adı] bar {{ton}} [ ] [2] {{ }}");
  assert.equal(r.text, "foo {mekan_adı} bar {ton} [ ] [2] {{ }}");
  assert.deepEqual(plain(r.made), ["ton", "mekan_adı"]);
});

test("araç ve tür tahmini (katalog kimlikleri)", () => {
  assert.equal(PVars.guessTool("www.midjourney.com"), "midjourney");
  assert.equal(PVars.guessTool("claude.ai"), "claude");
  assert.equal(PVars.guessTool("example.org"), "");
  assert.equal(PVars.typeOfTool("suno"), "audio");
  assert.equal(PVars.typeOfTool("claude"), "text");
});

test("görsel yalnız herkese açık https adresinden yüklenir", () => {
  assert.equal(PVars.imageUploadable("https://cdn.example.com/a.png"), true);
  assert.equal(PVars.imageUploadable("http://cdn.example.com/a.png"), false);
  assert.equal(PVars.imageUploadable("https://cdn.example.com:8443/a.png"), false);
  assert.equal(PVars.imageUploadable("data:image/png;base64,AAAA"), false);
  assert.equal(PVars.imageUploadable("blob:https://x/1"), false);
  assert.equal(PVars.imageUploadable("not a url"), false);
});

test("slash yalnız alan boşken ya da boşluktan sonra tetiklenir", () => {
  assert.equal(PVars.slashAllowed(""), true);
  assert.equal(PVars.slashAllowed("merhaba "), true);
  assert.equal(PVars.slashAllowed("a\n"), true);
  assert.equal(PVars.slashAllowed("http:"), false);
  assert.equal(PVars.slashAllowed("1/"), false);
});

test("içe aktarma raporu okunur", () => {
  assert.equal(PVars.readImportReport({ items: [{ status: "ok", id: "u1" }] }).id, "u1");
  assert.equal(PVars.readImportReport({ items: [{ status: "duplicate" }] }).status, "duplicate");
  assert.deepEqual(plain(PVars.readImportReport({ items: [{ status: "invalid", field: "title", code: "required" }] })), { status: "invalid", field: "title", code: "required" });
  assert.equal(PVars.readImportReport({}).status, "unknown");
});

test("gönderilen dosyayı sitenin KENDİ ayrıştırıcısı kabul eder (kaynak + araç + etiket + değişken)", () => {
  const file = PVars.buildPromptsFile({
    title: "  Sisli orman  ", text: "Orman, {mekan} atmosferi, {mekan} {ton}", type: "image", tools: ["midjourney", "Bad Tool!", "flux"],
    tags: ["#Sinematik", "orman", "orman", "a,b<c>"], origin: "external", sourceUrl: "https://blog.example/orman?x=1", sourceTitle: "Orman promptları",
  }, "2026-11-18T00:00:00.000Z");
  const parsed = parseJson(JSON.stringify(file));
  assert.equal(parsed.fatal, undefined);
  assert.deepEqual(plain(parsed.issues), []);
  const [item] = parsed.items;
  assert.equal(item.title, "Sisli orman");
  assert.equal(item.contentType, "image");
  assert.deepEqual(plain(item.tools), ["midjourney", "flux"]);
  assert.deepEqual(plain(item.tags), ["sinematik", "orman"]);
  assert.deepEqual(plain(item.variables.map((v) => v.name)), ["mekan", "ton"]);
  assert.equal(item.source.url, "https://blog.example/orman?x=1");
  assert.match(item.source.credit, /blog\.example — Orman promptları/);
  // sunucu "Kaynak:" satırını açıklamaya yazar (atıf)
  assert.match(withSourceNote(item).description, /^Kaynak: blog\.example — Orman promptları https:\/\/blog\.example\/orman\?x=1/);
});

test("kendi prompt'um: kaynak yazılmaz; sınırlar uygulanır; geçersiz tür metne düşer", () => {
  const own = PVars.buildPromptsFile({ title: "", text: "Merhaba {ad}", type: "nonsense", origin: "own", sourceUrl: "https://x.example" });
  assert.equal(own.items[0].source, undefined);
  assert.equal(own.items[0].contentType, "text");
  assert.equal(own.items[0].title, "Merhaba {ad}");
  const big = PVars.buildPromptsFile({ title: "x".repeat(500), text: "t", tags: Array.from({ length: 40 }, (_, i) => "t" + i), tools: ["a", "b", "c", "d"], origin: "own" });
  assert.equal(big.items[0].title.length, 200);
  assert.equal(big.items[0].tags.length, 20);
  assert.equal(big.items[0].tools.length, 3);
  assert.deepEqual(plain(parseJson(JSON.stringify(big)).issues), []);
});

test("chrome:// gibi adreslerde kaynak adresi geçersizse yalnız ad yazılır", () => {
  const f = PVars.buildPromptsFile({ title: "t", text: "x", origin: "external", sourceUrl: "chrome://extensions", sourceTitle: "Uzantılar" });
  assert.equal(f.items[0].source.url, null);
  assert.equal(f.items[0].source.credit, "Uzantılar");
});
