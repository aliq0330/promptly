import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogFieldToVariable, uniqueVariableName } from "./prompt-variable-catalog.ts";
import {
  cleanVisionSuggestions,
  resolveVariableVisionValues,
  suggestionToVariable,
  variablesToVisionContext,
  type VisionVariable,
} from "./prompt-variable-vision.ts";
import type { GeneratorBuilderResult } from "./image-analysis-types.ts";

const opt = (label: string, value = label.toLowerCase()) => ({ label, value });

test("uniqueVariableName: çakışmada sonek, 40 karakter sınırı, boşsa varsayılan", () => {
  assert.equal(uniqueVariableName("Saç Rengi", new Set()), "Saç_Rengi");
  assert.equal(uniqueVariableName("Saç Rengi", new Set(["saç_rengi"])), "Saç_Rengi_2");
  assert.equal(uniqueVariableName("Saç Rengi", new Set(["saç_rengi", "saç_rengi_2"])), "Saç_Rengi_3");
  const long = uniqueVariableName("a".repeat(80), new Set(["a".repeat(40)]));
  assert.ok(long.length <= 40 && long.endsWith("_2"));
  assert.equal(uniqueVariableName(" {} ", new Set()), "degisken");
});

test("katalog select → select değişkeni; value = okunur ad; görsel/renk taşınmaz; ilk seçenek varsayılan", () => {
  const v = catalogFieldToVariable(
    {
      label: "Saç Şekli",
      type: "select",
      options: [
        { label: "Düz", value: "duz", image: "data:image/svg+xml;base64,AAA", color: "#fff" } as never,
        { label: "Kıvırcık", value: "kivircik" },
      ],
    },
    new Set(),
  );
  assert.equal(v.type, "select");
  assert.deepEqual(v.options.map((o) => o.value), ["Düz", "Kıvırcık"]);
  assert.ok(v.options.every((o) => !("image" in o) && !("color" in o)));
  assert.equal(v.defaultValue, "Düz");
});

test("katalog multi_select → varsayılan boş", () => {
  const v = catalogFieldToVariable({ label: "Aksesuar", type: "multi_select", options: [opt("Şapka"), opt("Gözlük")] }, new Set());
  assert.equal(v.type, "multi_select");
  assert.equal(v.defaultValue, "");
});

test("tek seçenekli seçim ve renk/metin tipleri düz metne iner", () => {
  assert.equal(catalogFieldToVariable({ label: "A", type: "select", options: [opt("x")] }, new Set()).type, "text");
  assert.equal(catalogFieldToVariable({ label: "Renk", type: "color", options: [] }, new Set()).type, "text");
  assert.equal(catalogFieldToVariable({ label: "Not", type: "textarea", options: [] }, new Set()).type, "text");
  assert.equal(catalogFieldToVariable({ label: "Link", type: "url", options: [] }, new Set()).type, "text");
});

test("number/slider aralıkla taşınır; bozuk aralık düz metne iner", () => {
  const n = catalogFieldToVariable({ label: "Yaş", type: "number", options: [], min: 1, max: 99, step: 1 }, new Set());
  assert.equal(n.type, "number");
  assert.equal(n.config.min, 1);
  assert.equal(n.config.max, 99);
  const bad = catalogFieldToVariable({ label: "Yaş", type: "slider", options: [], min: 5, max: 5 }, new Set());
  assert.equal(bad.type, "text");
  const none = catalogFieldToVariable({ label: "Yaş", type: "number", options: [] }, new Set());
  assert.equal(none.type, "text");
});

test("toggle/checkbox → toggle, açık metni alan adı", () => {
  const t = catalogFieldToVariable({ label: "HDR", type: "toggle", options: [] }, new Set());
  assert.equal(t.type, "toggle");
  assert.equal(t.config.onText, "HDR");
  assert.equal(catalogFieldToVariable({ label: "X", type: "checkbox", options: [] }, new Set()).type, "toggle");
});

