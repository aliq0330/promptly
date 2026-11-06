import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalStateOf, libraryVariableProblem, planLibraryFill } from "./space-library.ts";
import { SPACE_KINDS, SPACE_TEMPLATE_GROUPS, spaceCapabilities } from "./spaces.ts";

test("planLibraryFill: yazılan değer ekibin ortak değerini ezer, ortak değer boşlukları doldurur, geri kalan jeton olarak kalır", () => {
  const plan = planLibraryFill("Merhaba {musteri}, {marka} adına. {ton} bir dille yaz.", { marka: "Acme", ton: "Samimi" }, { musteri: "Ayşe", ton: "Resmî" });
  assert.deepEqual(plan.tokens, ["musteri", "marka", "ton"]);
  assert.deepEqual(plan.values, { musteri: "Ayşe", marka: "Acme", ton: "Resmî" });
  assert.deepEqual(plan.fromTeam, ["marka"]);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.text, "Merhaba Ayşe, Acme adına. Resmî bir dille yaz.");
});

test("planLibraryFill: değeri olmayan değişken eksik sayılır ve metinde AYNEN kalır; boş ortak değer 'yok' demektir", () => {
  const plan = planLibraryFill("{a} ve {b} ve {a}", { a: "", b: "B" });
  assert.deepEqual(plan.missing, ["a"]);
  assert.deepEqual(plan.fromTeam, ["b"]);
  assert.equal(plan.text, "{a} ve B ve {a}");
  const none = planLibraryFill("Değişken yok", { x: "y" });
  assert.deepEqual(none.tokens, []);
  assert.equal(none.text, "Değişken yok");
});

test("planLibraryFill: ortak değer jeton gibi görünse de yeniden çözülmez (tek geçiş)", () => {
  const plan = planLibraryFill("{a}", { a: "{b}", b: "x" });
  assert.equal(plan.text, "{b}");
});

test("libraryVariableProblem: ad jeton sözdizimini bozamaz, değer sınırlıdır, yinelenen ad reddedilir (düzenlerken kendi adı serbest)", () => {
  assert.equal(libraryVariableProblem("marka adı", "Acme", []), null);
  assert.equal(libraryVariableProblem("{ton}", "x", []), null);
  assert.equal(libraryVariableProblem("   ", "x", []), "name");
  assert.equal(libraryVariableProblem("a".repeat(41), "x", []), "name");
  assert.equal(libraryVariableProblem("ton", "x".repeat(501), []), "value");
  assert.equal(libraryVariableProblem("ton", "x", ["ton"]), "duplicate");
  assert.equal(libraryVariableProblem("ton", "yeni", ["ton"], "ton"), null);
});

test("approvalStateOf: yalnız kendi metnini taşıyan prompt taslağı onaylanabilir", () => {
  assert.equal(approvalStateOf({ kind: "prompt", isDraft: true, approvedAt: "2026-11-06T10:00:00Z" }), "approved");
  assert.equal(approvalStateOf({ kind: "prompt", isDraft: true, approvedAt: null }), "pending");
  assert.equal(approvalStateOf({ kind: "prompt", isDraft: false, approvedAt: null }), "none");
  assert.equal(approvalStateOf({ kind: "note", isDraft: false }), "none");
});

test("ekip kütüphanesi: yalnız sahip onaylar (arşivde kimse), her tür şablon grubu taşır", () => {
  assert.ok(spaceCapabilities("owner", false).approve);
  assert.ok(!spaceCapabilities("editor", false).approve);
  assert.ok(!spaceCapabilities("viewer", false).approve);
  assert.ok(!spaceCapabilities("owner", true).approve);
  assert.ok(SPACE_KINDS.includes("team_library"));
  for (const kind of SPACE_KINDS) assert.ok(SPACE_TEMPLATE_GROUPS[kind].length > 0, kind);
});
