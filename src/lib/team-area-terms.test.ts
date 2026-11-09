import assert from "node:assert/strict";
import { test } from "node:test";
import { rewriteAreaTerms } from "./team-area-terms.ts";

test("Türkçe: ek uyumu ile Space → alan", () => {
  assert.equal(rewriteAreaTerms("Bu Space'in etkinlik geçmişi yalnız üyelere açık.", "tr"), "Bu alanın etkinlik geçmişi yalnız üyelere açık.");
  assert.equal(rewriteAreaTerms("Öğe bu Space'ten kaldırılır.", "tr"), "Öğe bu alandan kaldırılır.");
  assert.equal(rewriteAreaTerms("Bu Space'te henüz görsel yok.", "tr"), "Bu alanda henüz görsel yok.");
  assert.equal(rewriteAreaTerms("Bu içerik bu Space'te zaten var.", "tr"), "Bu içerik bu alanda zaten var.");
  assert.equal(rewriteAreaTerms("\"{{title}}\" Space'ine erişimin biter.", "tr"), "\"{{title}}\" alanına erişimin biter.");
  assert.equal(rewriteAreaTerms("Space'e ekle", "tr"), "Alana ekle");
  assert.equal(rewriteAreaTerms("Space'i arşivledi", "tr"), "Alanı arşivledi");
  assert.equal(rewriteAreaTerms("Bir Space'te en çok 500 öğe olabilir.", "tr"), "Bir alanda en çok 500 öğe olabilir.");
});

test("Türkçe: çoğul, yalın ve cümle başı", () => {
  assert.equal(rewriteAreaTerms("Space'lerinde ara…", "tr"), "Alanlarında ara…");
  assert.equal(rewriteAreaTerms("Spaces'te keşfet", "tr"), "Alanlarda keşfet");
  assert.equal(rewriteAreaTerms("Boş Space", "tr"), "Boş alan");
  assert.equal(rewriteAreaTerms("Space adı gerekli. Space türü seç.", "tr"), "Alan adı gerekli. Alan türü seç.");
});

test("Space içermeyen metne dokunulmaz; klavye tuşu korunur", () => {
  assert.equal(rewriteAreaTerms("Görsel yükle", "tr"), "Görsel yükle");
  assert.equal(rewriteAreaTerms("Space + drag", "en"), "Space + drag");
});

test("İngilizce: Space → area, a/an", () => {
  assert.equal(rewriteAreaTerms("A Space can hold at most 500 items.", "en"), "An area can hold at most 500 items.");
  assert.equal(rewriteAreaTerms("Remove from Space", "en"), "Remove from area");
  assert.equal(rewriteAreaTerms("The Space's latest images", "en"), "The area's latest images");
  assert.equal(rewriteAreaTerms("Space settings", "en"), "Area settings");
  assert.equal(rewriteAreaTerms("Search your Spaces…", "en"), "Search your areas…");
});
