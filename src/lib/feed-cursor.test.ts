import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareFeedRows,
  compareTimestamps,
  feedOrderForSort,
  feedSortRank,
  isAfterCursor,
  nextFeedCursor,
  type FeedCursor,
  type FeedOrder,
} from "./feed-cursor.ts";

const row = (rank: number, createdAt: string, id: string): FeedCursor => ({ rank, createdAt, id });

/** Mirrors `public.feed_page` over an in-memory table: filter by the cursor predicate, sort, take `limit`. */
function page(rows: FeedCursor[], order: FeedOrder, limit: number, cursor: FeedCursor | null): FeedCursor[] {
  return rows
    .filter((r) => !cursor || isAfterCursor(order, r, cursor))
    .sort((a, b) => compareFeedRows(order, a, b))
    .slice(0, limit);
}

function walk(rows: FeedCursor[], order: FeedOrder, limit: number): FeedCursor[] {
  const seen: FeedCursor[] = [];
  let cursor: FeedCursor | null = null;
  for (let guard = 0; guard < 1000; guard++) {
    const batch = page(rows, order, limit, cursor);
    seen.push(...batch);
    cursor = nextFeedCursor(batch.map((r) => ({ id: r.id, created_at: r.createdAt, sort_rank: r.rank })), limit);
    if (!cursor) return seen;
  }
  throw new Error("cursor never terminated");
}

