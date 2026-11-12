import { test } from "node:test";
import assert from "node:assert/strict";
import { isKeyboardOpen } from "./keyboard-open.ts";

const base = { innerHeight: 844, viewportOffsetTop: 0 };

test("yazma alanında odak + görünür alan klavye kadar küçüldü: açık", () => {
  assert.equal(isKeyboardOpen({ ...base, viewportHeight: 520, focusedIsTextEntry: true }), true);
});

test("görünür alan küçüldü ama odak yazma alanında değil (düğme): klavye sayılmaz", () => {
  assert.equal(isKeyboardOpen({ ...base, viewportHeight: 520, focusedIsTextEntry: false }), false);
});

test("yazma alanında odak ama görünür alan küçülmedi (donanım klavyesi / masaüstü): kapalı", () => {
  assert.equal(isKeyboardOpen({ ...base, viewportHeight: 844, focusedIsTextEntry: true }), false);
});

test("adres çubuğu oynaması (eşik altı) klavye sayılmaz", () => {
  assert.equal(isKeyboardOpen({ ...base, viewportHeight: 844 - 100, focusedIsTextEntry: true }), false);
});

test("iOS sayfayı yukarı kaydırdı (offsetTop > 0): yine açık", () => {
  assert.equal(isKeyboardOpen({ innerHeight: 844, viewportHeight: 420, viewportOffsetTop: 220, focusedIsTextEntry: true }), true);
});
