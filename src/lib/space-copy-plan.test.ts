import test from "node:test";
import assert from "node:assert/strict";
import { commentsAllowedFor, planCopy, type PlanItem, type PlanPin } from "./space-copy-plan.ts";

const items: PlanItem[] = [
  { id: "n1", kind: "note", isPrivate: false },
  { id: "n2", kind: "note", isPrivate: false },
  { id: "n3", kind: "note", isPrivate: true },
  { id: "fr", kind: "frame", isPrivate: false },
  { id: "sh", kind: "shape", isPrivate: false },
  { id: "im", kind: "image", isPrivate: false },
];
const pins: PlanPin[] = [
  { id: "c1", parentId: null, itemId: "n1" },
  { id: "c1r", parentId: "c1", itemId: null },
  { id: "c2", parentId: null, itemId: null },
  { id: "c3", parentId: null, itemId: "n3" },
  { id: "c3r", parentId: "c3", itemId: null },
  { id: "c4", parentId: null, itemId: "ghost" },
];

test("tüm Space → yeni Space: gizli not düşer, çizimler ve yorumlar gelir", () => {
  const plan = planCopy(items, pins, null, "newSpace");
  assert.equal(plan.total, 6);
  assert.equal(plan.privateNotes, 1);
  assert.equal(plan.drawings, 0);
  assert.equal(plan.copyable, 5);
  assert.deepEqual([plan.commentRoots, plan.commentReplies, plan.commentsSkippedPrivate], [2, 1, 2]);
});

test("ekip dosyasının ana alanı: çizimler gitmez, yorum izni yok", () => {
  const plan = planCopy(items, pins, null, "teamFile");
  assert.equal(plan.drawings, 2);
  assert.equal(plan.copyable, 3);
  assert.equal(plan.commentsAllowed, false);
  assert.deepEqual([plan.commentRoots, plan.commentReplies], [0, 0]);
  assert.equal(commentsAllowedFor("teamNew"), true);
});

test("seçimle kopyalama: yalnız seçilen öğelerin yorumları; serbest yorum gelmez; gizli seçilirse yorumu atlanır", () => {
  const plan = planCopy(items, pins, ["n1", "n3"], "teamNew");
  assert.equal(plan.total, 2);
  assert.equal(plan.copyable, 1);
  assert.deepEqual([plan.commentRoots, plan.commentReplies, plan.commentsSkippedPrivate], [1, 1, 2]);
});

test("boş seçim = tümü; görünmeyen öğeye bağlı yorum sayılmaz", () => {
  assert.equal(planCopy(items, pins, [], "space").total, 6);
  assert.equal(planCopy(items, [{ id: "x", parentId: null, itemId: "ghost" }], null, "space").commentRoots, 0);
});
