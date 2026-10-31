import { test } from "node:test";
import assert from "node:assert/strict";
import { collectFiles, diff } from "../../../scripts/sync-function-shared.mjs";

test("public API core stays dependency-free and its Edge Function copy is current", () => {
  const files = collectFiles() as string[];
  assert.ok(files.includes("lib/public-api/index.ts"));
  assert.ok(files.includes("lib/exchange/prompt-format.ts"), "export format comes from the exchange core");
  assert.ok(!files.some((file) => file.includes("supabase/")), "no app data layer in the core");
  assert.deepEqual(diff(), [], "run: node scripts/sync-function-shared.mjs");
});
