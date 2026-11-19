import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanVariableName, variablesFromInput } from "./me-variables.ts";
import { PublicApiError } from "./rest.ts";

const bad = (input: unknown, pattern: RegExp) => assert.throws(() => variablesFromInput(input), (error: unknown) => error instanceof PublicApiError && pattern.test(error.message));

test("metin değişkeni: açıklama, varsayılan (= görselde kullanılan örnek) ve örnek değerler config.suggestions'a gider", () => {
  const [city] = variablesFromInput([{ name: "city", description: " Sahnenin şehri ", default_value: " Istanbul ", examples: ["Istanbul", "Tokyo", "Tokyo", "Paris", ""] }]);
  assert.deepEqual(city, { name: "city", description: "Sahnenin şehri", defaultValue: "Istanbul", type: "text", options: [], config: { suggestions: ["Istanbul", "Tokyo", "Paris"] } });
});

test("jeton parantezli verilirse temizlenir; varsayılan tür metin, varsayılan değer boş", () => {
  assert.equal(cleanVariableName("{city}"), "city");
  assert.equal(cleanVariableName("  weather "), "weather");
  assert.deepEqual(variablesFromInput([{ name: "{weather}" }])[0], { name: "weather", description: null, defaultValue: "", type: "text", options: [], config: {} });
  assert.deepEqual(variablesFromInput(undefined), []);
  assert.deepEqual(variablesFromInput(null), []);
});

test("seçim: varsayılan seçeneklerden biri olmalı — yoksa sessizce ilkine dönmez, açık hata verir", () => {
  const [pick] = variablesFromInput([{ name: "mood", type: "select", options: ["calm", "tense", "calm"], default_value: "tense" }]);
  assert.deepEqual(pick.options, [{ label: "calm", value: "calm" }, { label: "tense", value: "tense" }]);
  assert.equal(pick.defaultValue, "tense");
  assert.equal(variablesFromInput([{ name: "mood", type: "select", options: ["a", "b"] }])[0].defaultValue, "a");
  bad([{ name: "mood", type: "select", options: ["a", "b"], default_value: "c" }], /not one of its options/);
  bad([{ name: "mood", type: "select", options: ["only"] }], /at least 2/);
  const [multi] = variablesFromInput([{ name: "props", type: "multi_select", options: ["a", "b", "c"], default_value: "c, a" }]);
  assert.equal(multi.defaultValue, "a, c", "multi default follows option order");
});

test("sayı/kaydırıcı ve anahtar türleri doğrulanır", () => {
  assert.deepEqual(variablesFromInput([{ name: "n", type: "number", min: 1, max: 5, default_value: "3" }])[0].config, { min: 1, max: 5, step: 1 });
  bad([{ name: "n", type: "slider", min: 5, max: 1 }], /min must be below max/);
  bad([{ name: "n", type: "number", min: 0, max: 10, default_value: "99" }], /between 0 and 10/);
  const toggle = variablesFromInput([{ name: "rain", type: "toggle", on_text: "heavy rain", off_text: "" }])[0];
  assert.deepEqual([toggle.defaultValue, toggle.config], ["", { onText: "heavy rain", offText: "" }]);
  bad([{ name: "rain", type: "toggle" }], /on_text/);
  bad([{ name: "rain", type: "toggle", on_text: "x", off_text: "x" }], /differ/);
});

test("bozuk girdiler açık hata verir: ad, tekrar, tür, sınır", () => {
  bad("nope", /must be an array/);
  bad([null], /must be an object/);
  bad([{ name: "has space" }], /name must be/);
  bad([{ name: "a" }, { name: "a" }], /duplicate/);
  bad([{ name: "a", type: "weird" }], /type must be one of/);
  bad(Array.from({ length: 31 }, (_, i) => ({ name: `v${i}` })), /At most 30/);
  bad([{ name: "a", description: "x".repeat(501) }], /description/);
});
