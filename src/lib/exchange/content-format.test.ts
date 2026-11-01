import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_JSON_FORMAT,
  contentFileName,
  parseContent,
  serializeContent,
  toExchangePreset,
  toExchangeRequest,
  type ExchangePreset,
  type ExchangeRequest,
} from "./content-format.ts";

const request: ExchangeRequest = {
  title: "Neon poster",
  description: "Mor-turuncu bir sokak posteri",
  creativeDirection: "Blade Runner",
  contentType: "image",
  category: "poster",
  subcategory: null,
  tools: ["midjourney"],
  tags: ["neon", "poster"],
};
const preset: ExchangePreset = {
  title: "Sinematik",
  description: "Yumuşak ışık",
  contentType: "image",
  category: null,
  subcategory: null,
  tools: [],
  tags: ["portre"],
  selection: { lens: "35mm", tags: ["a", "b"], hdr: true, steps: 30 },
};

test("istek ve hazır ayar JSON zarfından aynen geri okunur (gidiş-dönüş)", () => {
  const r = parseContent("request", serializeContent("request", [request]));
  assert.equal(r.fatal, null);
  assert.deepEqual(r.items, [request]);
  const p = parseContent("preset", serializeContent("preset", [preset]));
  assert.equal(p.fatal, null);
  assert.deepEqual(p.items, [preset]);
});

test("zarf türü ve sürümü denetlenir: başka türün dosyası ve gelecekteki sürüm sessizce okunmaz", () => {
  const promptFile = JSON.stringify({ format: "promptly.prompts", schemaVersion: 1, items: [{ title: "x" }] });
  assert.equal(parseContent("request", promptFile).fatal, "unknown_format");
  assert.equal(parseContent("preset", serializeContent("request", [request])).fatal, "unknown_format");
  const future = JSON.stringify({ format: CONTENT_JSON_FORMAT.request, schemaVersion: 99, items: [] });
  assert.equal(parseContent("request", future).fatal, "unsupported_version");
  assert.equal(parseContent("request", "{bozuk").fatal, "invalid_json");
  assert.equal(parseContent("request", "  ").fatal, "empty");
});

test("çıplak dizi ve tek nesne de kabul edilir; 30'dan fazla kayıt reddedilir", () => {
  assert.equal(parseContent("request", JSON.stringify([request])).items.length, 1);
  assert.equal(parseContent("request", JSON.stringify(request)).items.length, 1);
  assert.equal(parseContent("request", JSON.stringify(Array.from({ length: 31 }, () => request))).fatal, "too_many_items");
});

test("istek kuralları: açıklama zorunlu, tür geçerli, yazar/durum/görünürlük alanları yok sayılır", () => {
  const { items, issues } = parseContent("request", JSON.stringify([
    { title: "a", description: "", contentType: "image" },
    { title: "b", description: "d", contentType: "gif" },
    { title: "c", description: "d", contentType: "TEXT", status: "published", visibility: "public", author_id: "x", like_count: 99, creative_direction: "yön" },
  ]));
  assert.deepEqual(issues.map((i) => [i.row, i.field, i.code]), [[1, "description", "required"], [2, "contentType", "invalid_content_type"]]);
  assert.equal(items.length, 1);
  assert.deepEqual(Object.keys(items[0]).sort(), ["category", "contentType", "creativeDirection", "description", "subcategory", "tags", "title", "tools"]);
  assert.equal(items[0].creativeDirection, "yön");
});

test("hazır ayar seçimi yalnız düz değer ve liste taşır; iç içe nesne ve aşırı büyük seçim reddedilir", () => {
  const bad = parseContent("preset", JSON.stringify([
    { title: "a", contentType: "image", selection: { x: { nested: 1 } } },
    { title: "b", contentType: "image", selection: [1, 2] },
    { title: "c", contentType: "image", selection: { list: [1, { a: 1 }] } },
    { title: "d", contentType: "image", selection: { big: "x".repeat(20001) } },
    { title: "e", contentType: "image" },
  ]));
  assert.deepEqual(bad.issues.map((i) => [i.row, i.code]), [[1, "invalid_selection"], [2, "invalid_selection"], [3, "invalid_selection"], [4, "too_long"], [5, "invalid_selection"]]);
  assert.equal(bad.items.length, 0);
  assert.equal(parseContent("preset", JSON.stringify([{ title: "x", contentType: "image", selection: {} }])).items.length, 1);
});

test("uzunluk, araç ve etiket kuralları prompt biçimiyle aynıdır", () => {
  const r = parseContent("request", JSON.stringify([
    { title: "t".repeat(201), description: "d", contentType: "image" },
    { title: "a", description: "d", contentType: "image", tools: ["a", "b", "c", "d"] },
    { title: "b", description: "d", contentType: "image", tools: ["Büyük Harf"] },
    { title: "c", description: "d", contentType: "image", tags: ["<script>"] },
  ]));
  assert.deepEqual(r.issues.map((i) => i.code), ["too_long", "too_many_tools", "invalid_tool", "invalid_tag"]);
  const p = parseContent("preset", JSON.stringify([{ title: "t".repeat(121), contentType: "image", selection: {} }]));
  assert.equal(p.issues[0]?.code, "too_long");
});

test("uygulama tiplerinden dışa aktarma: hazır ayarın kendi alanları dosyaya yazılmaz", () => {
  const exported = toExchangePreset({
    title: "P", description: "", contentType: "image", tags: [{ label: "x" }],
    selection: { lens: "35mm", "custom-field-id": "gizli", multi: ["a", "b"], bad: { a: 1 } },
    fields: [{ id: "custom-field-id" }],
  });
  assert.deepEqual(exported.selection, { lens: "35mm", multi: ["a", "b"] });
  assert.deepEqual(exported.tags, ["x"]);
  const req = toExchangeRequest({ title: "R", description: "d", creativeDirection: "", contentType: "audio", tags: [] });
  assert.equal(req.contentType, "audio");
  assert.equal(toExchangeRequest({ title: "R", description: "d", creativeDirection: "", contentType: "code", tags: [] }).contentType, "image");
});

test("dosya adı yalnız ASCII ve türe göre", () => {
  const date = new Date("2026-11-01T10:00:00Z");
  assert.equal(contentFileName("request", date), "promptly-requests-2026-11-01.json");
  assert.equal(contentFileName("preset", date), "promptly-presets-2026-11-01.json");
});
