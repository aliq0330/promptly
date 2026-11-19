import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { definableOrphanNames, isDefinableTokenName, MAX_SUGGESTIONS, sanitizeSuggestions } from "./prompt-variables.ts";
import { normalizeVariable, parseStoredConfig } from "./prompt-variable-types.ts";

test("isDefinableTokenName: gerçek değişken adları geçer, JSON/kod parantezleri geçmez", () => {
  for (const ok of ["city", "time_of_day", "şehir", "hava_durumu", "Era-1980", "a", "x".repeat(40)]) assert.equal(isDefinableTokenName(ok), true, ok);
  for (const bad of ['"a": 1', "name: Ali", "a, b", "a b", "x".repeat(41), "1", "2024", "_", "--", "a=b", "path/to", "f(x)", "<tag>", "it's", "[0]"]) {
    assert.equal(isDefinableTokenName(bad), false, bad);
  }
});

test("definableOrphanNames: yalnız tanımsız + değişken adına benzeyenleri, ilk görünüş sırasıyla verir", () => {
  const text = 'A {city} at {time_of_day}, {city} again. JSON: {"a": 1} and {1} and {Number} {city}';
  assert.deepEqual(definableOrphanNames(text, []), ["city", "time_of_day", "Number"]);
  assert.deepEqual(definableOrphanNames(text, ["city"]), ["time_of_day", "Number"]);
  // tam eşleşme: jeton motoru ve unique (prompt_id, name) büyük/küçük harfe duyarlı
  assert.deepEqual(definableOrphanNames("{City}", ["city"]), ["City"]);
  assert.deepEqual(definableOrphanNames("no tokens here", []), []);
});

test("SQL kuralı (api_me_sync_draft_variables) istemci kuralıyla aynı karakterleri dışlar", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261211110000_api_me_sync_draft_variables.sql", import.meta.url), "utf8");
  const match = sql.match(/v_tok ~ '(\^\[\^\[:space:\][^']*(?:''[^']*)*\{1,40\}\$)'/);
  assert.ok(match, "definable-name regex found in the migration");
  const body = match[1].replace(/''/g, "'");
  for (const char of ["{", "}", '"', "'", "`", ":", ";", ",", "<", ">", "(", ")", "\\[", "\\]", "\\\\", "/", "="]) {
    assert.ok(body.includes(char), `SQL excludes ${char}`);
  }
  assert.match(sql, /v_tok !~ '\^\[0-9_-\]\+\$'/, "digits-only names are skipped in SQL too");
});

test("sanitizeSuggestions: kırpar, tekrar ve boşları atar, virgülü boşluğa çevirir, en çok 6 ve 80 karakter", () => {
  assert.deepEqual(sanitizeSuggestions([" Istanbul ", "", "Tokyo", "Tokyo", "Pa, ris", 5, null, "x".repeat(200)]), ["Istanbul", "Tokyo", "Pa ris", "x".repeat(80)]);
  assert.equal(sanitizeSuggestions(Array.from({ length: 20 }, (_, i) => `v${i}`)).length, MAX_SUGGESTIONS);
  assert.deepEqual(sanitizeSuggestions("Istanbul"), []);
  assert.deepEqual(sanitizeSuggestions(undefined), []);
});

test("örnek değerler yalnız metin değişkeninde saklanır ve kayıtta temizlenir", () => {
  const text = normalizeVariable({ type: "text", options: [], config: { suggestions: [" Istanbul", "", "Tokyo ", "Tokyo"] } }, "Istanbul");
  assert.deepEqual(text.spec.config, { suggestions: ["Istanbul", "Tokyo"] });
  assert.equal(text.defaultValue, "Istanbul");
  const empty = normalizeVariable({ type: "text", options: [], config: { suggestions: ["", " "] } }, "");
  assert.deepEqual(empty.spec.config, {}, "boş örnek listesi config'e yazılmaz → satır 'düz' kalır");
  const select = normalizeVariable({ type: "select", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], config: { suggestions: ["x"] } }, "a");
  assert.deepEqual(select.spec.config, {}, "seçim türünde örnek değer yok");
  assert.deepEqual(parseStoredConfig({ suggestions: ["a", 3, "b"], min: 1 }), { min: 1, suggestions: ["a", "b"] });
});
