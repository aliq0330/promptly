import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_SUMMARY,
  areaPoints,
  chartTicks,
  formatInsightDay,
  formatInsightNumber,
  hasNoActivity,
  insightPromptHref,
  totalApiUses,
  labelIndexes,
  linePoints,
  niceMax,
  peakIndex,
  promptHasNoActivity,
  reactionRows,
  reactionTotal,
  trendOf,
} from "./insights.ts";

test("trendOf: up/down are rounded absolute percents; previous 0 is 'new', not infinity", () => {
  assert.deepEqual(trendOf(124, 100), { kind: "up", percent: 24 });
  assert.deepEqual(trendOf(96, 100), { kind: "down", percent: 4 });
  assert.deepEqual(trendOf(40, 0), { kind: "new", percent: 0 });
  assert.deepEqual(trendOf(0, 0), { kind: "flat", percent: 0 });
  assert.deepEqual(trendOf(7, 7), { kind: "flat", percent: 0 });
  assert.deepEqual(trendOf(0, 5), { kind: "down", percent: 100 });
});

test("trendOf: a change that rounds to 0% is flat, not an arrow", () => {
  assert.deepEqual(trendOf(1001, 1000), { kind: "flat", percent: 0 });
});

test("niceMax is always a multiple of 4 and never below the data", () => {
  for (const v of [0, 1, 3, 4, 5, 9, 17, 78, 99, 101, 250, 1284, 99999]) {
    const m = niceMax(v);
    assert.ok(m >= Math.max(4, v), `${v} -> ${m}`);
    assert.equal(m % 4, 0, `${v} -> ${m}`);
  }
  assert.equal(niceMax(78), 80);
  assert.equal(niceMax(0), 4);
  assert.equal(niceMax(Number.NaN), 4);
});

test("chartTicks gives four equal steps from 0 to the max", () => {
  assert.deepEqual(chartTicks(80), [0, 20, 40, 60, 80]);
});

test("linePoints maps values into the box (y grows upward), clamps, and handles 0/1 points", () => {
  assert.equal(linePoints([], 100, 50, 10), "");
  assert.equal(linePoints([0, 10], 100, 50, 10), "0,50 100,0");
  assert.equal(linePoints([5, 20], 100, 50, 10), "0,25 100,0");
  assert.equal(linePoints([4], 100, 50, 8), "0,25 100,25");
  assert.equal(linePoints([3, 3, 3], 100, 50, 0), "0,0 50,0 100,0");
});

test("areaPoints closes the line down to the baseline", () => {
  assert.equal(areaPoints([0, 10], 100, 50, 10), "0,50 100,0 100,50 0,50");
  assert.equal(areaPoints([], 100, 50, 10), "");
});

test("peakIndex marks the highest day (latest on a tie) and nothing when all zero", () => {
  assert.equal(peakIndex([1, 5, 3, 5, 2]), 3);
  assert.equal(peakIndex([0, 0, 0]), -1);
  assert.equal(peakIndex([]), -1);
});

test("labelIndexes spreads labels evenly incl. first and last", () => {
  assert.deepEqual(labelIndexes(30, 5), [0, 7, 15, 22, 29]);
  assert.deepEqual(labelIndexes(3, 5), [0, 1, 2]);
  assert.deepEqual(labelIndexes(0), []);
});

test("reactionRows drops unknown/zero rows, sorts big→small, bars are relative to the top", () => {
  const rows = reactionRows([
    { reaction: "fire", n: 167 },
    { reaction: "love", n: 214 },
    { reaction: "party", n: 999 },
    { reaction: "haha", n: 0 },
    { reaction: "idea", n: 2 },
  ]);
  assert.deepEqual(rows.map((r) => r.reaction), ["love", "fire", "idea"]);
  assert.equal(rows[0].barPercent, 100);
  assert.equal(rows[1].barPercent, 78);
  assert.equal(rows[2].barPercent, 3, "a tiny but real count still shows a visible bar");
  assert.equal(reactionTotal(rows), 383);
});

