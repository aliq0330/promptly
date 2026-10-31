/**
 * Tam ekran "Değişkene dönüştür" düğmesinin hedef kararı (`prompt-word-target.ts`) — `npm test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { findConvertTarget, suggestVariableName } from "./prompt-word-target.ts";

const TEXT = "Design a red wooden covered bridge for {Şehir_adı}. It is calm.";

function at(needle: string, offset = 0): number {
  const index = TEXT.indexOf(needle);
  assert.ok(index >= 0, `fixture: ${needle}`);
  return index + offset;
}

test("imleç kelimenin ortasındayken kelimenin tamamı hedeftir", () => {
  const caret = at("bridge", 3);
  assert.deepEqual(findConvertTarget(TEXT, caret, caret), {
    kind: "word",
    start: at("bridge"),
    end: at("bridge") + "bridge".length,
    text: "bridge",
  });
});

test("imleç kelimenin başında ya da sonunda da o kelimeyi yakalar", () => {
  const start = at("bridge");
  const end = start + "bridge".length;
  assert.equal(findConvertTarget(TEXT, start, start).kind, "word");
  assert.equal(findConvertTarget(TEXT, end, end).kind, "word");
  const atEnd = findConvertTarget(TEXT, end, end);
  assert.equal(atEnd.kind === "word" && atEnd.text, "bridge");
});

test("seçim varsa seçilen metin hedeftir, baş/son boşluklar kırpılır", () => {
  const start = at(" covered bridge ");
  const end = start + " covered bridge ".length;
  const target = findConvertTarget(TEXT, start, end);
  assert.equal(target.kind, "selection");
  assert.equal(target.kind === "selection" && target.text, "covered bridge");
  // Ters yönde yapılan seçim aynı sonucu verir.
  assert.deepEqual(findConvertTarget(TEXT, end, start), target);
});

test("yalnızca boşluk seçiliyse hedef yok", () => {
  const space = at("red wooden") + 3;
  assert.equal(findConvertTarget(TEXT, space, space + 1).kind, "none");
});

test("boşlukta ve noktalamada hedef yok", () => {
  const afterDot = at("calm.") + "calm.".length;
  assert.equal(findConvertTarget(TEXT, afterDot, afterDot).kind, "none");
  assert.equal(findConvertTarget("", 0, 0).kind, "none");
  assert.equal(findConvertTarget("a  b", 2, 2).kind, "none");
});

test("imleç jetonun içinde ya da yanındayken hedef jetondur", () => {
  const token = "{Şehir_adı}";
  const start = at(token);
  const end = start + token.length;
  const expected = { kind: "token", start, end, name: "Şehir_adı" };
  assert.deepEqual(findConvertTarget(TEXT, start + 4, start + 4), expected);
  assert.deepEqual(findConvertTarget(TEXT, end, end), expected);
  assert.deepEqual(findConvertTarget(TEXT, start, end), expected);
});

test("seçimde süslü parantez varsa dönüştürme engellenir", () => {
  const start = at("for {Şehir_adı}");
  assert.equal(findConvertTarget(TEXT, start, start + "for {Şehir".length).kind, "blocked");
});

test("Türkçe ek ve kesme işareti kelimeyi bölmez ama ayraç olur", () => {
  const text = "Adana'da hava güzel";
  const caret = 2;
  const target = findConvertTarget(text, caret, caret);
  assert.equal(target.kind === "word" && target.text, "Adana");
  const second = findConvertTarget(text, 7, 7);
  assert.equal(second.kind === "word" && second.text, "da");
  const turkish = findConvertTarget("İstanbul ışığı", 11, 11);
  assert.equal(turkish.kind === "word" && turkish.text, "ışığı");
});

test("imleç ve seçim sınırları metnin dışına taşmaz", () => {
  assert.equal(findConvertTarget("abc", -4, 99).kind, "selection");
  assert.equal(findConvertTarget("abc", 50, 50).kind, "word");
});

test("suggestVariableName: kelimeden geçerli ad üretir", () => {
  assert.equal(suggestVariableName("bridge"), "Bridge");
  assert.equal(suggestVariableName("covered bridge"), "Covered_bridge");
  assert.equal(suggestVariableName("  ışık stili!  "), "Işık_stili");
  assert.equal(suggestVariableName("Şehir"), "Şehir");
  assert.equal(suggestVariableName("a b c d e"), "A_b_c");
  assert.equal(suggestVariableName("!!!"), "");
  assert.equal(suggestVariableName("   "), "");
});

test("suggestVariableName: ad 40 karakteri aşmaz ve geçerlidir", () => {
  const name = suggestVariableName("supercalifragilisticexpialidocious pneumonoultramicroscopicsilicovolcanoconiosis");
  assert.ok(name.length <= 40);
  assert.ok(!/[{}\s]/.test(name));
  assert.ok(!name.endsWith("_"));
});
