import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalBadge, boardItemHref, boardProjects, groupBoard, memberRoleSummary } from "./team-center.ts";
import type { BoardItem } from "./supabase/team-center.ts";

const item = (over: Partial<BoardItem>): BoardItem => ({
  id: "i1",
  kind: "note",
  state: "pending",
  title: "T",
  body: "",
  note: null,
  mediaUrl: null,
  contentType: null,
  color: "",
  spaceId: "s1",
  projectId: "p1",
  projectTitle: "Bahar",
  fileId: "f1",
  fileTitle: "Afiş",
  authorId: "u1",
  authorName: "Elif",
  authorUsername: "elif",
  submittedAt: null,
  decidedAt: null,
  unit: null,
  unitCount: 1,
  canDecide: true,
  mine: false,
  ...over,
});

test("groupBoard: durumlara böler, paketi (unit) tek satıra indirir", () => {
  const cols = groupBoard([
    item({ id: "a", unit: "u1", unitCount: 3 }),
    item({ id: "b", unit: "u1", unitCount: 3 }),
    item({ id: "c", unit: "u1", unitCount: 3 }),
    item({ id: "d", state: "changes" }),
    item({ id: "e", state: "approved" }),
  ]);
  assert.deepEqual(cols.map((c) => [c.state, c.rows.length]), [["pending", 1], ["changes", 1], ["approved", 1]]);
  assert.equal(cols[0].rows[0].id, "a");
});

test("groupBoard: proje süzgeci yalnız o projenin satırlarını bırakır", () => {
  const cols = groupBoard([item({ id: "a" }), item({ id: "b", projectId: "p2", projectTitle: "Ürün" })], "p2");
  assert.equal(cols[0].rows.length, 1);
  assert.equal(cols[0].rows[0].id, "b");
});

test("boardProjects: onaylı satırlar süzgeç sayısına girmez, ada göre sıralı", () => {
  const list = boardProjects([item({ id: "a" }), item({ id: "b" }), item({ id: "c", projectId: "p0", projectTitle: "Aa", state: "changes" }), item({ id: "d", state: "approved" })]);
  assert.deepEqual(list, [{ id: "p0", title: "Aa", count: 1 }, { id: "p1", title: "Bahar", count: 2 }]);
});

test("boardItemHref: dosyadaki öğe dosya adresine, Ortak/ek pano öğesi alan adresine gider (item çekmeceyi açar)", () => {
  const file = boardItemHref("t1", { projectId: "p1", fileId: "f1", spaceId: "s1", id: "i1" });
  assert.ok(file.includes("project=p1") && file.includes("file=f1") && file.includes("item=i1") && !file.includes("board="));
  const area = boardItemHref("t1", { projectId: "p1", fileId: null, spaceId: "s9", id: "i1" });
  assert.ok(area.includes("board=s9") && area.includes("item=i1") && !area.includes("file="));
});

test("memberRoleSummary: sıfırları atar, lider > düzenleyici > görüntüleyici", () => {
  assert.deepEqual(memberRoleSummary({ leadCount: 2, editCount: 0, viewCount: 1 }), [{ role: "lead", count: 2 }, { role: "view", count: 1 }]);
  assert.deepEqual(memberRoleSummary({ leadCount: 0, editCount: 0, viewCount: 0 }), []);
  assert.deepEqual(memberRoleSummary(null), []);
});

test("approvalBadge: lider bekleyen kararları, diğerleri kendi değişiklik istenenlerini sayar", () => {
  assert.equal(approvalBadge([item({ id: "a" }), item({ id: "b" })]), 2);
  assert.equal(approvalBadge([item({ id: "a", canDecide: false, mine: true, state: "pending" }), item({ id: "b", canDecide: false, mine: true, state: "changes" })]), 1);
  assert.equal(approvalBadge([]), 0);
});
