import { test } from "node:test";
import assert from "node:assert/strict";
import { badgedTitle, stripBadge, tabBadgeLabel } from "./tab-badge.ts";

test("rozet etiketi: 99+ sınırı", () => {
  assert.equal(tabBadgeLabel(0), "0");
  assert.equal(tabBadgeLabel(7), "7");
  assert.equal(tabBadgeLabel(99), "99");
  assert.equal(tabBadgeLabel(100), "99+");
  assert.equal(tabBadgeLabel(-3), "0");
});

test("başlık: önek eklenir, güncellenir, kalkar; idempotent", () => {
  assert.equal(badgedTitle("Ana Sayfa · Promptly", 3), "(3) Ana Sayfa · Promptly");
  assert.equal(badgedTitle("(3) Ana Sayfa · Promptly", 3), "(3) Ana Sayfa · Promptly");
  assert.equal(badgedTitle("(3) Ana Sayfa · Promptly", 5), "(5) Ana Sayfa · Promptly");
  assert.equal(badgedTitle("(3) Ana Sayfa · Promptly", 0), "Ana Sayfa · Promptly");
  assert.equal(badgedTitle("Ana Sayfa · Promptly", 0), "Ana Sayfa · Promptly");
  assert.equal(badgedTitle("Ana Sayfa", 120), "(99+) Ana Sayfa");
  assert.equal(stripBadge("(99+) Ana Sayfa"), "Ana Sayfa");
  assert.equal(stripBadge("(abc) Başlık"), "(abc) Başlık", "sayı olmayan parantez bir rozet değildir");
});
