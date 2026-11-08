import test from "node:test";
import assert from "node:assert/strict";
import { changedExcerpt, diffLines, diffWords } from "./text-diff.ts";

test("aynı metin: yalnız aynı satırlar, değişiklik özeti boş", () => {
  const d = diffLines("a\nb", "a\nb");
  assert.deepEqual(d, [{ op: "same", text: "a" }, { op: "same", text: "b" }]);
  assert.deepEqual(changedExcerpt(d), []);
});

test("satır değişimi −/+ olarak gelir, çevresinden bir satır bağlam", () => {
  const d = diffLines("bir\niki\nüç\ndört\nbeş", "bir\niki\nüç!\ndört\nbeş");
  assert.deepEqual(
    d.filter((line) => line.op !== "same"),
    [{ op: "del", text: "üç" }, { op: "add", text: "üç!" }],
  );
  assert.deepEqual(changedExcerpt(d).map((line) => line.text), ["iki", "üç", "üç!", "dört"]);
});

test("ekleme ve silme", () => {
  assert.deepEqual(diffLines("a", "a\nb").map((l) => l.op), ["same", "add"]);
  assert.deepEqual(diffLines("a\nb", "b").map((l) => l.op), ["del", "same"]);
});

test("çok büyük girdi bellek patlatmaz: hepsi sil/ekle", () => {
  const big = Array.from({ length: 600 }, (_, i) => `l${i}`).join("\n");
  const d = diffLines(big, big + "\nx");
  assert.equal(d.filter((l) => l.op === "del").length, 600);
});


test("diffWords: değişmeyen kelimeler same, değişenler del/add; birleştirince iki metin geri gelir", () => {
  const before = "{marka} için 5 başlık yaz.";
  const after = "{marka} için {adet} başlık yaz. Ton: {ton}";
  const diff = diffWords(before, after);
  assert.equal(diff.filter((part) => part.op !== "add").map((part) => part.text).join(""), before);
  assert.equal(diff.filter((part) => part.op !== "del").map((part) => part.text).join(""), after);
  assert.ok(diff.some((part) => part.op === "del" && part.text.includes("5")));
  assert.ok(diff.some((part) => part.op === "add" && part.text.includes("{adet}")));
});

test("diffWords: aynı metinde yalnız same döner; boş girdide boş", () => {
  assert.deepEqual(diffWords("a b", "a b"), [{ op: "same", text: "a b" }]);
  assert.deepEqual(diffWords("", ""), []);
});