// Many ties on rank and on created_at, so only `id` can separate some rows.
const dataset: FeedCursor[] = Array.from({ length: 53 }, (_, i) =>
  row(i % 4, `2026-09-19T10:00:0${i % 3}.000000+00:00`, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
);

test("oldest: the cursor predicate is ascending (>), not the descending <", () => {
  const cursor = row(0, "2026-09-19T10:00:05.000000+00:00", "b");
  assert.equal(isAfterCursor("oldest", row(0, "2026-09-19T10:00:06.000000+00:00", "a"), cursor), true);
  assert.equal(isAfterCursor("oldest", row(0, "2026-09-19T10:00:04.000000+00:00", "z"), cursor), false);
  assert.equal(isAfterCursor("newest", row(0, "2026-09-19T10:00:04.000000+00:00", "z"), cursor), true);
  assert.equal(isAfterCursor("newest", row(0, "2026-09-19T10:00:06.000000+00:00", "a"), cursor), false);
});

test("a row equal to the cursor is never 'after' it (no repeat across pages)", () => {
  const cursor = row(3, "2026-09-19T10:00:00.000000+00:00", "x");
  for (const order of ["newest", "popular", "oldest", "used", "recommended", "proven"] as const) assert.equal(isAfterCursor(order, { ...cursor }, cursor), false);
});

test("oldest: equal timestamps are separated by id ascending", () => {
  const at = "2026-09-19T10:00:00.000000+00:00";
  assert.equal(isAfterCursor("oldest", row(0, at, "b"), row(0, at, "a")), true);
  assert.equal(isAfterCursor("oldest", row(0, at, "a"), row(0, at, "b")), false);
});

test("popular: like_count descending first, then created_at and id descending", () => {
  const at = "2026-09-19T10:00:00.000000+00:00";
  const cursor = row(5, at, "m");
  assert.equal(isAfterCursor("popular", row(4, "2026-09-19T11:00:00.000000+00:00", "z"), cursor), true, "lower rank is after, even if newer");
  assert.equal(isAfterCursor("popular", row(6, "2026-09-19T09:00:00.000000+00:00", "a"), cursor), false, "higher rank is before");
  assert.equal(isAfterCursor("popular", row(5, "2026-09-19T09:59:59.000000+00:00", "z"), cursor), true, "same rank: older is after");
  assert.equal(isAfterCursor("popular", row(5, at, "a"), cursor), true, "same rank and time: smaller id is after");
  assert.equal(isAfterCursor("popular", row(5, at, "z"), cursor), false);
});

for (const order of ["newest", "popular", "oldest", "used", "recommended", "proven"] as const) {
  for (const limit of [1, 7, 10, 50]) {
    test(`${order}: walking pages of ${limit} returns every row once, in order`, () => {
      const seen = walk(dataset, order, limit);
      assert.equal(seen.length, dataset.length);
      assert.equal(new Set(seen.map((r) => r.id)).size, dataset.length);
      for (let i = 1; i < seen.length; i++) assert.ok(compareFeedRows(order, seen[i - 1], seen[i]) < 0, `row ${i} is out of order`);
    });
  }
}

test("oldest is exactly the reverse of newest when rank is constant", () => {
  const flat = dataset.map((r) => ({ ...r, rank: 0 }));
  assert.deepEqual(walk(flat, "oldest", 9), walk(flat, "newest", 9).reverse());
});

test("compareTimestamps resolves microsecond ties that Date would lose", () => {
  assert.equal(compareTimestamps("2026-09-19T10:00:00.000001+00:00", "2026-09-19T10:00:00.000002+00:00"), -1);
  assert.equal(compareTimestamps("2026-09-19T10:00:00.000002+00:00", "2026-09-19T10:00:00.000001+00:00"), 1);
  assert.equal(compareTimestamps("2026-09-19T10:00:00+00:00", "2026-09-19T10:00:00.000000+00:00"), 0);
  assert.equal(compareTimestamps("2026-09-19T10:00:01+00:00", "2026-09-19T10:00:00.999999+00:00"), 1);
});

test("nextFeedCursor comes from the last RAW row and stops on a short page", () => {
  const rows = [
    { id: "a", created_at: "2026-09-19T10:00:02.000000+00:00", sort_rank: "3" },
    { id: "b", created_at: "2026-09-19T10:00:01.000000+00:00", sort_rank: 2 },
  ];
  assert.deepEqual(nextFeedCursor(rows, 2), { rank: 2, createdAt: "2026-09-19T10:00:01.000000+00:00", id: "b" });
  assert.equal(nextFeedCursor(rows, 3), null);
  assert.equal(nextFeedCursor([], 3), null);
  // The SQL caps the limit at 50, so a full page of 50 continues even when 80 was asked for.
  const fifty = Array.from({ length: 50 }, (_, i) => ({ id: String(i), created_at: "2026-09-19T10:00:00.000000+00:00", sort_rank: 0 }));
  assert.ok(nextFeedCursor(fifty, 80));
});

test("used: copy_count descending first (like popular), then created_at and id descending", () => {
  const at = "2026-09-19T10:00:00.000000+00:00";
  const cursor = row(5, at, "m");
  assert.equal(isAfterCursor("used", row(4, "2026-09-19T11:00:00.000000+00:00", "z"), cursor), true, "fewer uses is after, even if newer");
  assert.equal(isAfterCursor("used", row(6, "2026-09-19T09:00:00.000000+00:00", "a"), cursor), false, "more uses is before");
  assert.equal(isAfterCursor("used", row(5, "2026-09-19T09:59:59.000000+00:00", "z"), cursor), true);
  assert.equal(isAfterCursor("used", row(0, at, "a"), row(0, at, "b")), true, "rank 0 rows (every non-prompt kind) fall back to newest-first");
});

test("Keşfet sort keys map to feed orders", () => {
  assert.equal(feedOrderForSort("most-used"), "used");
  assert.equal(feedOrderForSort("most-liked"), "popular");
  assert.equal(feedOrderForSort("newest"), "newest");
  assert.equal(feedOrderForSort("oldest"), "oldest");
  assert.equal(feedOrderForSort("recommended"), "recommended");
  assert.equal(feedOrderForSort("popular"), "popular", "Keşfet's Popüler is the like order, like the profile lists' most-liked");
});

test("popular ranks by like_count, used by copy_count (prompts only), the rest by nothing", () => {
  assert.equal(feedSortRank("popular", { likeCount: 9, copyCount: 4 }), 9);
  assert.equal(feedSortRank("used", { likeCount: 9, copyCount: 4 }), 4);
  assert.equal(feedSortRank("used", { likeCount: 9 }), 0, "non-prompt kinds have no use counter");
  assert.equal(feedSortRank("newest", { likeCount: 9, copyCount: 4 }), 0);
  assert.equal(feedSortRank("oldest", { likeCount: 9, copyCount: 4 }), 0);
});

test("recommended ranks by the engagement score (same numbers as supabase/tests/feed-filters.sql)", () => {
  // likes×3 + saves×2 + comments×2 + copies×2 (+ responses×2 on a request)
  assert.equal(feedSortRank("recommended", { likeCount: 5 }), 15);
  assert.equal(feedSortRank("recommended", { likeCount: 1, saveCount: 10 }), 23);
  assert.equal(feedSortRank("recommended", { likeCount: 0, copyCount: 7 }), 14);
  assert.equal(feedSortRank("recommended", { likeCount: 2, commentCount: 1, responseCount: 3 }), 14);
  assert.equal(feedSortRank("recommended", { likeCount: 0 }), 0);
  assert.equal(isAfterCursor("recommended", { rank: 14, createdAt: "2026-09-19T11:00:00.000000+00:00", id: "z" }, { rank: 15, createdAt: "2026-09-19T09:00:00.000000+00:00", id: "a" }), true, "a lower score is after, even if newer");
});

test("proven (docs/history/307-*): Keşfet's 'most-proven' sort maps to it, keyset is the same descending triple, the client ranks it 0 (the database decides)", () => {
  assert.equal(feedOrderForSort("most-proven"), "proven");
  const cursor = { rank: 500000, createdAt: "2026-09-19T10:00:00.000000+00:00", id: "m" };
  const row = (rank: number, createdAt: string, id: string) => ({ rank, createdAt, id });
  assert.equal(isAfterCursor("proven", row(400000, "2026-09-19T11:00:00.000000+00:00", "z"), cursor), true, "a lower Wilson score is after, even if newer");
  assert.equal(isAfterCursor("proven", row(600000, "2026-09-19T09:00:00.000000+00:00", "a"), cursor), false);
  assert.equal(isAfterCursor("proven", row(500000, "2026-09-19T09:00:00.000000+00:00", "a"), cursor), true, "same score: older is after");
  assert.equal(feedSortRank("proven", { likeCount: 99, copyCount: 99 }), 0);
});
