import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows, SUPABASE_PAGE } from "./paged.ts";

/** A fake table of `n` numbered rows that, like PostgREST, answers at most 1000 rows per ranged request. */
function table(n: number, failOnCall = 0) {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    if (failOnCall && calls.length === failOnCall) return { data: null, error: { message: "boom" } };
    const rows = Array.from({ length: Math.max(0, Math.min(to + 1, n) - from) }, (_, i) => from + i);
    return { data: rows.slice(0, SUPABASE_PAGE), error: null };
  };
  return { page, calls };
}

test("fetchAllRows: a list longer than 1000 rows comes back whole (the old single request stopped at 1000)", async () => {
  const { page, calls } = table(3016);
  const { rows, truncated } = await fetchAllRows(page);
  assert.equal(rows.length, 3016);
  assert.equal(truncated, false);
  assert.deepEqual(rows.slice(998, 1002), [998, 999, 1000, 1001]);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999], [3000, 3999]]);
});

test("fetchAllRows: short lists take one request; an exact multiple of a page takes one extra empty one; nothing at all is an empty list", async () => {
  const short = table(10);
  assert.equal((await fetchAllRows(short.page)).rows.length, 10);
  assert.equal(short.calls.length, 1);
  const exact = table(2000);
  assert.equal((await fetchAllRows(exact.page)).rows.length, 2000);
  assert.equal(exact.calls.length, 3);
  assert.deepEqual((await fetchAllRows(table(0).page)).rows, []);
});

test("fetchAllRows: a failing page throws — half a list never passes for the whole one", async () => {
  await assert.rejects(fetchAllRows(table(3000, 2).page), /boom/);
});

test("fetchAllRows: the safety ceiling reports `truncated` instead of looping forever", async () => {
  const { rows, truncated } = await fetchAllRows(table(10_000).page, 3000);
  assert.equal(rows.length, 3000);
  assert.equal(truncated, true);
});
