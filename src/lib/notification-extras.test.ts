import test from "node:test";
import assert from "node:assert/strict";
import { extrasPlan } from "./notification-extras.ts";

test("hiç ek yok: etiket de önizleme de yok", () => {
  assert.deepEqual(extrasPlan([]), { labelCount: null, previews: [] });
});

test("1 ek: '1 ek var' + o ekin önizlemesi", () => {
  assert.deepEqual(extrasPlan(["a"]), { labelCount: 1, previews: ["a"] });
});

test("2 ek: iki önizleme, etiket yok", () => {
  assert.deepEqual(extrasPlan(["a", "b"]), { labelCount: null, previews: ["a", "b"] });
});

test("3 ve fazlası: 'N ek var' + yalnız ilk ikisinin önizlemesi", () => {
  assert.deepEqual(extrasPlan(["a", "b", "c"]), { labelCount: 3, previews: ["a", "b"] });
  assert.deepEqual(extrasPlan(["a", "b", "c", "d", "e"]), { labelCount: 5, previews: ["a", "b"] });
});

test("ayrıntı (all): hepsi önizlenir, etiket yok", () => {
  assert.deepEqual(extrasPlan(["a", "b", "c"], true), { labelCount: null, previews: ["a", "b", "c"] });
  assert.deepEqual(extrasPlan(["a"], true), { labelCount: null, previews: ["a"] });
});
