import { test } from "node:test";
import assert from "node:assert/strict";
import { isDuplicable, planDuplicate } from "./space-clipboard.ts";
import type { SpaceConnection, SpaceItem } from "./supabase/spaces.ts";

const item = (id: string, over: Partial<SpaceItem> = {}): SpaceItem =>
  ({
    id, spaceId: "s", kind: "note", x: 100, y: 100, w: 200, h: 120, z: 1, groupId: "g1", promptId: null, mediaUrl: null, mediaWidth: null, mediaHeight: null,
    isDraft: false, sourcePromptId: null, contentType: null, contentId: null, paletteId: null, title: id, body: "b", note: "", color: "primary", attachedItemId: null,
    isPrivate: false, flowShowIo: true, flowShowLinks: true, flowShowRelations: true, sourceWorkflowId: "w", sourceStepId: "st", sourceRole: "step", sourceStepNo: 1,
    createdBy: null, updatedBy: null, createdAt: "", updatedAt: "", ...over,
  }) as SpaceItem;
const conn = (id: string, from: string, to: string): SpaceConnection =>
  ({ id, spaceId: "s", fromItemId: from, toItemId: to, label: "etiket", lineStyle: "dashed", arrow: "both", route: "elbow", color: "primary", sourceWorkflowId: "w", sourceRole: "flow", createdBy: null, createdAt: "" }) as SpaceConnection;

let n = 0;
const makeId = () => `new-${++n}`;

test("isDuplicable: yalnız not ve taslak prompt", () => {
  assert.ok(isDuplicable(item("a")));
  assert.ok(isDuplicable(item("b", { kind: "prompt", isDraft: true })));
  assert.ok(!isDuplicable(item("c", { kind: "prompt", isDraft: false, promptId: "p" })));
  for (const kind of ["image", "content", "palette"] as const) assert.ok(!isDuplicable(item("d", { kind })));
});

test("planDuplicate: konum kayar, kimlik yeni, grup ve workflow işareti kopyaya geçmez, z en üstte", () => {
  n = 0;
  const plan = planDuplicate([item("a"), item("b", { z: 2 })], [], ["a", "b"], { offset: { x: 32, y: 32 }, z: 50, makeId });
  assert.equal(plan.items.length, 2);
  assert.deepEqual(plan.items.map((i) => [i.x, i.y, i.z]), [[132, 132, 51], [132, 132, 52]]);
  assert.ok(plan.items.every((i) => i.groupId === null && i.sourceWorkflowId === undefined && i.sourceRole === undefined));
  assert.equal(new Set(plan.items.map((i) => i.id)).size, 2);
  assert.ok(plan.items.every((i) => i.id !== "a" && i.id !== "b"));
});

test("planDuplicate: kendi aralarındaki oklar kopyalanır, dışarıya giden kopyalanmaz", () => {
  n = 0;
  const plan = planDuplicate([item("a"), item("b"), item("c")], [conn("1", "a", "b"), conn("2", "b", "c")], ["a", "b"], { offset: { x: 8, y: 8 }, z: 0, makeId });
  assert.equal(plan.connections.length, 1);
  const [c] = plan.connections;
  assert.ok(c.fromItemId !== "a" && c.toItemId !== "b" && c.label === "etiket" && c.lineStyle === "dashed" && c.arrow === "both" && c.route === "elbow");
  assert.ok(plan.items.some((i) => i.id === c.fromItemId) && plan.items.some((i) => i.id === c.toItemId));
  assert.equal(c.sourceRole, undefined);
});

test("planDuplicate: atlananlar sayılır; iliştirilen not yalnız hedefle birlikte kopyalanırsa bağlı kalır", () => {
  n = 0;
  const target = item("t", { kind: "prompt", isDraft: true });
  const note = item("n1", { attachedItemId: "t" });
  const both = planDuplicate([target, note, item("img", { kind: "image" })], [], ["t", "n1", "img"], { offset: { x: 0, y: 0 }, z: 0, makeId });
  assert.equal(both.skipped, 1);
  const copiedNote = both.items.find((i) => i.kind === "note")!;
  assert.equal(copiedNote.attachedItemId, both.items.find((i) => i.kind === "prompt")!.id);
  const alone = planDuplicate([target, note], [], ["n1"], { offset: { x: 0, y: 0 }, z: 0, makeId });
  assert.equal(alone.items[0].attachedItemId, null);
});
