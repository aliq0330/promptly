import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampToRange,
  convertSpec,
  defaultConfigFor,
  emptySpec,
  isToggleOn,
  normalizeVariable,
  numericRange,
  parseMultiValue,
  parseStoredConfig,
  parseStoredOptions,
  parseStoredType,
  sanitizeOptions,
  toggleMultiValue,
  toggleValue,
  validateSpec,
} from "./prompt-variable-types.ts";
import { resolvePromptText } from "./prompt-variables.ts";

const WEATHER = [
  { label: "Güneşli", value: "sunny" },
  { label: "Yağmurlu", value: "rainy" },
  { label: "Karlı", value: "snowy" },
];

test("sanitizeOptions: boş, tekrar ve virgülü temizler; value boşsa label olur", () => {
  const out = sanitizeOptions([
    { label: "  Güneşli ", value: "" },
    { label: "", value: "x" },
    { label: "Yağmurlu", value: "rainy" },
    { label: "Yağmur 2", value: "rainy" },
    { label: "A, B", value: "a, b" },
  ]);
  assert.deepEqual(out, [
    { label: "Güneşli", value: "Güneşli" },
    { label: "Yağmurlu", value: "rainy" },
    { label: "A, B", value: "a b" },
  ]);
});

test("sanitizeOptions: en fazla 50 seçenek", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ label: `o${i}`, value: `o${i}` }));
  assert.equal(sanitizeOptions(many).length, 50);
});

test("toggleMultiValue: sonuç seçenek sırasını izler, tıklama sırasını değil", () => {
  let value = "";
  value = toggleMultiValue(value, "snowy", WEATHER);
  value = toggleMultiValue(value, "sunny", WEATHER);
  assert.equal(value, "sunny, snowy");
  value = toggleMultiValue(value, "sunny", WEATHER);
  assert.equal(value, "snowy");
  value = toggleMultiValue(value, "snowy", WEATHER);
  assert.equal(value, "");
});

test("parseMultiValue", () => {
  assert.deepEqual(parseMultiValue("a, b,c ,, "), ["a", "b", "c"]);
  assert.deepEqual(parseMultiValue(""), []);
});

test("normalizeVariable select: geçersiz varsayılan ilk seçeneğe düşer", () => {
  const { spec, defaultValue } = normalizeVariable({ type: "select", options: WEATHER, config: {} }, "nope");
  assert.equal(defaultValue, "sunny");
  assert.equal(spec.options.length, 3);
  const kept = normalizeVariable({ type: "select", options: WEATHER, config: {} }, "rainy");
  assert.equal(kept.defaultValue, "rainy");
});

test("normalizeVariable multi_select: yalnızca geçerli seçenekler kalır", () => {
  const { defaultValue } = normalizeVariable({ type: "multi_select", options: WEATHER, config: {} }, "snowy, ghost, sunny");
  assert.equal(defaultValue, "sunny, snowy");
});

test("normalizeVariable text: seçenekleri ve ayarları temizler", () => {
  const { spec, defaultValue } = normalizeVariable({ type: "text", options: WEATHER, config: { min: 1 } }, "merhaba");
  assert.deepEqual(spec, { type: "text", options: [], config: {} });
  assert.equal(defaultValue, "merhaba");
});

test("normalizeVariable number/slider: aralığa sıkıştırır ve adıma oturtur", () => {
  const num = normalizeVariable({ type: "number", options: [], config: { min: 0, max: 10, step: 2 } }, "7");
  assert.equal(num.defaultValue, "8");
  const over = normalizeVariable({ type: "slider", options: [], config: { min: 0, max: 10, step: 1 } }, "99");
  assert.equal(over.defaultValue, "10");
  const blank = normalizeVariable({ type: "slider", options: [], config: { min: 5, max: 10, step: 1 } }, "");
  assert.equal(blank.defaultValue, "5");
  const garbage = normalizeVariable({ type: "number", options: [], config: { min: 0, max: 10, step: 1 } }, "abc");
  assert.equal(garbage.defaultValue, "0");
});

test("clampToRange: ondalık adımda float gürültüsü olmaz", () => {
  assert.equal(clampToRange(0.3, { min: 0, max: 1, step: 0.1 }), 0.3);
  assert.equal(clampToRange(0.7000001, { min: 0, max: 1, step: 0.1 }), 0.7);
});

test("numericRange: bozuk ayar güvenli varsayılana düşer", () => {
  assert.deepEqual(numericRange({ min: 10, max: 5, step: -1 }), { min: 10, max: 10, step: 1 });
  assert.deepEqual(numericRange({}), { min: 0, max: 100, step: 1 });
});

test("toggle: açık/kapalı metni ve durum tespiti", () => {
  const config = { onText: "sinematik", offText: "" };
  assert.equal(toggleValue(true, config), "sinematik");
  assert.equal(toggleValue(false, config), "");
  assert.equal(isToggleOn("sinematik", config), true);
  assert.equal(isToggleOn("", config), false);
  const { defaultValue } = normalizeVariable({ type: "toggle", options: [], config }, "başka");
  assert.equal(defaultValue, "");
});