test("aynı alan iki kez eklenince adlar çakışmaz", () => {
  const taken = new Set<string>();
  const a = catalogFieldToVariable({ label: "Stil", type: "text", options: [] }, taken);
  taken.add(a.name.toLowerCase());
  const b = catalogFieldToVariable({ label: "Stil", type: "text", options: [] }, taken);
  assert.notEqual(a.name.toLowerCase(), b.name.toLowerCase());
});

const vars: VisionVariable[] = [
  { name: "Saç_Rengi", type: "select", options: [opt("Kahverengi", "Kahverengi"), opt("Siyah", "Siyah")], config: {} },
  { name: "Aksesuar", type: "multi_select", options: [opt("Şapka", "Şapka"), opt("Gözlük", "Gözlük"), opt("Atkı", "Atkı")], config: {} },
  { name: "Yaş", type: "slider", options: [], config: { min: 1, max: 99, step: 1 } },
  { name: "HDR", type: "toggle", options: [], config: { onText: "HDR", offText: "" } },
  { name: "Ortam", type: "text", options: [], config: {} },
];

test("vision bağlamı: toggle hariç, slider number, seçenek adları gider", () => {
  const ctx = variablesToVisionContext(vars);
  assert.deepEqual(ctx.map((c) => c.key), ["Saç_Rengi", "Aksesuar", "Yaş", "Ortam"]);
  assert.equal(ctx.find((c) => c.key === "Yaş")?.type, "number");
  assert.deepEqual(ctx.find((c) => c.key === "Saç_Rengi")?.options, ["Kahverengi", "Siyah"]);
  assert.equal(ctx.find((c) => c.key === "Ortam")?.options, undefined);
});

test("vision değerleri: gerçek seçenekle eşleşir, icat edilen düşer, sayı aralığa sıkışır, çoklu sıra korunur", () => {
  const result: GeneratorBuilderResult = {
    mappedValues: {
      Saç_Rengi: "brown",
      Aksesuar: ["Gözlük", "Şapka", "uydurma"],
      Yaş: "250",
      Ortam: "Sahil kenarı",
      HDR: "true",
      Bilinmeyen: "x",
    },
    suggestedFields: [],
  };
  const out = Object.fromEntries(resolveVariableVisionValues(vars, result).map((m) => [m.name, m]));
  assert.equal(out["Saç_Rengi"].value, "Kahverengi");
  assert.equal(out["Aksesuar"].value, "Şapka, Gözlük");
  assert.equal(out["Yaş"].value, "99");
  assert.equal(out["Ortam"].value, "Sahil kenarı");
  assert.equal(out["HDR"], undefined);
  assert.equal(out["Bilinmeyen"], undefined);
  const bad = resolveVariableVisionValues(vars, { mappedValues: { Saç_Rengi: "mor" }, suggestedFields: [] });
  assert.equal(bad.length, 0);
});

test("öneriler: mevcut değişkenle çakışan atılır, geçerli olan değişkene çevrilir", () => {
  const result: GeneratorBuilderResult = {
    mappedValues: {},
    suggestedFields: [
      { label: "Saç Rengi", type: "text" },
      { label: "Işık", type: "select", options: ["Yumuşak", "Sert"] },
      { label: "Arka plan rengi", type: "color" },
    ],
  };
  const clean = cleanVisionSuggestions(result, vars);
  assert.deepEqual(clean.map((c) => c.label), ["Işık", "Arka plan rengi"]);
  const taken = new Set(vars.map((v) => v.name.toLowerCase()));
  const light = suggestionToVariable(clean[0], taken);
  assert.equal(light.type, "select");
  assert.deepEqual(light.options.map((o) => o.value), ["Yumuşak", "Sert"]);
  const bg = suggestionToVariable(clean[1], taken);
  assert.equal(bg.type, "text");
});
