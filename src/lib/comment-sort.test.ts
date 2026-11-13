import test from "node:test";
import assert from "node:assert/strict";
import { compareTopLevel, byCreatedAsc, DEFAULT_COMMENT_SORT } from "./comment-sort.ts";
import type { PromptComment } from "@/types";

function c(id: string, createdAt: string, likeCount = 0, pinnedAt: string | null = null): PromptComment {
  return { id, createdAt, likeCount, pinnedAt, parentId: null, body: id, editedAt: null, deletedAt: null } as unknown as PromptComment;
}

const a = c("a", "2026-11-01T10:00:00Z", 5);
const b = c("b", "2026-11-02T10:00:00Z", 1);
const d = c("d", "2026-11-03T10:00:00Z", 9);
const e = c("e", "2026-11-04T10:00:00Z", 5);
const ids = (list: PromptComment[]) => list.map((x) => x.id).join("");

test("the default sort is newest first", () => {
  assert.equal(DEFAULT_COMMENT_SORT, "newest");
  assert.equal(ids([a, b, d, e].sort(compareTopLevel("newest"))), "edba");
});

test("oldest is chronological and replies use the same ascending order", () => {
  assert.equal(ids([e, d, b, a].sort(compareTopLevel("oldest"))), "abde");
  assert.equal(ids([e, d, b, a].sort(byCreatedAsc)), "abde");
});

test("liked: most reactions first, ties newest first", () => {
  assert.equal(ids([a, b, d, e].sort(compareTopLevel("liked"))), "deab");
});

test("the pinned comment leads in EVERY sort, even when it is the oldest and least liked", () => {
  const pinned = c("p", "2026-10-01T10:00:00Z", 0, "2026-11-05T10:00:00Z");
  for (const sort of ["newest", "liked", "oldest"] as const) {
    assert.equal([a, b, d, e, pinned].sort(compareTopLevel(sort))[0].id, "p", sort);
  }
});

test("equal timestamps fall back to id so merged pages never reshuffle", () => {
  const x = c("x", "2026-11-01T10:00:00Z");
  const y = c("y", "2026-11-01T10:00:00Z");
  assert.equal(ids([x, y].sort(compareTopLevel("newest"))), "yx");
  assert.equal(ids([y, x].sort(compareTopLevel("oldest"))), "xy");
});
