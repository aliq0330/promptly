/**
 * Guard (docs/history/339-*): a workflow reaches a Space ONE way — as separate objects (step cards, prompts, images, arrows) through
 * `importOrSyncDirect` / the board import. The old single-picture frame (`kind='content'`, `content_type='workflow'`, docs/history/261-*) is read
 * for backwards compatibility but nothing may WRITE a new one: two write paths gave two different looks for the same action.
 * The workflow page's Space link must also come from the one RPC, and a read error must not be mistaken for "no link".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(path) && !path.endsWith(".test.ts") ? [path] : [];
  });
}

test("only known files write `kind: \"content\"` space items, and none of them can write a workflow frame", () => {
  // Space/workflow write code only (search tokens etc. also have an unrelated `kind: "content"`).
  const scope = [join(ROOT, "features/spaces"), join(ROOT, "features/workflows"), join(ROOT, "lib/supabase")].flatMap(sources).concat(
    readdirSync(join(ROOT, "lib")).filter((name) => /^(workflow|space)-.*\.ts$/.test(name) && !name.endsWith(".test.ts")).map((name) => join(ROOT, "lib", name)),
  );
  const writers = scope
    .filter((file) => /kind:\s*"content"/.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(ROOT.length))
    .sort();
  // add-to-space-modal: request/preset references; workflow-board-plan: legacy request-step reference. Anything new must be reviewed.
  assert.deepEqual(writers, ["features/spaces/add-to-space-modal.tsx", "lib/workflow-board-plan.ts"]);
});

test("\"Add to Space\" sends a workflow through the object import before any generic content draft", () => {
  const source = readFileSync(join(ROOT, "features/spaces/add-to-space-modal.tsx"), "utf8");
  assert.match(source, /importOrSyncDirect/);
  const dispatch = source.indexOf('if (target.type === "workflow") return addWorkflow');
  const generic = source.indexOf("const list = drafts(spaceId)");
  assert.ok(dispatch > 0 && generic > dispatch, "the workflow branch must run before the generic content draft");
});

test("workflow links come from the workflow_space_links RPC and a failed read throws", () => {
  const source = readFileSync(join(ROOT, "lib/supabase/workflow-flow.ts"), "utf8");
  const fn = source.slice(source.indexOf("export async function fetchWorkflowSpaceLinks"), source.indexOf("/** Prompt'ların görselleri"));
  assert.match(fn, /rpc\("workflow_space_links"/);
  assert.match(fn, /throw new Error/);
  assert.doesNotMatch(fn, /return \[\];/, "a read error must not look like \"no link\"");
});

test("the first import is one atomic RPC (no separate group/items/connections writes)", () => {
  const source = readFileSync(join(ROOT, "lib/supabase/workflow-board.ts"), "utf8");
  const fn = source.slice(source.indexOf("export async function runImport"), source.indexOf("/** \"Güncelle\" planını uygular"));
  assert.match(fn, /io\.applyImport/);
  assert.doesNotMatch(fn, /io\.addItems|io\.addConnections|createGroup/);
});