test("validateSpec", () => {
  assert.equal(validateSpec({ type: "text", options: [], config: {} }), null);
  assert.equal(validateSpec({ type: "select", options: [WEATHER[0]], config: {} }), "optionsTooFew");
  assert.equal(validateSpec({ type: "select", options: WEATHER, config: {} }), null);
  assert.equal(validateSpec({ type: "number", options: [], config: { min: 5, max: 5 } }), "rangeInvalid");
  assert.equal(validateSpec({ type: "slider", options: [], config: { min: 0, max: 10 } }), null);
  assert.equal(validateSpec({ type: "toggle", options: [], config: { onText: "", offText: "x" } }), "toggleOnEmpty");
  assert.equal(validateSpec({ type: "toggle", options: [], config: { onText: "x", offText: "x" } }), "toggleSame");
  assert.equal(validateSpec({ type: "toggle", options: [], config: { onText: "x", offText: "" } }), null);
});

test("stored JSON okuma: bozuk veri güvenle boşa düşer", () => {
  assert.deepEqual(parseStoredOptions(null), []);
  assert.deepEqual(parseStoredOptions("x"), []);
  assert.deepEqual(parseStoredOptions([{ label: "a", value: "b" }, { label: 1 }, null]), [{ label: "a", value: "b" }]);
  assert.deepEqual(parseStoredConfig([1, 2]), {});
  assert.deepEqual(parseStoredConfig({ min: 1, max: "x", onText: "k", foo: 1 }), { min: 1, onText: "k" });
  assert.equal(parseStoredType("slider"), "slider");
  assert.equal(parseStoredType("zzz"), "text");
  assert.equal(parseStoredType(undefined), "text");
});

test("emptySpec/defaultConfigFor", () => {
  assert.deepEqual(emptySpec().config, {});
  assert.deepEqual(defaultConfigFor("slider"), { min: 0, max: 100, step: 1 });
  assert.deepEqual(defaultConfigFor("toggle"), { onText: "", offText: "" });
});

test("entegrasyon: tipli değerler {ad} motorunda düz string olarak çözülür", () => {
  const text = "Hava {hava}, ışık {isik} ve {derin} {sinematik}.";
  const resolved = resolvePromptText(text, {
    hava: toggleMultiValue("", "rainy", WEATHER),
    isik: "sunny, snowy",
    derin: String(clampToRange(42, { min: 0, max: 100, step: 1 })),
    sinematik: toggleValue(true, { onText: "sinematik", offText: "" }),
  });
  assert.equal(resolved, "Hava rainy, ışık sunny, snowy ve 42 sinematik.");
});

test("convertSpec: metin → seçenekli, seçili metin ilk seçenek olur", () => {
  const r = convertSpec({ spec: emptySpec("text"), defaultValue: "İstanbul" }, "select");
  assert.equal(r.spec.type, "select");
  assert.deepEqual(r.spec.options[0], { label: "İstanbul", value: "İstanbul" });
  assert.equal(r.defaultValue, "İstanbul");
  assert.ok(r.spec.options.length >= 2);
  const seeded = convertSpec({ spec: emptySpec("text"), defaultValue: "" }, "multi_select", "Paris");
  assert.deepEqual(seeded.spec.options[0], { label: "Paris", value: "Paris" });
});

test("convertSpec: boş metinden seçenekliye iki boş satır", () => {
  const r = convertSpec({ spec: emptySpec("text"), defaultValue: "" }, "select");
  assert.equal(r.spec.options.length, 2);
  assert.equal(r.defaultValue, "");
});

test("convertSpec: seçenekli ↔ çoklu seçenekler korunur", () => {
  const r = convertSpec({ spec: { type: "select", options: WEATHER, config: {} }, defaultValue: "rainy" }, "multi_select");
  assert.deepEqual(r.spec.options, WEATHER);
  const back = convertSpec({ spec: r.spec, defaultValue: "rainy, snowy" }, "select");
  assert.equal(back.defaultValue, "rainy");
});

test("convertSpec: sayısal ve aç/kapa dönüşümleri", () => {
  const n = convertSpec({ spec: emptySpec("text"), defaultValue: "42" }, "number");
  assert.equal(n.defaultValue, "42");
  assert.deepEqual(n.spec.config, { min: 0, max: 100, step: 1 });
  const nan = convertSpec({ spec: emptySpec("text"), defaultValue: "abc" }, "slider");
  assert.equal(nan.defaultValue, "0");
  const t = convertSpec({ spec: emptySpec("text"), defaultValue: "sinematik" }, "toggle");
  assert.deepEqual(t.spec.config, { onText: "sinematik", offText: "" });
  assert.equal(t.defaultValue, "");
  const text = convertSpec({ spec: { type: "select", options: WEATHER, config: {} }, defaultValue: "rainy" }, "text");
  assert.equal(text.defaultValue, "rainy");
  assert.deepEqual(text.spec.options, []);
});

test("convertSpec: aynı tip değişmeden döner", () => {
  const same = { spec: emptySpec("text"), defaultValue: "x" };
  assert.equal(convertSpec(same, "text"), same);
});
