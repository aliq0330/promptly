import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { collectFiles, diff } from "../../../scripts/sync-function-shared.mjs";

test("public API core stays dependency-free and its Edge Function copy is current", () => {
  const files = collectFiles() as string[];
  assert.ok(files.includes("lib/public-api/index.ts"));
  assert.ok(files.includes("lib/exchange/prompt-format.ts"), "export format comes from the exchange core");
  assert.ok(!files.some((file) => file.includes("supabase/")), "no app data layer in the core");
  assert.deepEqual(diff(), [], "run: node scripts/sync-function-shared.mjs");
});

test("the Skill package core is vendored for the skill-package Edge Function and stays dependency-free (fflate is injected, not imported)", () => {
  const files = collectFiles(fileURLToPath(new URL("../skills/package-publish.ts", import.meta.url))) as string[];
  assert.ok(files.includes("lib/skills/package-validate.ts"));
  assert.ok(files.includes("lib/skills/package-build.ts"));
  assert.ok(files.includes("lib/skills/package-zip.ts"));
  assert.ok(!files.includes("lib/skills/zip.ts"), "the browser-only ZIP reader (fflate) never reaches the Edge copy");
  assert.deepEqual(diff(), []);
});