test("hasNoActivity is true only when every number, day and list is empty", () => {
  const empty = [{ day: "2026-10-31", copies: 0, reactions: 0, comments: 0 }];
  assert.equal(hasNoActivity(EMPTY_SUMMARY, empty, []), true);
  assert.equal(hasNoActivity({ ...EMPTY_SUMMARY, prevCopies: 1 }, empty, []), false, "activity only in the previous period still counts");
  assert.equal(hasNoActivity(EMPTY_SUMMARY, [{ day: "2026-10-31", copies: 1, reactions: 0, comments: 0 }], []), false);
});

test("date and number formatting follow the language and ignore the machine's time zone", () => {
  assert.equal(formatInsightDay("2026-10-31", "en"), "Oct 31");
  assert.match(formatInsightDay("2026-10-31", "tr"), /^31 Eki/);
  assert.equal(formatInsightDay("not-a-date", "tr"), "not-a-date");
  assert.equal(formatInsightNumber(1284, "en"), "1,284");
  assert.match(formatInsightNumber(1284, "tr"), /^1\.284$/);
});

test("hasNoActivity also counts shared results (this and the previous period)", () => {
  const empty = [{ day: "2026-10-31", copies: 0, reactions: 0, comments: 0 }];
  assert.equal(hasNoActivity({ ...EMPTY_SUMMARY, results: 1 }, empty, []), false);
  assert.equal(hasNoActivity({ ...EMPTY_SUMMARY, prevResults: 2 }, empty, []), false);
});

test("promptHasNoActivity: all numbers, previous period and daily series (incl. results) must be empty", () => {
  const zero = { title: "t", contentType: "text", tools: [], copies: 0, prevCopies: 0, reactions: 0, prevReactions: 0, comments: 0, prevComments: 0, saves: 0, prevSaves: 0, results: 0, prevResults: 0, apiUses: 0, prevApiUses: 0, mcpUses: 0, prevMcpUses: 0 };
  const quiet = [{ day: "2026-10-31", copies: 0, reactions: 0, comments: 0, results: 0 }];
  assert.equal(promptHasNoActivity(zero, quiet), true);
  assert.equal(promptHasNoActivity({ ...zero, prevSaves: 1 }, quiet), false);
  assert.equal(promptHasNoActivity(zero, [{ day: "2026-10-31", copies: 0, reactions: 0, comments: 0, results: 1 }]), false);
  assert.equal(promptHasNoActivity(zero, [{ day: "2026-10-31", copies: 0, reactions: 0, comments: 0 }]), true, "results is optional on the series");
});

test("API / MCP uses count as activity in either period (so a creator with only API use does not see the empty state)", () => {
  const empty = [{ day: "2026-10-31", copies: 0, reactions: 0, comments: 0 }];
  for (const key of ["apiUses", "prevApiUses", "mcpUses", "prevMcpUses"] as const) {
    assert.equal(hasNoActivity({ ...EMPTY_SUMMARY, [key]: 1 }, empty, []), false, key);
  }
  const zero = { title: "t", contentType: "text", tools: [], copies: 0, prevCopies: 0, reactions: 0, prevReactions: 0, comments: 0, prevComments: 0, saves: 0, prevSaves: 0, results: 0, prevResults: 0, apiUses: 0, prevApiUses: 0, mcpUses: 0, prevMcpUses: 0 };
  assert.equal(promptHasNoActivity({ ...zero, mcpUses: 3 }, empty), false);
  assert.equal(promptHasNoActivity({ ...zero, prevApiUses: 3 }, empty), false);
});

test("totalApiUses adds API and MCP, this period and the previous one separately", () => {
  assert.deepEqual(totalApiUses({ apiUses: 4, prevApiUses: 1, mcpUses: 6, prevMcpUses: 2 }), { current: 10, previous: 3 });
  assert.deepEqual(totalApiUses(EMPTY_SUMMARY), { current: 0, previous: 0 });
});

test("insightPromptHref uses the static-export /x/local?id= shape", () => {
  assert.equal(insightPromptHref("abc"), "/insights/local?id=abc");
});
