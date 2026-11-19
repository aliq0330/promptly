import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogFieldToVariable, uniqueVariableName } from "./prompt-variable-catalog.ts";


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
