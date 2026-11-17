import assert from "node:assert/strict";
import test from "node:test";
import { tabTarget } from "./modal-focus.ts";

test("tabTarget: listenin sonunda Tab başa, başında Shift+Tab sona döner", () => {
  assert.equal(tabTarget(3, 2, false), 0);
  assert.equal(tabTarget(3, 0, true), 2);
});

test("tabTarget: ortada tarayıcıya bırakılır", () => {
  assert.equal(tabTarget(3, 1, false), -1);
  assert.equal(tabTarget(3, 1, true), -1);
});

test("tabTarget: odak listede değilse (pencerenin kendisi ya da dışı) ilk/son öğeye alınır", () => {
  assert.equal(tabTarget(3, -1, false), 0);
  assert.equal(tabTarget(3, -1, true), 2);
});

test("tabTarget: tek öğede Tab ve Shift+Tab aynı öğede kalır", () => {
  assert.equal(tabTarget(1, 0, false), 0);
  assert.equal(tabTarget(1, 0, true), 0);
});

test("tabTarget: boş listede müdahale yok", () => {
  assert.equal(tabTarget(0, -1, false), -1);
});

import { nextRovingIndex } from "./modal-focus.ts";

test("nextRovingIndex: oklar sarar, Home/End uçlara gider", () => {
  assert.equal(nextRovingIndex(4, 3, "ArrowRight"), 0);
  assert.equal(nextRovingIndex(4, 0, "ArrowLeft"), 3);
  assert.equal(nextRovingIndex(4, 1, "ArrowRight"), 2);
  assert.equal(nextRovingIndex(4, 2, "Home"), 0);
  assert.equal(nextRovingIndex(4, 0, "End"), 3);
});

test("nextRovingIndex: ilgisiz tuş ve geçersiz odak null", () => {
  assert.equal(nextRovingIndex(4, 1, "ArrowDown"), null);
  assert.equal(nextRovingIndex(4, -1, "ArrowRight"), null);
  assert.equal(nextRovingIndex(0, 0, "Home"), null);
});
