import { test } from "node:test";
import assert from "node:assert/strict";
import { keyboardFrame, KEYBOARD_MIN_PX } from "./keyboard-frame.ts";

test("klavye yok: null (panel kendi CSS'inde kalır)", () => {
  assert.equal(keyboardFrame({ innerHeight: 844, viewportHeight: 844, viewportOffsetTop: 0 }), null);
});

test("adres çubuğu oynaması klavye sayılmaz", () => {
  assert.equal(keyboardFrame({ innerHeight: 844, viewportHeight: 844 - KEYBOARD_MIN_PX, viewportOffsetTop: 0 }), null);
});

test("klavye açık, sayfa kaydırılmamış: panel görünür alanın tepesinden yüksekliği kadar", () => {
  assert.deepEqual(keyboardFrame({ innerHeight: 844, viewportHeight: 480, viewportOffsetTop: 0 }), { top: 0, height: 480 });
});

test("iOS sayfayı yukarı kaydırdı (offsetTop > 0): panel görünür alana iner, başlık ekranda kalır", () => {
  assert.deepEqual(keyboardFrame({ innerHeight: 844, viewportHeight: 420.4, viewportOffsetTop: 210.6 }), { top: 211, height: 420 });
});

test("innerHeight klavyeyle küçülen tarayıcı (iOS 26): yine görünür alanın kendisi kullanılır, boşluk kalmaz", () => {
  // Eski formül innerHeight - height - offsetTop = 0 → panel ekranın altına yapışık kalırdı; yeni hesap görünür alanı izler.
  assert.deepEqual(keyboardFrame({ innerHeight: 600, viewportHeight: 400, viewportOffsetTop: 200 }), { top: 200, height: 400 });
});

test("bozuk değerler: null", () => {
  assert.equal(keyboardFrame({ innerHeight: 0, viewportHeight: 0, viewportOffsetTop: 0 }), null);
  assert.equal(keyboardFrame({ innerHeight: 844, viewportHeight: Number.NaN, viewportOffsetTop: 0 }), null);
});
