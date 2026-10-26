import { test } from "node:test";
import assert from "node:assert/strict";
import { runBatches, type BulkBatchReport } from "./bulk.ts";
import type { ExchangePrompt } from "./prompt-format.ts";

const item = (i: number): ExchangePrompt => ({ title: `P${i}`, description: "", promptText: `t${i}`, contentType: "text", category: null, subcategory: null, tools: [], tags: [], variables: [] });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
const okReport = (batch: ExchangePrompt[], dry = false): BulkBatchReport => ({ ok: true, created: dry ? 0 : batch.length, published: 0, items: batch.map((_, i) => ({ index: i + 1, status: "ok" as const })) });

test("splits into batches of the given size, in order, and reports progress after each", async () => {
  const sizes: number[] = [];
  const progress: number[] = [];
  const outcome = await runBatches(items(120), 50, async (batch) => { sizes.push(batch.length); return okReport(batch); }, { onProgress: (p) => progress.push(p.done) });
  assert.deepEqual(sizes, [50, 50, 20]);
  assert.deepEqual(progress, [50, 100, 120]);
  assert.equal(outcome.done, 120);
  assert.equal(outcome.created, 120);
  assert.equal(outcome.newCount, 120);
  assert.equal(outcome.stoppedAt, null);
  assert.equal(outcome.error, null);
});

test("counts duplicates / invalid / warnings and maps batch-local indices to overall positions with the title", async () => {
  const outcome = await runBatches(items(6), 3, async (batch) => ({
    ok: true, created: 1, published: 1,
    items: batch.map((_, i) => (i === 0 ? { index: 1, status: "ok" as const, warnings: ["category_dropped"] } : i === 1 ? { index: 2, status: "duplicate" as const } : { index: 3, status: "invalid" as const, field: "title", code: "required" })),
  }));
  assert.equal(outcome.newCount, 2);
  assert.equal(outcome.duplicates, 2);
  assert.equal(outcome.invalid, 2);
  assert.equal(outcome.warnings, 2);
  assert.equal(outcome.created, 2);
  assert.equal(outcome.published, 2);
  assert.deepEqual(outcome.invalidItems.map((x) => [x.index, x.title, x.field, x.code]), [[3, "P3", "title", "required"], [6, "P6", "title", "required"]]);
});

test("a failing batch stops the run, keeps what was already written and says where to resume", async () => {
  let calls = 0;
  const outcome = await runBatches(items(150), 50, async (batch) => {
    calls += 1;
    if (calls === 2) throw new Error("Yetkisiz.");
    return okReport(batch);
  });
  assert.equal(calls, 2, "no further batch is sent after the error");
  assert.equal(outcome.done, 50);
  assert.equal(outcome.created, 50);
  assert.equal(outcome.stoppedAt, 50);
  assert.equal(outcome.error, "Yetkisiz.");
});

test("'Durdur' is honoured between batches (never mid-batch)", async () => {
  let stop = false;
  let calls = 0;
  const outcome = await runBatches(items(200), 50, async (batch) => { calls += 1; stop = calls === 2; return okReport(batch); }, { shouldStop: () => stop });
  assert.equal(calls, 2);
  assert.equal(outcome.done, 100);
  assert.equal(outcome.stoppedAt, 100);
  assert.equal(outcome.error, null);
});

test("dry run: 'new' counts what WOULD be added while created stays 0; empty input is a no-op", async () => {
  const outcome = await runBatches(items(10), 4, async (batch) => okReport(batch, true));
  assert.equal(outcome.newCount, 10);
  assert.equal(outcome.created, 0);
  const empty = await runBatches([], 50, async () => { throw new Error("must not be called"); });
  assert.equal(empty.done, 0);
  assert.equal(empty.stoppedAt, null);
});

import { runChunks } from "./bulk.ts";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i + 1}`);

test("runChunks: sends the ids in order in chunks, sums affected/skipped and reports progress", async () => {
  const seen: string[][] = [];
  const progress: number[] = [];
  const outcome = await runChunks(ids(250), 100, async (chunk) => { seen.push(chunk); return { affected: chunk.length - 1, skipped: 1 }; }, { onProgress: (p) => progress.push(p.done) });
  assert.deepEqual(seen.map((c) => c.length), [100, 100, 50]);
  assert.deepEqual([seen[0][0], seen[1][0], seen[2][0]], ["id-1", "id-101", "id-201"]);
  assert.deepEqual(progress, [100, 200, 250]);
  assert.equal(outcome.affected, 247);
  assert.equal(outcome.skipped, 3);
  assert.equal(outcome.stoppedAt, null);
});

test("runChunks: an error stops the run and says where to resume; 'Durdur' stops between chunks; empty is a no-op", async () => {
  let calls = 0;
  const failed = await runChunks(ids(300), 100, async (chunk) => { calls += 1; if (calls === 2) throw new Error("Yetkisiz."); return { affected: chunk.length, skipped: 0 }; });
  assert.equal(calls, 2);
  assert.equal(failed.affected, 100);
  assert.equal(failed.stoppedAt, 100);
  assert.equal(failed.error, "Yetkisiz.");

  let stop = false;
  let n = 0;
  const stopped = await runChunks(ids(300), 100, async (chunk) => { n += 1; stop = n === 1; return { affected: chunk.length, skipped: 0 }; }, { shouldStop: () => stop });
  assert.equal(n, 1);
  assert.equal(stopped.stoppedAt, 100);
  assert.equal(stopped.error, null);

  const empty = await runChunks([], 100, async () => { throw new Error("must not be called"); });
  assert.equal(empty.done, 0);
  assert.equal(empty.stoppedAt, null);
});
