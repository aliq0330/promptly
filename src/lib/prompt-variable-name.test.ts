import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNameCandidates, suggestNameFromText } from "./prompt-variable-name.ts";

test("suggestNameFromText: küçük harf, noktalama atılır, boşluk alt çizgi, ilk üç kelime", () => {
  assert.equal(suggestNameFromText("Kitsune"), "kitsune");
  assert.equal(suggestNameFromText("Ay ışığı!"), "ay_ışığı");
  assert.equal(suggestNameFromText("  bir iki üç dört  "), "bir_iki_üç");
  assert.equal(suggestNameFromText("{ortam}"), "ortam");
  assert.equal(suggestNameFromText("İstanbul Boğazı"), "istanbul_boğazı");
});

test("suggestNameFromText: harf/rakam yoksa boş, çıktı hep geçerli ad", () => {
  assert.equal(suggestNameFromText("!!! ???"), "");
  assert.equal(suggestNameFromText(""), "");
  const long = suggestNameFromText("a".repeat(80));
  assert.ok(long.length <= 40 && long.length > 0);
  assert.doesNotMatch(suggestNameFromText("a b {c}"), /[{}\s]/);
});

test("pickNameCandidates: tekilleştirir, alınmış adları ve boşları atar, sınır uygular", () => {
  const out = pickNameCandidates(["ışık stili", "ışık  stili", "", "Ortam", "!!", "Renk", "Duygu"], new Set(["renk"]), 3);
  assert.deepEqual(out, ["ışık_stili", "ortam", "duygu"]);
});
