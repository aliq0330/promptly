/**
 * Ortak prompt düzenleyicinin saf belge modeli — `npm test` (Node'un yerleşik
 * test koşucusu). `prompt-doc.ts` (normal değişkenler) test edilir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  backwardDeleteRange,
  countTokenUsages,
  forwardDeleteRange,
  insertToken,
  moveToken,
  moveTokenByWord,
  parseDoc,
  removeToken,
  renameToken,
  replaceRange,
  serializeDoc,
  snapSelectionToTokens,
  tokenRanges,
  tokenUsageMap,
} from "./prompt-doc.ts";

const SAMPLE = "Profesyonel bir {Stil} tarzında, {Konu} konulu bir görsel oluştur.";

// --- belge modeli -----------------------------------------------------------------

test("parseDoc: sıralı metin/jeton parçaları ve aralıklar", () => {
  const segments = parseDoc(SAMPLE);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ["text", "token", "text", "token", "text"],
  );
  assert.equal(segments[1].type === "token" && segments[1].name, "Stil");
  assert.equal(segments[3].type === "token" && segments[3].name, "Konu");
  for (const segment of segments) assert.equal(SAMPLE.slice(segment.start, segment.end).length, segment.end - segment.start);
});

test("serializeDoc(parseDoc(x)) === x (deterministik gidiş-dönüş)", () => {
  const samples = [
    "",
    "düz metin",
    SAMPLE,
    "{A}{B}{A}",
    "satır\n{Şehir}\nsonraki {Kıyafet Rengi} satır",
    "yarım { jeton ve } kapanış {tamam}",
    "{{çift}} ve {tek}",
    "İstanbul'da gün batımı {Işık}",
  ];
  for (const sample of samples) assert.equal(serializeDoc(parseDoc(sample)), sample);
});

test("boş metin parçası üretilmez; ardışık jetonlar tek tek ayrılır", () => {
  const segments = parseDoc("{A}{B}");
  assert.equal(segments.length, 2);
  assert.ok(segments.every((segment) => segment.type === "token"));
});

test("jeton adı boşluk ve Türkçe harf içerebilir, süslü parantez/satır sonu içeremez", () => {
  assert.deepEqual(tokenRanges("{Kıyafet Rengi} ve {ışık}").map((range) => range.name), ["Kıyafet Rengi", "ışık"]);
  assert.equal(tokenRanges("{a\nb}").length, 0);
  assert.equal(tokenRanges("{}").length, 0);
});

// --- jeton bölünmezliği -----------------------------------------------------------

test("snapSelectionToTokens: jetonun içine düşen uçlar jetonu tamamen kapsar", () => {
  const text = "ab {Stil} cd";
  // {Stil} = [3,9)
  assert.deepEqual(snapSelectionToTokens(text, 5, 5), { start: 3, end: 9 });
  assert.deepEqual(snapSelectionToTokens(text, 1, 5), { start: 1, end: 9 });
  assert.deepEqual(snapSelectionToTokens(text, 5, 11), { start: 3, end: 11 });
  assert.deepEqual(snapSelectionToTokens(text, 3, 3), { start: 3, end: 3 }); // sınır serbest
  assert.deepEqual(snapSelectionToTokens(text, 9, 9), { start: 9, end: 9 });
});

test("Backspace jetonun hemen sağında jetonun TAMAMINI siler, normal yerde null", () => {
  const text = "ab {Stil} cd";
  assert.deepEqual(backwardDeleteRange(text, 9, 9), { start: 3, end: 9 });
  assert.equal(backwardDeleteRange(text, 2, 2), null);
  assert.equal(backwardDeleteRange(text, 10, 10), null);
  assert.deepEqual(forwardDeleteRange(text, 3, 3), { start: 3, end: 9 });
  assert.equal(forwardDeleteRange(text, 9, 9), null);
  // seçim varsa seçim, jetonlara oturtularak
  assert.deepEqual(backwardDeleteRange(text, 1, 5), { start: 1, end: 9 });
});

// --- ekleme / değiştirme ----------------------------------------------------------

test("insertToken: imleç konumuna ekler, imleç jetonun arkasında kalır", () => {
  const result = insertToken("Bir görsel oluştur.", 4, 4, "Stil");
  assert.equal(result.text, "Bir {Stil}görsel oluştur.");
  assert.equal(result.cursor, 4 + "{Stil}".length);
});

test("insertToken: seçili metnin yerine geçer", () => {
  const text = "İstanbul’da gün batımı";
  const start = 0;
  const end = "İstanbul".length;
  const result = insertToken(text, start, end, "Şehir");
  assert.equal(result.text, "{Şehir}’da gün batımı");
});

test("insertToken: aynı alan birden çok yerde kullanılabilir", () => {
  let text = "";
  text = insertToken(text, 0, 0, "Stil").text;
  text = replaceRange(text, text.length, text.length, " ve ").text;
  text = insertToken(text, text.length, text.length, "Stil").text;
  assert.equal(text, "{Stil} ve {Stil}");
  assert.equal(countTokenUsages(text, "Stil"), 2);
  assert.equal(tokenUsageMap(text).get("Stil"), 2);
});

test("replaceRange sınırları güvenli kırpar", () => {
  assert.equal(replaceRange("abc", -5, 99, "X").text, "X");
  assert.equal(replaceRange("abc", 2, 1, "X").text, "abXc");
});

test("moveToken: jetonu başka konuma taşır (öne ve arkaya)", () => {
  const text = "a {X} b c";
  const token = tokenRanges(text)[0];
  assert.equal(moveToken(text, token, text.length).text, "a  b c{X}");
  assert.equal(moveToken(text, token, 0).text, "{X}a  b c");
  assert.equal(moveToken(text, token, token.start + 1).text, text); // kendi içine taşıma = no-op
});

test("moveTokenByWord: jetonu bir kelime sola/sağa taşır", () => {
  const text = "bir iki {X} üç dört";
  const token = tokenRanges(text)[0];
  const left = moveTokenByWord(text, token, "left");
  assert.equal(left?.text, "bir {X} iki üç dört");
  const right = moveTokenByWord(text, token, "right");
  assert.equal(right?.text, "bir iki üç {X} dört");
  assert.equal(right?.text.slice(right.token.start, right.token.end), "{X}");
  assert.equal(left?.text.slice(left.token.start, left.token.end), "{X}");
  // sınırlarda taşıma yok
  assert.equal(moveTokenByWord("{X} a", tokenRanges("{X} a")[0], "left"), null);
  assert.equal(moveTokenByWord("a {X}", tokenRanges("a {X}")[0], "right"), null);
});

// --- yeniden adlandırma / silme ---------------------------------------------------

test("renameToken yalnızca tam jetonu değiştirir", () => {
  const text = "{ortam} ve {ortam2} ve {ortam}";
  assert.equal(renameToken(text, "ortam", "mekan"), "{mekan} ve {ortam2} ve {mekan}");
  assert.equal(renameToken(text, "yok", "x"), text);
  assert.equal(renameToken(text, "ortam", "ortam"), text);
});

test("removeToken: jetonu ve fazla boşluğu toparlar, geri kalana dokunmaz", () => {
  assert.equal(removeToken("bir {X} iki", "X"), "bir iki");
  assert.equal(removeToken("bir {X}, iki", "X"), "bir, iki");
  assert.equal(removeToken("{X} bir iki", "X"), "bir iki");
  assert.equal(removeToken("bir iki {X}", "X"), "bir iki");
  assert.equal(removeToken("a  b {X} c   d", "X"), "a  b c   d"); // yazarın çift boşluğuna dokunmaz
  assert.equal(removeToken("{X} {Y} {X}", "X"), "{Y}");
});
